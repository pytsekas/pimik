terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 7.0"
    }
  }

  backend "gcs" {
    bucket = "pimik-tfstate"
    prefix = "main"
  }
}

# Bill API calls to this project: with user ADC, Identity Toolkit and Firebase otherwise
# charge gcloud's own client project, where they are disabled.
provider "google" {
  project               = var.project_id
  region                = var.region
  billing_project       = var.project_id
  user_project_override = true
}

# Only for Firebase resources that are not in the GA provider yet.
provider "google-beta" {
  project               = var.project_id
  region                = var.region
  billing_project       = var.project_id
  user_project_override = true
}
