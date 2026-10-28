output "instance_id" { value = aws_instance.this.id }
output "private_ip" { value = aws_instance.this.private_ip }
output "availability_zone" { value = aws_instance.this.availability_zone }
output "data_volume_id" { value = aws_ebs_volume.data.id }
output "data_volume_arn" { value = aws_ebs_volume.data.arn }
output "secret_arn" { value = var.secret_arn }
output "user_data_sha256" { value = sha256(local.user_data) }
