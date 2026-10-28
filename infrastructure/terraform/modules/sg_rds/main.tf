resource "aws_db_subnet_group" "this" {
  name_prefix = "${var.name}-"
  subnet_ids  = var.subnet_ids
  tags        = merge(var.tags, { Name = "${var.name}-subnets" })
}

resource "aws_db_instance" "this" {
  identifier_prefix               = "${var.name}-"
  engine                          = "postgres"
  engine_version                  = "16"
  instance_class                  = var.instance_class
  allocated_storage               = var.allocated_storage_gib
  storage_type                    = "gp3"
  storage_encrypted               = true
  db_name                         = "hanoi_lab"
  username                        = "hanoi_admin"
  manage_master_user_password     = true
  db_subnet_group_name            = aws_db_subnet_group.this.name
  vpc_security_group_ids          = [var.security_group_id]
  publicly_accessible             = false
  multi_az                        = false
  backup_retention_period         = 1
  deletion_protection             = true
  skip_final_snapshot             = false
  final_snapshot_identifier       = "${var.name}-final-${substr(md5(aws_db_subnet_group.this.arn), 0, 8)}"
  auto_minor_version_upgrade      = true
  performance_insights_enabled    = false
  enabled_cloudwatch_logs_exports = ["postgresql"]
  apply_immediately               = false
  copy_tags_to_snapshot           = true
  tags                            = merge(var.tags, { Name = var.name, Role = "database" })

  lifecycle { prevent_destroy = true }
}
