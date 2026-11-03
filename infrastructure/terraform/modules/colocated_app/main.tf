resource "aws_ebs_volume" "data" {
  availability_zone = var.availability_zone
  encrypted         = true
  type              = "gp3"
  size              = var.data_volume_gib
  iops              = 3000
  throughput        = 125
  tags              = merge(var.tags, { Name = "${var.name}-postgres-data", DataClassification = "synthetic-demo" })

  lifecycle {
    prevent_destroy = true
  }
}

locals {
  user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    artifact_bucket          = var.artifact_bucket
    artifact_key             = var.artifact_key
    artifact_sha256          = var.artifact_sha256
    aws_parent_region        = var.aws_parent_region
    database_secret_arn      = var.database_secret_arn
    peer_database_secret_arn = var.peer_database_secret_arn
    run_hybrid_api           = var.run_hybrid_api
    run_local_frontend       = var.run_local_frontend
    frontend_origin          = var.frontend_origin
    scenario                 = var.scenario
    app_vantage              = var.app_vantage
    database_location        = var.database_location
    availability_zone        = var.availability_zone
    network_border_group     = var.network_border_group
    volume_id                = aws_ebs_volume.data.id
  })
}

resource "aws_instance" "this" {
  ami                         = var.ami_id
  instance_type               = var.instance_type
  subnet_id                   = var.subnet_id
  vpc_security_group_ids      = [var.security_group_id]
  iam_instance_profile        = var.instance_profile_name
  associate_public_ip_address = true
  user_data                   = local.user_data
  user_data_replace_on_change = true

  dynamic "credit_specification" {
    for_each = var.cpu_credits == null ? [] : [var.cpu_credits]
    content {
      cpu_credits = credit_specification.value
    }
  }

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
  tags = merge(var.tags, { Name = var.name, Role = "co-located-api-postgresql" })
}

resource "aws_eip" "this" {
  domain               = "vpc"
  instance             = aws_instance.this.id
  network_border_group = var.network_border_group
  tags                 = merge(var.tags, { Name = "${var.name}-public-api" })
}

resource "aws_volume_attachment" "data" {
  device_name  = "/dev/sdf"
  volume_id    = aws_ebs_volume.data.id
  instance_id  = aws_instance.this.id
  force_detach = false
}
