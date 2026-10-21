locals {
  image_base_url = "https://storage.googleapis.com/${google_storage_bucket.photos.name}"
}

output "photo_bucket" {
  description = "BUCKET for the api and importer"
  value       = google_storage_bucket.photos.name
}

output "upload_bucket" {
  description = "UPLOAD_BUCKET for the api"
  value       = google_storage_bucket.uploads.name
}

output "image_base_url" {
  description = "IMAGE_BASE_URL for the api, web and importer"
  value       = local.image_base_url
}

output "firebase_web_config" {
  description = "VITE_FIREBASE_* build variables for the web app (public by design)"
  value = {
    VITE_FIREBASE_API_KEY     = data.google_firebase_web_app_config.admin.api_key
    VITE_FIREBASE_AUTH_DOMAIN = data.google_firebase_web_app_config.admin.auth_domain
    VITE_FIREBASE_PROJECT_ID  = var.project_id
  }
}

output "web_url" {
  description = "The site's Cloud Run URL (until the domain points at it)"
  value       = google_cloud_run_v2_service.web.uri
}

output "api_url" {
  description = "The api's Cloud Run URL; only the web service account may call it"
  value       = google_cloud_run_v2_service.api.uri
}

output "deploy" {
  description = "Values infra/deploy.sh reads"
  value = {
    image_repo          = local.image_repo
    build_service_acct  = google_service_account.build.id
    build_source_bucket = google_storage_bucket.build_sources.name
    region              = var.region
  }
}
