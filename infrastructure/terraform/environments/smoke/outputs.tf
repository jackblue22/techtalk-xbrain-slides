output "instance_id" { value = aws_instance.smoke.id }
output "instance_availability_zone" { value = aws_instance.smoke.availability_zone }
output "data_volume_id" { value = aws_ebs_volume.data.id }
output "data_volume_availability_zone" { value = aws_ebs_volume.data.availability_zone }
output "ssm_health_command" { value = "aws ssm send-command --profile thangvn --region ap-southeast-1 --instance-ids ${aws_instance.smoke.id} --document-name AWS-RunShellScript --parameters commands=\"curl -fsS http://127.0.0.1:8080/health\"" }
output "public_exposure" { value = "Instance has a temporary public IPv4 for outbound SSM, but its security group has zero ingress rules." }
output "required_standard_vcpus" { value = 2 }

