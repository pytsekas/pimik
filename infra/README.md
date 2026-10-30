# Infrastructure (GCP project `experiment-stash`, region `europe-north1`)

- `bootstrap/` - the Terraform state bucket `experiment-stash-tfstate`. Applied once; its own
  state lives in that bucket under `bootstrap/`.
- `main/` - everything else (APIs, Firestore, photo bucket, Firebase Auth). State under `main/`.

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

Builds both images with Cloud Build (amd64, service account `vinyl-build`), tags them with the git
commit, and points the `vinyl-api` and `vinyl-web` Cloud Run services at them. Terraform creates
the services with a placeholder image and ignores image changes, so applying never rolls back a
deploy.

- `vinyl-web` is public; `vinyl-api` only accepts the `vinyl-web` service account, which sends a
  Google ID token in `X-Serverless-Authorization` (`API_AUDIENCE`).
- Browser uploads go to the private `…-photos-uploads` bucket; the api publishes only sanitized
  photos to the public `…-photos` bucket. Leftover uploads are deleted after a day.
- `ADMIN_EMAILS` comes from `admin_emails` in `main/terraform.tfvars`.

## CI and automatic deploys

`.github/workflows/ci.yml` runs on every pull request and every push to `main`:

- `check`: `pnpm check`, `pnpm test`, the web build and `pnpm e2e`, with the Firestore and Auth
  emulators and a fake-gcs-server container, as locally.
- `deploy` (push to `main` only, after `check` passes): builds both Dockerfile targets, pushes
  them to Artifact Registry tagged with the short commit, and updates `vinyl-api`, then
  `vinyl-web`. Deploys never overlap; a newer push replaces one still waiting, so the latest
  commit always ends up deployed.

GitHub holds no keys. The job signs in through Workload Identity Federation (`main/github.tf`) as
`vinyl-deploy`, which may only push images and update the two services. Only push events on
`main` running `.github/workflows/ci.yml` of the repository with id `github_repository_id` can
sign in, so pull requests, forks, other workflows and a repo that later takes over the name get
nothing. `vinyl-deploy` may run either service as either runtime account (`vinyl-api` or
`vinyl-web`), so treat changes to `ci.yml` on `main` like changes to IAM.

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
gcloud run revisions list --service=vinyl-web --region=europe-north1
gcloud run services update-traffic vinyl-web --region=europe-north1 --to-revisions=REVISION=100
```

A pinned revision keeps all traffic until the next CI deploy, which sends it back to the latest
revision. `infra/deploy.sh` still works as a manual deploy through Cloud Build, but it doesn't
undo a pin. After it, run this for each pinned service (`vinyl-api` or `vinyl-web`):

```sh
gcloud run services update-traffic vinyl-web --region=europe-north1 --to-latest
```

## Site address

Until the domain moves, the site lives at https://experiment-stash.web.app (Firebase Hosting, which
rewrites every request to `vinyl-web`). `SITE_URL` stays `https://vinyl.rehab`, so canonical links
treat the Google URL as a copy of the WordPress site and its search ranking isn't split.

Moving vinyl.rehab off WordPress later (DNS is at zone.ee; leave the MX and SPF records alone):

1. Set `custom_domain_enabled = true` in `main/terraform.tfvars` and apply; the records to add are
   in `terraform -chdir=infra/main output hosting_dns_records`.
2. Add the `hosting-site=…` TXT record at zone.ee and lower the A/CNAME TTLs to 300 s.
3. Run `infra/import.sh` one last time, then point the A record at the Hosting IP and `www` at
   `experiment-stash.web.app`. Firebase issues the certificate within about an hour.
4. Rollback is putting the old A record back; keep the WordPress hosting and an export until the
   new site has run for a while.

## Importing WordPress into production

```sh
infra/import.sh
```

Runs the same importer as `pnpm import` (see the root README) against the production Firestore and
photo bucket, as your gcloud application-default credentials. It starts from an empty environment
with `NODE_ENV=production`, so emulator settings from `.env` or the shell can't leak in.

## Manual steps (Google offers no API for them)

### Google sign-in OAuth client

Do this before the first apply of `main/`, which reads the client from Secret Manager.

1. Google Auth Platform → **Get started** (console.cloud.google.com/auth/overview?project=experiment-stash):
   app name `Vinyl Rehab`, your email as support and contact email, audience **External**.
2. **Audience** → **Publish app**. Sign-in asks only for email and profile, so no verification is needed.
3. **Clients** → **Create client** → type **Web application**, name `vinyl-rehab-web`:
   - Authorized JavaScript origins: `https://vinyl.rehab`, `https://experiment-stash.firebaseapp.com`
   - Authorized redirect URIs: `https://experiment-stash.firebaseapp.com/__/auth/handler`
4. In the "OAuth client created" dialog choose **Download JSON** (the secret is shown only once).
5. Store it in Secret Manager and delete the download:

   ```sh
   gcloud secrets create google-oauth-client --replication-policy=user-managed \
     --locations=europe-north1 --data-file="$HOME/Downloads/client_secret_XXXX.json"
   rm "$HOME/Downloads/client_secret_XXXX.json"
   ```

To rotate the client secret, add a new version with `gcloud secrets versions add` and apply again.
