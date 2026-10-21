resource "google_firebase_project" "default" {
  provider   = google-beta
  project    = var.project_id
  depends_on = [google_project_service.enabled]
}

resource "google_firebase_web_app" "admin" {
  provider        = google-beta
  project         = var.project_id
  display_name    = "Vinyl Rehab"
  deletion_policy = "DELETE"
  depends_on      = [google_firebase_project.default]
}

data "google_firebase_web_app_config" "admin" {
  provider   = google-beta
  web_app_id = google_firebase_web_app.admin.app_id
}

# Firebase Auth (upgraded to Identity Platform): Google sign-in only.
resource "google_identity_platform_config" "default" {
  project            = var.project_id
  authorized_domains = var.auth_domains

  sign_in {
    allow_duplicate_emails = false

    email {
      enabled = false
    }
    anonymous {
      enabled = false
    }
    phone_number {
      enabled = false
    }
  }

  depends_on = [google_firebase_project.default]
}

# Google does not let Terraform create OAuth clients. The client JSON downloaded from the
# Console is stored by hand in this secret (see infra/README.md).
data "google_secret_manager_secret_version" "oauth_client" {
  secret = "google-oauth-client"
}

locals {
  oauth_client = jsondecode(data.google_secret_manager_secret_version.oauth_client.secret_data).web
}

resource "google_identity_platform_default_supported_idp_config" "google" {
  idp_id        = "google.com"
  enabled       = true
  client_id     = local.oauth_client.client_id
  client_secret = local.oauth_client.client_secret
  depends_on    = [google_identity_platform_config.default]
}
