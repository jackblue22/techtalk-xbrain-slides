output "ids" { value = { for service, endpoint in aws_vpc_endpoint.this : service => endpoint.id } }

