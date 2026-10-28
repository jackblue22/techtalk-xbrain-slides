variable "name" { type = string }
variable "ami_id" { type = string }
variable "instance_type" { type = string }
variable "subnet_id" { type = string }
variable "security_group_id" { type = string }
variable "instance_profile_name" { type = string }
variable "artifact_bucket" { type = string }
variable "artifact_key" { type = string }
variable "database_secret_arn" { type = string }
variable "database_host_override" {
  type    = string
  default = ""
}
variable "database_ssl_mode" {
  type    = string
  default = "disable"
  validation {
    condition     = contains(["disable", "require"], var.database_ssl_mode)
    error_message = "database_ssl_mode must be disable or require."
  }
}
variable "scenario" { type = string }
variable "app_vantage" { type = string }
variable "database_location" { type = string }
variable "availability_zone" { type = string }
variable "associate_public_ip_address" {
  type    = bool
  default = false
}
variable "root_volume_gib" {
  type    = number
  default = 20
}
variable "tags" { type = map(string) }
