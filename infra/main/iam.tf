# One service account per workload, each with only what it uses.

resource "google_service_account" "api" {
  account_id   = "vinyl-api"
  display_name = "Vinyl Rehab api (Cloud Run)"
  depends_on   = [google_project_service.enabled]
}

resource "google_service_account" "web" {
  account_id   = "vinyl-web"
  display_name = "Vinyl Rehab web (Cloud Run)"
  depends_on   = [google_project_service.enabled]
}

resource "google_service_account" "build" {
  account_id   = "vinyl-build"
  display_name = "Vinyl Rehab image builds (Cloud Build)"
  depends_on   = [google_project_service.enabled]
}

# api: Firestore read/write, both photo buckets, and signing its own upload URLs (signBlob).
resource "google_project_iam_member" "api_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = google_service_account.api.member
}

resource "google_storage_bucket_iam_member" "api_photos" {
  bucket = google_storage_bucket.photos.name
  role   = "roles/storage.objectUser"
  member = google_service_account.api.member
}

resource "google_storage_bucket_iam_member" "api_uploads" {
  bucket = google_storage_bucket.uploads.name
  role   = "roles/storage.objectUser"
  member = google_service_account.api.member
}

resource "google_service_account_iam_member" "api_signs_urls" {
  service_account_id = google_service_account.api.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = google_service_account.api.member
}

# web: may call the api and nothing else.
resource "google_cloud_run_v2_service_iam_member" "web_invokes_api" {
  name   = google_cloud_run_v2_service.api.name
  role   = "roles/run.invoker"
  member = google_service_account.web.member
}

# build: read uploaded sources, push images, write build logs.
resource "google_storage_bucket_iam_member" "build_sources" {
  bucket = google_storage_bucket.build_sources.name
  role   = "roles/storage.objectViewer"
  member = google_service_account.build.member
}

resource "google_artifact_registry_repository_iam_member" "build_push" {
  repository = google_artifact_registry_repository.images.name
  location   = var.region
  role       = "roles/artifactregistry.writer"
  member     = google_service_account.build.member
}

resource "google_project_iam_member" "build_logs" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = google_service_account.build.member
}
