output "photo_bucket" {
  description = "BUCKET for the api and importer"
  value       = google_storage_bucket.photos.name
}

output "image_base_url" {
  description = "IMAGE_BASE_URL for the api, web and importer"
  value       = "https://storage.googleapis.com/${google_storage_bucket.photos.name}"
}

output "firebase_web_config" {
  description = "VITE_FIREBASE_* build variables for the web app (public by design)"
  value = {
    VITE_FIREBASE_API_KEY     = data.google_firebase_web_app_config.admin.api_key
    VITE_FIREBASE_AUTH_DOMAIN = data.google_firebase_web_app_config.admin.auth_domain
    VITE_FIREBASE_PROJECT_ID  = var.project_id
  }
}
