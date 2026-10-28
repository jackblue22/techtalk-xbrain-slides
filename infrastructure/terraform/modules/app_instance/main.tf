locals {
  user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    artifact_bucket        = var.artifact_bucket
    artifact_key           = var.artifact_key
    database_secret_arn    = var.database_secret_arn
    database_host_override = var.database_host_override
    database_ssl_mode      = var.database_ssl_mode
    scenario               = var.scenario
    app_vantage            = var.app_vantage
    database_location      = var.database_location
    availability_zone      = var.availability_zone
  })
}

resource "aws_instance" "this" {
  ami                         = var.ami_id
  instance_type               = var.instance_type
  subnet_id                   = var.subnet_id
  vpc_security_group_ids      = [var.security_group_id]
  iam_instance_profile        = var.instance_profile_name
  associate_public_ip_address = var.associate_public_ip_address
  user_data                   = local.user_data
  user_data_replace_on_change = true

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "enabled"
  }

  root_block_device {
    encrypted   = true
    volume_type = "gp3"
    volume_size = var.root_volume_gib
    tags        = merge(var.tags, { Name = "${var.name}-root" })
  }

  tags = merge(var.tags, { Name = var.name, Role = "application" })
}
