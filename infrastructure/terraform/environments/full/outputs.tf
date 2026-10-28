output "singapore_endpoint" { value = "http://${module.sg_alb.dns_name}" }
output "hanoi_endpoint" { value = "http://${module.han_alb.dns_name}" }
output "singapore_app_instance_id" { value = module.sg_app.instance_id }
output "singapore_app_availability_zone" { value = module.sg_app.availability_zone }
output "hanoi_app_instance_id" { value = module.han_app.instance_id }
output "hanoi_app_availability_zone" { value = module.han_app.availability_zone }
output "hanoi_database_instance_id" { value = module.han_postgres.instance_id }
output "hanoi_database_availability_zone" { value = module.han_postgres.availability_zone }
output "hanoi_database_volume_id" { value = module.han_postgres.data_volume_id }
output "rds_identifier" { value = module.sg_rds.identifier }
output "rds_availability_zone" { value = module.sg_rds.availability_zone }
output "sg_database_target" { value = var.sg_database_target }
output "required_standard_vcpus" { value = local.required_standard_vcpus }
output "database_public_exposure" { value = "RDS and Hanoi PostgreSQL have no public IP path and accept 5432 only from application security groups." }

