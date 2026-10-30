# Firebase Hosting holds the domain and its TLS certificate and hands every request to vinyl-web.
# The default site (id = project id) comes with the Firebase project; it also serves the
# /__/auth/handler that Google sign-in uses.

resource "google_firebase_hosting_version" "web" {
  provider = google-beta
  site_id  = var.project_id

  config {
    rewrites {
      glob = "**"
      run {
        service_id = google_cloud_run_v2_service.web.name
        region     = var.region
      }
    }
  }

  depends_on = [google_project_service.enabled]
}

resource "google_firebase_hosting_release" "web" {
  provider     = google-beta
  site_id      = var.project_id
  version_name = google_firebase_hosting_version.web.name
  message      = "Every request to Cloud Run vinyl-web"
}

# Off until the domain moves from WordPress (see infra/README.md). Creating these changes nothing
# in DNS; the records to add at zone.ee are then in the hosting_dns_records output.
resource "google_firebase_hosting_custom_domain" "apex" {
  count                 = var.custom_domain_enabled ? 1 : 0
  provider              = google-beta
  project               = var.project_id
  site_id               = var.project_id
  custom_domain         = var.domain
  wait_dns_verification = false
}

resource "google_firebase_hosting_custom_domain" "www" {
  count                 = var.custom_domain_enabled ? 1 : 0
  provider              = google-beta
  project               = var.project_id
  site_id               = var.project_id
  custom_domain         = "www.${var.domain}"
  redirect_target       = var.domain
  wait_dns_verification = false
}
