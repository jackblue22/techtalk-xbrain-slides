variable "name_prefix" { type = string }
variable "artifact_path" { type = string }
variable "artifact_key" { type = string }
variable "read_role_arns" { type = list(string) }
variable "tags" { type = map(string) }

