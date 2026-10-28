variable "name_prefix" { type = string }
variable "dist_path" { type = string }
variable "enable_cloudfront" {
  type    = bool
  default = false
}
variable "tags" { type = map(string) }
