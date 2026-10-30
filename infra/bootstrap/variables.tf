variable "project_id" {
  description = "GCP project id"
  type        = string
  default     = "experiment-stash"
}

variable "region" {
  description = "Region for all resources"
  type        = string
  default     = "europe-north1"
}

variable "name_prefix" {
  description = "Every resource name starts with this (the repo name); bucket names are global"
  type        = string
  default     = "pimik"
}
