# Firebase Hosting holds the domain and its TLS certificate and hands every request to the web
# service. The site `pimik` (pimik.web.app) is the address. The default site (id = project id)
# comes with the Firebase project and can't be renamed or deleted; it serves the same content and
# the /__/auth/handler that Google sign-in uses (authDomain experiment-stash.firebaseapp.com).

resource "google_firebase_hosting_site" "main" {
  provider = google-beta
  project  = var.project_id
  site_id  = var.name_prefix

  depends_on = [google_firebase_project.default]
}

locals {
  hosting_sites = {
    main    = google_firebase_hosting_site.main.site_id
    default = var.project_id
  }
}

resource "google_firebase_hosting_version" "web" {
  for_each = local.hosting_sites
  provider = google-beta
  site_id  = each.value

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
  for_each     = local.hosting_sites
  provider     = google-beta
  site_id      = each.value
  version_name = google_firebase_hosting_version.web[each.key].name
  message      = "Every request to Cloud Run ${google_cloud_run_v2_service.web.name}"
}

moved {
  from = google_firebase_hosting_version.web
  to   = google_firebase_hosting_version.web["default"]
}

moved {
  from = google_firebase_hosting_release.web
  to   = google_firebase_hosting_release.web["default"]
}

# Off until the domain moves from WordPress (see infra/README.md). Creating these changes nothing
# in DNS; the records to add at zone.ee are then in the hosting_dns_records output.
resource "google_firebase_hosting_custom_domain" "apex" {
  count                 = var.custom_domain_enabled ? 1 : 0
  provider              = google-beta
  project               = var.project_id
  site_id               = google_firebase_hosting_site.main.site_id
  custom_domain         = var.domain
  wait_dns_verification = false
}

resource "google_firebase_hosting_custom_domain" "www" {
  count                 = var.custom_domain_enabled ? 1 : 0
  provider              = google-beta
  project               = var.project_id
  site_id               = google_firebase_hosting_site.main.site_id
  custom_domain         = "www.${var.domain}"
  redirect_target       = var.domain
  wait_dns_verification = false
}
