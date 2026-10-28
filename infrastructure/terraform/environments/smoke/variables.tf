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
variable "instance_type" {
  type    = string
  default = "c7i.large"
}
variable "vpc_cidr" {
  type    = string
  default = "10.71.0.0/16"
}
variable "artifact_path" {
  type    = string
  default = "../../artifacts/smoke-images.tar"
}
variable "data_volume_gib" {
  type    = number
  default = 10
}
