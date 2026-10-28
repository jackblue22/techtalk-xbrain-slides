variable "name" { type = string }
variable "vpc_cidr" { type = string }
variable "subnets" {
  type = map(object({
    cidr                    = string
    availability_zone       = string
    public                  = bool
    map_public_ip_on_launch = optional(bool, false)
  }))
}
variable "tags" { type = map(string) }

