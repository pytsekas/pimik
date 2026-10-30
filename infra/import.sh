#!/bin/sh
# Imports https://vinyl.rehab into the production Firestore and photo bucket, as you (gcloud
# application-default credentials). Safe to run again; see "Importing the WordPress site" in
# the root README.
set -eu
cd "$(dirname "$0")/.."

tf() { terraform -chdir=infra/main output -raw "$1"; }

# env -i: nothing from the shell or .env (emulator hosts above all) reaches the importer.
# NODE_ENV=production makes the api config refuse emulator hosts as a second guard.
exec env -i PATH="$PATH" HOME="$HOME" \
  NODE_ENV=production \
  GCLOUD_PROJECT="$(terraform -chdir=infra/main output -json firebase_web_config | jq -r .VITE_FIREBASE_PROJECT_ID)" \
  BUCKET="$(tf photo_bucket)" \
  IMAGE_BASE_URL="$(tf image_base_url)" \
  ADMIN_EMAILS="$(tf admin_emails)" \
  node scripts/import-wordpress/run.ts
