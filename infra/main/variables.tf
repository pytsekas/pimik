variable "project_id" {
  description = "GCP project id"
  type        = string
  default     = "experiment-stash"
}

variable "region" {
  description = "Region for all resources; Firestore's location can never change"
  type        = string
  default     = "europe-north1"
}

variable "admin_emails" {
  description = "Google accounts allowed into the admin (ADMIN_EMAILS)"
  type        = list(string)
}

variable "site_url" {
  description = "Public site URL for feed, sitemap and canonical links (SITE_URL)"
  type        = string
  default     = "https://vinyl.rehab"
}

variable "upload_origins" {
  description = "Browser origins besides the web service's run.app URL that may PUT uploads"
  type        = list(string)
  default     = ["https://vinyl.rehab"]
}

variable "auth_domains" {
  description = "Domains besides the web service's run.app host whose pages may start Google sign-in"
  type        = list(string)
  default = [
    "experiment-stash.firebaseapp.com",
    "experiment-stash.web.app",
    "vinyl.rehab",
  ]
}
