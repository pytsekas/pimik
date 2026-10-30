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

output "admin_emails" {
  description = "ADMIN_EMAILS as the api receives it"
  value       = join(",", var.admin_emails)
}

output "hosting_dns_records" {
  description = "DNS records Firebase Hosting wants for the domain (empty until custom_domain_enabled)"
  value = {
    for domain in concat(
      google_firebase_hosting_custom_domain.apex,
      google_firebase_hosting_custom_domain.www,
      ) : domain.custom_domain => {
      host_state      = domain.host_state
      ownership_state = domain.ownership_state
      desired = flatten([
        for update in domain.required_dns_updates : [
          for desired in update.desired : [
            for record in desired.records : {
              domain = record.domain_name
              type   = record.type
              value  = record.rdata
              action = record.required_action
            }
          ]
        ]
      ])
    }
  }
}

output "site_url" {
  description = "Where the site is served until the custom domain is enabled"
  value       = "https://${var.project_id}.web.app"
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

output "github_variables" {
  description = "Repository variables the GitHub Actions deploy job reads (see infra/README.md)"
  value = {
    GCP_WIF_PROVIDER          = google_iam_workload_identity_pool_provider.github.name
    GCP_DEPLOY_SA             = google_service_account.deploy.email
    GCP_REGION                = var.region
    GCP_IMAGE_REPO            = local.image_repo
    VITE_FIREBASE_API_KEY     = data.google_firebase_web_app_config.admin.api_key
    VITE_FIREBASE_AUTH_DOMAIN = data.google_firebase_web_app_config.admin.auth_domain
    VITE_FIREBASE_PROJECT_ID  = var.project_id
  }
}
