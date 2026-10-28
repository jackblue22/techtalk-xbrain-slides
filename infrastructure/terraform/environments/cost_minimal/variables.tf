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
  description = "Expected account ID from STS; set with TF_VAR_expected_account_id and never commit it."
}
variable "hanoi_zone" {
  type    = string
  default = "ap-southeast-1-han-1a"
}
variable "singapore_zone" {
  type    = string
  default = "ap-southeast-1a"
}
variable "hanoi_instance_type" {
  type    = string
  default = "c7i.large"
}
variable "singapore_instance_type" {
  type    = string
  default = "t3.small"
}
variable "benchmark_client_cidrs" {
  type        = list(string)
  description = "Presenter public IPv4 CIDRs allowed to reach API ports 8080 and 8081."
  validation {
    condition     = length(var.benchmark_client_cidrs) > 0 && alltrue([for cidr in var.benchmark_client_cidrs : cidr != "0.0.0.0/0"])
    error_message = "Provide at least one explicit presenter CIDR; 0.0.0.0/0 is forbidden."
  }
}
variable "artifact_path" {
  type    = string
  default = "../../artifacts/minimal-images.tar"
}
variable "frontend_dist_path" {
  type    = string
  default = "../../../../app/frontend/dist"
}
variable "enable_cloudfront" {
  type    = bool
  default = false
}
variable "enable_hanoi_local_frontend" {
  type    = bool
  default = false
}
variable "vpc_cidr" {
  type    = string
  default = "10.73.0.0/16"
}
variable "data_volume_gib" {
  type    = number
  default = 10
}
