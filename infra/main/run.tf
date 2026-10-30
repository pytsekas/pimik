# Terraform owns the services; CI or infra/deploy.sh owns which image runs (hence ignore_changes).
# The first apply starts Google's placeholder image until the first deploy.

locals {
  placeholder_image = "us-docker.pkg.dev/cloudrun/container/hello"
}

resource "google_cloud_run_v2_service" "api" {
  name     = "vinyl-api"
  location = var.region
  # Public ingress, but only principals with run.invoker (the web service account) get through.
  ingress = "INGRESS_TRAFFIC_ALL"

  template {
    service_account                  = google_service_account.api.email
    max_instance_request_concurrency = 10

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    containers {
      image = local.placeholder_image

      resources {
        limits = {
          cpu    = "1"
          memory = "2Gi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      env {
        name  = "GCLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "BUCKET"
        value = google_storage_bucket.photos.name
      }
      env {
        name  = "UPLOAD_BUCKET"
        value = local.upload_bucket
      }
      env {
        name  = "IMAGE_BASE_URL"
        value = local.image_base_url
      }
      env {
        name  = "ADMIN_EMAILS"
        value = join(",", var.admin_emails)
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }

  depends_on = [google_project_service.enabled]
}

resource "google_cloud_run_v2_service" "web" {
  name     = "vinyl-web"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.web.email

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    containers {
      image = local.placeholder_image

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      env {
        name  = "API_URL"
        value = google_cloud_run_v2_service.api.uri
      }
      env {
        name  = "API_AUDIENCE"
        value = google_cloud_run_v2_service.api.uri
      }
      env {
        name  = "IMAGE_BASE_URL"
        value = local.image_base_url
      }
      env {
        name  = "SITE_URL"
        value = var.site_url
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }

  depends_on = [google_project_service.enabled]
}

resource "google_cloud_run_v2_service_iam_member" "web_public" {
  name   = google_cloud_run_v2_service.web.name
  role   = "roles/run.invoker"
  member = "allUsers"
}
