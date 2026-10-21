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
