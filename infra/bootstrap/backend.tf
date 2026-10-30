# Added after the first apply; the bucket stores its own state.
terraform {
  backend "gcs" {
    bucket = "pimik-tfstate"
    prefix = "bootstrap"
  }
}
