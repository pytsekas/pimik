# Infrastructure (GCP project `experiment-stash`, region `europe-north1`)

Every resource is named after the repo: `name_prefix` (default `pimik`) in `main/` and
`bootstrap/`. Bucket names are global, so they are bare (`pimik-photos`), not project-prefixed.

- `bootstrap/` - the Terraform state bucket `pimik-tfstate`. Applied once; its own state lives in
  that bucket under `bootstrap/`.
- `main/` - everything else (APIs, Firestore, photo buckets, Firebase Auth and Hosting, Cloud Run,
  CI deploy identity). State under `main/`.

```sh
terraform -chdir=infra/main init
terraform -chdir=infra/main plan -out=main.tfplan
terraform -chdir=infra/main apply main.tfplan
```

Firestore indexes come from the repo's `firestore.indexes.json`, the same file the emulators use.

## Deploying the apps

```sh
infra/deploy.sh
```

Builds both images with Cloud Build (amd64, service account `pimik-build`), tags them with the git
commit, points the `pimik-api` and `pimik-web` Cloud Run services at them, and sends all traffic
to the new revisions. Terraform creates the services with a placeholder image and ignores image
changes, so applying never rolls back a deploy.

- `pimik-web` is public; `pimik-api` only accepts the `pimik-web` service account, which sends a
  Google ID token in `X-Serverless-Authorization` (`API_AUDIENCE`).
- Browser uploads go to the private `pimik-photos-uploads` bucket; the api publishes only
  sanitized photos to the public `pimik-photos` bucket. Leftover uploads are deleted after a day.
- `ADMIN_EMAILS` comes from `admin_emails` in `main/terraform.tfvars`.

## CI and automatic deploys

`.github/workflows/ci.yml` runs on every pull request and every push to `main`:

- `check`: `pnpm check`, `pnpm test`, the web build and `pnpm e2e`, with the Firestore and Auth
  emulators and a fake-gcs-server container, as locally.
- `deploy` (push to `main` only, after `check` passes): builds both Dockerfile targets, pushes
  them to Artifact Registry tagged with the short commit, and updates `pimik-api`, then
  `pimik-web`. Deploys never overlap; a newer push replaces one still waiting, so the latest
  commit always ends up deployed.

GitHub holds no keys. The job signs in through Workload Identity Federation (`main/github.tf`,
pool `pimik-github`) as `pimik-deploy`, which may only push images and update the two services.
Only push events on `main` running `.github/workflows/ci.yml` of the repository with id
`github_repository_id` can sign in, so pull requests, forks, other workflows and a repo that later
takes over the name get nothing. `pimik-deploy` may run either service as either runtime account
(`pimik-api` or `pimik-web`), so treat changes to `ci.yml` on `main` like changes to IAM.

The deploy job is skipped until the repository variables are set. After applying `main/`:

```sh
terraform -chdir=infra/main output -json github_variables \
  | jq -r 'to_entries[] | "\(.key)\t\(.value)"' \
  | while IFS="$(printf '\t')" read -r name value; do gh variable set "$name" --body "$value"; done
```

They are variables, not secrets: the Firebase web config is public by design and the rest are
resource names.

Rolling back is pointing traffic at the previous revision:

```sh
gcloud run revisions list --service=pimik-web --region=europe-north1
gcloud run services update-traffic pimik-web --region=europe-north1 --to-revisions=REVISION=100
```

A pinned revision keeps all traffic until the next deploy (CI or `infra/deploy.sh`), which sends
it back to the latest revision.

## Site address

Until the domain moves, the site lives at https://pimik.web.app, the Firebase Hosting site
`pimik`, which rewrites every request to `pimik-web`. The project's default site
https://experiment-stash.web.app can't be renamed or deleted; it serves the same content and the
`/__/auth/handler` page Google sign-in uses. `SITE_URL` stays `https://vinyl.rehab`, so canonical
links treat the Google URLs as copies of the WordPress site and its search ranking isn't split.

Moving vinyl.rehab off WordPress later (DNS is at zone.ee; leave the MX and SPF records alone):

1. Set `custom_domain_enabled = true` in `main/terraform.tfvars` and apply; the records to add are
   in `terraform -chdir=infra/main output hosting_dns_records`.
2. Add the `hosting-site=…` TXT record at zone.ee and lower the A/CNAME TTLs to 300 s.
3. Run `infra/import.sh` one last time, then point the A record at the Hosting IP and `www` at
   `pimik.web.app`. Firebase issues the certificate within about an hour.
4. Rollback is putting the old A record back; keep the WordPress hosting and an export until the
   new site has run for a while.

## Importing WordPress into production

```sh
infra/import.sh
```

Runs the same importer as `pnpm import` (see the root README) against the production Firestore and
photo bucket, as your gcloud application-default credentials. It starts from an empty environment
with `NODE_ENV=production`, so emulator settings from `.env` or the shell can't leak in.

## One-off: moving to the pimik names (October 2026)

Resources used to be called `vinyl-*`, `vinyl-rehab` and `experiment-stash-*`. GCP can't rename
buckets, service accounts, services or repositories, so the new ones are created and the old ones
deleted. Photos are copied; Firestore stores paths relative to `IMAGE_BASE_URL`, so no data
changes. The two old buckets that hold data are only forgotten by Terraform (`state rm`) and stay
as backups. Run everything from the repo root on an up-to-date `main` that contains this change.

The site is down from step 3 until step 6 finishes, about 15 minutes. Don't run `infra/deploy.sh`
or publish posts between steps 1 and 6.

1. **State bucket.** Create `pimik-tfstate` and move both states into it. The `-reconfigure`
   lines point each config at the old bucket first, so this also works from a fresh clone.

   ```sh
   terraform -chdir=infra/bootstrap init -reconfigure -backend-config=bucket=experiment-stash-tfstate
   terraform -chdir=infra/bootstrap state rm google_storage_bucket.tfstate
   terraform -chdir=infra/bootstrap apply
   terraform -chdir=infra/bootstrap init -migrate-state -force-copy
   terraform -chdir=infra/main init -reconfigure -backend-config=bucket=experiment-stash-tfstate
   terraform -chdir=infra/main init -migrate-state -force-copy
   terraform -chdir=infra/main state list | wc -l   # about 50, not 0
   ```

   From now on the old `experiment-stash-tfstate` holds a stale copy. Never run Terraform from a
   checkout older than this change.

2. **Forget what can't be replaced in place.** The old photos bucket (`prevent_destroy`) stays as
   a backup. The old Cloud Run services have deletion protection recorded in state, so Terraform
   can't replace them; step 3 deletes them by hand instead.

   ```sh
   terraform -chdir=infra/main state rm \
     google_storage_bucket.photos \
     google_cloud_run_v2_service.api google_cloud_run_v2_service.web \
     google_cloud_run_v2_service_iam_member.web_public \
     google_cloud_run_v2_service_iam_member.web_invokes_api
   ```

3. **Delete the old services.** The site goes down here.

   ```sh
   gcloud run services delete vinyl-web --region=europe-north1 --quiet
   gcloud run services delete vinyl-api --region=europe-north1 --quiet
   ```

4. **Apply.** The plan should show about 34 to add, 1 to change and 18 to destroy, and none of the
   destroys should be the old photos or state bucket. It also does the following:
   - Deletes the `vinyl-rehab` registry with its images. A rollback means rebuilding from git.
   - Makes the old photos bucket private. Old absolute photo URLs stop working, and the backup
     stays intact.
   - Removes the `vinyl.rehab` and `www.vinyl.rehab` custom-domain registrations from the default
     site. They're registered again on the `pimik` site when `custom_domain_enabled` is turned on.
     Delete any TXT or ACME records you added for them at zone.ee.

   `pimik-api` and `pimik-web` start with the placeholder image. A destroy of the old uploads or
   build sources bucket fails if a leftover object is still in it. If that happens, empty the
   bucket and apply again. Apply again too if Cloud Run reports a missing service account, because
   new accounts take a moment to propagate.

   ```sh
   terraform -chdir=infra/main plan -out=main.tfplan
   terraform -chdir=infra/main apply main.tfplan
   ```

5. **Copy the photos and check.** Both lines must show the same count and size:

   ```sh
   gcloud storage rsync --recursive gs://experiment-stash-vinyl-rehab-photos gs://pimik-photos
   for b in experiment-stash-vinyl-rehab-photos pimik-photos; do
     echo "$b $(gcloud storage ls -r "gs://$b/**" | wc -l) $(gcloud storage du -s "gs://$b")"
   done
   ```

6. **Deploy.** Set the GitHub variables (snippet above), then run `infra/deploy.sh`. The next push
   to `main` deploys through CI; watch that first run.

7. **OAuth client.** In Google Auth Platform → **Clients** → `vinyl-rehab-web`, add
   `https://pimik.web.app` to the authorized JavaScript origins.

8. **Smoke test** https://pimik.web.app after a few minutes, because new IAM bindings take a
   moment to propagate. Check the home page, a post with photos, `/feed`, admin sign-in and a test
   upload, then delete the test post.

9. **After a week**, delete the backups:

   ```sh
   gcloud storage rm --recursive gs://experiment-stash-vinyl-rehab-photos
   gcloud storage rm --recursive --all-versions gs://experiment-stash-tfstate
   ```

## Manual steps (Google offers no API for them)

### Google sign-in OAuth client

Do this before the first apply of `main/`, which reads the client from Secret Manager.

1. Google Auth Platform → **Get started** (console.cloud.google.com/auth/overview?project=experiment-stash):
   app name `Vinyl Rehab`, your email as support and contact email, audience **External**.
2. **Audience** → **Publish app**. Sign-in asks only for email and profile, so no verification is needed.
3. **Clients** → **Create client** → type **Web application**, name `vinyl-rehab-web`:
   - Authorized JavaScript origins: `https://vinyl.rehab`, `https://pimik.web.app`,
     `https://experiment-stash.firebaseapp.com`
   - Authorized redirect URIs: `https://experiment-stash.firebaseapp.com/__/auth/handler`
4. In the "OAuth client created" dialog choose **Download JSON** (the secret is shown only once).
5. Store it in Secret Manager and delete the download:

   ```sh
   gcloud secrets create google-oauth-client --replication-policy=user-managed \
     --locations=europe-north1 --data-file="$HOME/Downloads/client_secret_XXXX.json"
   rm "$HOME/Downloads/client_secret_XXXX.json"
   ```

To rotate the client secret, add a new version with `gcloud secrets versions add` and apply again.
