# Copied into modules/colocated_app/zz_cleanup_override.tf only by the reviewed destroy-plan workflow.
resource "aws_ebs_volume" "data" {
  lifecycle {
    prevent_destroy = false
  }
}
