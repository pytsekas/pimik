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

variable "domain" {
  description = "The site's domain, served through Firebase Hosting"
  type        = string
  default     = "vinyl.rehab"
}

variable "custom_domain_enabled" {
  description = "Register the domain with Firebase Hosting; turn on only when DNS moves from WordPress"
  type        = bool
  default     = false
}

variable "site_url" {
  description = "Public site URL for feed, sitemap and canonical links (SITE_URL)"
  type        = string
  default     = "https://vinyl.rehab"
}

variable "upload_origins" {
  description = "Browser origins besides the web service's run.app URL that may PUT uploads"
  type        = list(string)
  default     = ["https://vinyl.rehab", "https://experiment-stash.web.app"]
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

variable "github_repository" {
  description = "GitHub repository (owner/name) whose main branch deploys"
  type        = string
  default     = "pytsekas/pimik"
}

variable "github_repository_id" {
  description = "Numeric id of github_repository (gh api repos/OWNER/NAME --jq .id); survives renames"
  type        = string
  default     = "1422126308"
}
