output "profile" { value = "cost_minimal" }
output "frontend_url" { value = module.frontend.frontend_origin }
output "frontend_delivery_mode" { value = module.frontend.delivery_mode }
output "frontend_bucket_name" { value = module.frontend.bucket_name }
output "singapore_api_endpoint" { value = "http://${module.singapore.public_ip}:8080" }
output "hanoi_api_endpoint" { value = "http://${module.hanoi.public_ip}:8080" }
output "hanoi_local_frontend_endpoint" { value = var.enable_hanoi_local_frontend ? "http://${module.hanoi.public_ip}:8082" : "DISABLED" }
output "hybrid_api_endpoint" { value = "http://${module.singapore.public_ip}:8081" }
output "singapore_instance_id" { value = module.singapore.instance_id }
output "hanoi_instance_id" { value = module.hanoi.instance_id }
output "hanoi_availability_zone" { value = module.hanoi.availability_zone }
output "data_volume_ids" { value = { singapore = module.singapore.data_volume_id, hanoi = module.hanoi.data_volume_id } }
output "artifact" {
  value = {
    bucket = module.artifacts.bucket_name
    key    = module.artifacts.object_key
    sha256 = filesha256(var.artifact_path)
    region = var.aws_region
  }
}
output "database_secret_arns" {
  value     = { singapore = aws_secretsmanager_secret.singapore_db.arn, hanoi = aws_secretsmanager_secret.hanoi_db.arn }
  sensitive = true
}
output "required_standard_vcpus" { value = local.required_standard_vcpus }
output "database_public_exposure" { value = "No public PostgreSQL rule; TCP/5432 is limited to the shared workload security group over private VPC addresses." }
output "api_exposure" { value = "Plain HTTP on ports 8080/8081, restricted to benchmark_client_cidrs. No ALB or TLS in this cost-minimal profile." }
