variable "name" { type = string }
variable "ami_id" { type = string }
variable "instance_type" { type = string }
variable "subnet_id" { type = string }
variable "availability_zone" { type = string }
variable "network_border_group" { type = string }
variable "aws_parent_region" { type = string }
variable "security_group_id" { type = string }
variable "instance_profile_name" { type = string }
variable "artifact_bucket" { type = string }
variable "artifact_key" { type = string }
variable "artifact_sha256" { type = string }
variable "database_secret_arn" { type = string }
variable "peer_database_secret_arn" {
  type    = string
  default = ""
}
variable "run_hybrid_api" {
  type    = bool
  default = false
}
variable "run_local_frontend" {
  type    = bool
  default = false
}
variable "frontend_origin" { type = string }
variable "scenario" { type = string }
variable "app_vantage" { type = string }
variable "database_location" { type = string }
variable "data_volume_gib" {
  type    = number
  default = 10
}
variable "root_volume_gib" {
  type    = number
  default = 12
}
variable "cpu_credits" {
  type     = string
  default  = null
  nullable = true
  validation {
    condition     = var.cpu_credits == null || contains(["standard", "unlimited"], var.cpu_credits)
    error_message = "cpu_credits must be null, standard, or unlimited."
  }
}
variable "tags" { type = map(string) }
