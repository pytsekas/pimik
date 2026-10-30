resource "google_storage_bucket" "photos" {
  name                        = "${var.name_prefix}-photos"
  location                    = var.region
  uniform_bucket_level_access = true

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.enabled]
}

# Photos are served straight from the bucket (IMAGE_BASE_URL). Only the api writes here, and only
# sanitized images; raw browser uploads go to the private uploads bucket below.
resource "google_storage_bucket_iam_member" "photos_public_read" {
  bucket = google_storage_bucket.photos.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# The admin uploads straight from the browser with signed URLs; /complete moves the sanitized
# result to the photo bucket and deletes the upload. Abandoned uploads expire after a day.
locals {
  # A plain string, not a reference: the api needs the name, and the bucket's CORS needs the web
  # URL, which needs the api URL.
  upload_bucket = "${var.name_prefix}-photos-uploads"
}

resource "google_storage_bucket" "uploads" {
  name                        = local.upload_bucket
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  cors {
    origin          = concat(var.upload_origins, google_cloud_run_v2_service.web.urls)
    method          = ["PUT"]
    response_header = ["Content-Type"]
    max_age_seconds = 3600
  }

  lifecycle_rule {
    condition {
      age = 1
    }
    action {
      type = "Delete"
    }
  }

  depends_on = [google_project_service.enabled]
}

# Source archives that `gcloud builds submit` uploads (see infra/deploy.sh).
resource "google_storage_bucket" "build_sources" {
  name                        = "${var.name_prefix}-build-sources"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  lifecycle_rule {
    condition {
      age = 7
    }
    action {
      type = "Delete"
    }
  }

  depends_on = [google_project_service.enabled]
}
