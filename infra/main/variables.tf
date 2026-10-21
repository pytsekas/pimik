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

variable "upload_origins" {
  description = "Browser origins allowed to PUT photos to the bucket via signed URLs"
  type        = list(string)
  default     = ["https://vinyl.rehab"]
}

variable "auth_domains" {
  description = "Domains whose pages may start Google sign-in"
  type        = list(string)
  default = [
    "experiment-stash.firebaseapp.com",
    "experiment-stash.web.app",
    "vinyl.rehab",
  ]
}
