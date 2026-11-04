# Copied into one reviewed bucket module as zz_cleanup_override.tf only after exact object-version inventory.
resource "aws_s3_bucket" "this" {
  force_destroy = true
}
