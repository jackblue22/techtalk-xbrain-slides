variable "aws_profile" {
  type        = string
  description = "Authorized AWS CLI profile selected explicitly by the operator."
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
variable "ecs_ami_id" {
  type        = string
  default     = "ami-01b068ca55c07ff47"
  description = "Explicitly reviewed Amazon ECS-optimized AL2023 x86_64 AMI. Release 2023.0.20261027; source SSM parameter /aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id was resolved and recorded on 2026-10-29."
  validation {
    condition     = can(regex("^ami-[0-9a-f]{17}$", var.ecs_ami_id))
    error_message = "ecs_ami_id must be an explicit 17-hex-digit AMI ID; any override requires a new read-only AMI review and saved-plan approval."
  }
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
variable "root_volume_gib" {
  type        = number
  default     = 30
  description = "Root volume size for both ECS-optimized AL2023 instances; must be at least the reviewed AMI source snapshot size."
  validation {
    condition     = var.root_volume_gib >= 30
    error_message = "The reviewed ECS-optimized AL2023 AMI has a 30-GiB source snapshot; root_volume_gib cannot be smaller than 30."
  }
}
