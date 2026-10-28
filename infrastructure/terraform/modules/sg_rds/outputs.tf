output "identifier" { value = aws_db_instance.this.identifier }
output "endpoint" { value = aws_db_instance.this.address }
output "port" { value = aws_db_instance.this.port }
output "availability_zone" { value = aws_db_instance.this.availability_zone }
output "master_secret_arn" { value = aws_db_instance.this.master_user_secret[0].secret_arn }
output "subnet_group_name" { value = aws_db_subnet_group.this.name }

