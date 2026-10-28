resource "aws_ebs_volume" "data" {
  availability_zone = var.availability_zone
  encrypted         = true
  type              = "gp3"
  size              = var.data_volume_gib
  iops              = 3000
  throughput        = 125
  tags              = merge(var.tags, { Name = "${var.name}-data", DataClassification = "synthetic-demo" })

  lifecycle { prevent_destroy = true }
}

locals {
  user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    artifact_bucket = var.artifact_bucket
    artifact_key    = var.artifact_key
    secret_arn      = var.secret_arn
    volume_id       = aws_ebs_volume.data.id
  })
}

resource "aws_instance" "this" {
  ami                         = var.ami_id
  instance_type               = var.instance_type
  subnet_id                   = var.subnet_id
  vpc_security_group_ids      = [var.security_group_id]
  iam_instance_profile        = var.instance_profile_name
  associate_public_ip_address = false
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
  tags = merge(var.tags, { Name = var.name, Role = "database" })
}

resource "aws_volume_attachment" "data" {
  device_name  = "/dev/sdf"
  volume_id    = aws_ebs_volume.data.id
  instance_id  = aws_instance.this.id
  force_detach = false
}
