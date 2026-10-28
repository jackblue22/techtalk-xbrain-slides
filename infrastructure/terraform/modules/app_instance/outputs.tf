output "instance_id" { value = aws_instance.this.id }
output "private_ip" { value = aws_instance.this.private_ip }
output "availability_zone" { value = aws_instance.this.availability_zone }
output "user_data_sha256" { value = sha256(local.user_data) }

