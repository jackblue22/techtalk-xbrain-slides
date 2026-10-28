output "instance_id" { value = aws_instance.this.id }
output "public_ip" { value = aws_eip.this.public_ip }
output "private_ip" { value = aws_instance.this.private_ip }
output "availability_zone" { value = aws_instance.this.availability_zone }
output "data_volume_id" { value = aws_ebs_volume.data.id }
