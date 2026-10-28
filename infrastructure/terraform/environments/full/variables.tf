variable "aws_profile" {
  type    = string
  default = "thangvn"
}
variable "aws_region" {
  type    = string
  default = "ap-southeast-1"
}
variable "expected_account_id" {
  type        = string
  sensitive   = true
  description = "Expected AWS account ID. Set with TF_VAR_expected_account_id from STS; never commit it."
}
variable "hanoi_zone" {
  type    = string
  default = "ap-southeast-1-han-1a"
}
variable "singapore_azs" {
  type    = list(string)
  default = ["ap-southeast-1a", "ap-southeast-1b"]
}
variable "hanoi_app_instance_type" {
  type    = string
  default = "c7i.large"
}
variable "hanoi_db_instance_type" {
  type    = string
  default = "m7i.large"
}
variable "singapore_app_instance_type" {
  type    = string
  default = "t3.small"
}
variable "singapore_rds_instance_class" {
  type    = string
  default = "db.t4g.micro"
}
variable "sg_database_target" {
  type        = string
  default     = "rds"
  description = "Set to hanoi only for the separately reviewed hybrid scenario."
  validation {
    condition     = contains(["rds", "hanoi"], var.sg_database_target)
    error_message = "sg_database_target must be rds or hanoi."
  }
}
variable "artifact_path" {
  type    = string
  default = "../../artifacts/full-images.tar"
}
variable "vpc_cidr" {
  type    = string
  default = "10.72.0.0/16"
}
variable "hanoi_data_volume_gib" {
  type    = number
  default = 30
}
variable "rds_storage_gib" {
  type    = number
  default = 20
}
