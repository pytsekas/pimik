resource "google_storage_bucket" "photos" {
  name                        = "${var.project_id}-vinyl-rehab-photos"
  location                    = var.region
  uniform_bucket_level_access = true

  # The admin uploads straight from the browser with signed URLs.
  cors {
    origin          = var.upload_origins
    method          = ["PUT"]
    response_header = ["Content-Type"]
    max_age_seconds = 3600
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.enabled]
}

# Photos are served straight from the bucket (IMAGE_BASE_URL).
resource "google_storage_bucket_iam_member" "photos_public_read" {
  bucket = google_storage_bucket.photos.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}
