#!/bin/sh
# Builds both images with Cloud Build and rolls them out to Cloud Run.
# Images are tagged with the git commit; uncommitted changes add "-dirty-<unix time>" so every
# dirty build keeps its own tag.
set -eu
cd "$(dirname "$0")/.."

tf_output() { terraform -chdir=infra/main output -json "$1"; }
deploy=$(tf_output deploy)
firebase=$(tf_output firebase_web_config)
field() { printf '%s' "$1" | jq -r "$2"; }

repo=$(field "$deploy" .image_repo)
region=$(field "$deploy" .region)
tag=$(git rev-parse --short HEAD)
[ -z "$(git status --porcelain)" ] || tag="$tag-dirty-$(date +%s)"

gcloud builds submit \
  --region="$region" \
  --config=infra/cloudbuild.yaml \
  --service-account="$(field "$deploy" .build_service_acct)" \
  --gcs-source-staging-dir="gs://$(field "$deploy" .build_source_bucket)/source" \
  --substitutions="_REPO=$repo,_TAG=$tag,\
_VITE_FIREBASE_API_KEY=$(field "$firebase" .VITE_FIREBASE_API_KEY),\
_VITE_FIREBASE_AUTH_DOMAIN=$(field "$firebase" .VITE_FIREBASE_AUTH_DOMAIN),\
_VITE_FIREBASE_PROJECT_ID=$(field "$firebase" .VITE_FIREBASE_PROJECT_ID)"

# The api first, like CI; --to-latest undoes a manual rollback pin.
for app in api web; do
  service=$(field "$deploy" ".${app}_service")
  gcloud run services update "$service" --region="$region" --image="$repo/$app:$tag"
  gcloud run services update-traffic "$service" --region="$region" --to-latest
done
echo "Deployed $tag: $(terraform -chdir=infra/main output -raw site_url)"
