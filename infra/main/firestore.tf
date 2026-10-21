resource "google_firestore_database" "default" {
  name                    = "(default)"
  location_id             = var.region
  type                    = "FIRESTORE_NATIVE"
  delete_protection_state = "DELETE_PROTECTION_ENABLED"
  deletion_policy         = "ABANDON"

  depends_on = [google_project_service.enabled]
}

# firestore.indexes.json stays the single source of truth, shared with the emulators.
locals {
  firestore_indexes = {
    for index in jsondecode(file("${path.module}/../../firestore.indexes.json")).indexes :
    join(",", concat([index.collectionGroup], [
      for field in index.fields : "${field.fieldPath}:${try(field.order, field.arrayConfig)}"
    ])) => index
  }
}

resource "google_firestore_index" "indexes" {
  for_each    = local.firestore_indexes
  database    = google_firestore_database.default.name
  collection  = each.value.collectionGroup
  query_scope = each.value.queryScope

  dynamic "fields" {
    for_each = each.value.fields
    content {
      field_path   = fields.value.fieldPath
      order        = try(fields.value.order, null)
      array_config = try(fields.value.arrayConfig, null)
    }
  }
}
