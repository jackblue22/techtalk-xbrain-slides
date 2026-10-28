variable "name" { type = string }
variable "ami_id" { type = string }
variable "instance_type" { type = string }
variable "subnet_id" { type = string }
variable "availability_zone" { type = string }
variable "security_group_id" { type = string }
variable "instance_profile_name" { type = string }
variable "artifact_bucket" { type = string }
variable "artifact_key" { type = string }
variable "secret_arn" { type = string }
variable "data_volume_gib" {
  type    = number
  default = 30
}
variable "root_volume_gib" {
  type    = number
  default = 20
}
variable "tags" { type = map(string) }
