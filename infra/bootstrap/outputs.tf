output "tfstate_bucket" {
  description = "Bucket name for the gcs backend of infra/main"
  value       = google_storage_bucket.tfstate.name
}
