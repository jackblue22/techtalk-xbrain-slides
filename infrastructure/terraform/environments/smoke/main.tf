locals {
  name = "hanoi-lz-smoke"
  common_tags = {
    Project     = "hanoi-lz-live-demo"
    Environment = "smoke"
    ManagedBy   = "Terraform"
    CostCenter  = "technical-talk"
  }
}

data "aws_caller_identity" "current" {}
data "aws_availability_zone" "hanoi" { name = var.hanoi_zone }
data "aws_ssm_parameter" "ecs_ami" { name = "/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id" }
data "aws_ec2_instance_type_offerings" "hanoi" {
  filter {
    name   = "location"
    values = [var.hanoi_zone]
  }
  location_type = "availability-zone"
}
data "aws_servicequotas_service_quota" "standard_vcpu" {
  service_code = "ec2"
  quota_code   = "L-1216C47A"
}

resource "terraform_data" "safety_gate" {
  input = sensitive({ account = data.aws_caller_identity.current.account_id, region = var.aws_region })
  lifecycle {
    precondition {
      condition     = data.aws_caller_identity.current.account_id == var.expected_account_id
      error_message = "AWS account does not match expected_account_id."
    }
    precondition {
      condition     = var.aws_region == "ap-southeast-1" && var.hanoi_zone == "ap-southeast-1-han-1a"
      error_message = "This lab is restricted to ap-southeast-1 and ap-southeast-1-han-1a."
    }
    precondition {
      condition     = contains(data.aws_ec2_instance_type_offerings.hanoi.instance_types, var.instance_type)
      error_message = "Selected smoke instance type is not currently offered in Hanoi."
    }
    precondition {
      condition     = data.aws_servicequotas_service_quota.standard_vcpu.value >= 2
      error_message = "Standard On-Demand vCPU quota is below the two vCPUs required by the smoke instance."
    }
  }
}

module "network" {
  source   = "../../modules/network"
  name     = local.name
  vpc_cidr = var.vpc_cidr
  subnets = {
    hanoi_smoke = { cidr = "10.71.0.0/24", availability_zone = var.hanoi_zone, public = true, map_public_ip_on_launch = true }
  }
  tags = local.common_tags
}

resource "aws_security_group" "instance" {
  name_prefix = "${local.name}-instance-"
  description = "No ingress; outbound TLS for SSM and private artifact retrieval"
  vpc_id      = module.network.vpc_id
  egress {
    description = "HTTPS only"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = merge(local.common_tags, { Name = "${local.name}-instance" })
}

data "aws_iam_policy_document" "assume_ec2" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "instance" {
  name_prefix        = "${local.name}-"
  assume_role_policy = data.aws_iam_policy_document.assume_ec2.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "instance" {
  name_prefix = "${local.name}-"
  role        = aws_iam_role.instance.name
  tags        = local.common_tags
}

module "artifacts" {
  source         = "../../modules/artifact_bucket"
  name_prefix    = local.name
  artifact_path  = var.artifact_path
  artifact_key   = "smoke-images.tar"
  read_role_arns = [aws_iam_role.instance.arn]
  tags           = local.common_tags
}

data "aws_iam_policy_document" "artifact_read" {
  statement {
    actions   = ["s3:GetObject"]
    resources = [module.artifacts.object_arn]
  }
}

resource "aws_iam_role_policy" "artifact_read" {
  name_prefix = "artifact-read-"
  role        = aws_iam_role.instance.id
  policy      = data.aws_iam_policy_document.artifact_read.json
}

resource "aws_ebs_volume" "data" {
  availability_zone = var.hanoi_zone
  encrypted         = true
  type              = "gp3"
  size              = var.data_volume_gib
  iops              = 3000
  throughput        = 125
  tags              = merge(local.common_tags, { Name = "${local.name}-data", DataClassification = "synthetic-smoke" })
  lifecycle { prevent_destroy = true }
}

locals {
  smoke_user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    artifact_bucket = module.artifacts.bucket_name
    artifact_key    = module.artifacts.object_key
    volume_id       = aws_ebs_volume.data.id
  })
}

resource "aws_instance" "smoke" {
  ami                         = data.aws_ssm_parameter.ecs_ami.value
  instance_type               = var.instance_type
  subnet_id                   = module.network.subnet_ids["hanoi_smoke"]
  vpc_security_group_ids      = [aws_security_group.instance.id]
  iam_instance_profile        = aws_iam_instance_profile.instance.name
  associate_public_ip_address = true
  user_data                   = local.smoke_user_data
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
    volume_size = 12
    tags        = merge(local.common_tags, { Name = "${local.name}-root" })
  }
  tags       = merge(local.common_tags, { Name = "${local.name}-instance", Role = "smoke" })
  depends_on = [aws_iam_role_policy.artifact_read, aws_iam_role_policy_attachment.ssm, terraform_data.safety_gate]
}

resource "aws_volume_attachment" "data" {
  device_name  = "/dev/sdf"
  volume_id    = aws_ebs_volume.data.id
  instance_id  = aws_instance.smoke.id
  force_detach = false
}
