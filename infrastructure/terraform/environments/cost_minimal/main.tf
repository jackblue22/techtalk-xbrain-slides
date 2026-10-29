locals {
  name = "hanoi-lz-cost-minimal"
  common_tags = {
    Project     = "hanoi-lz-live-demo"
    Environment = "cost_minimal"
    ManagedBy   = "Terraform"
    CostCenter  = "technical-talk"
  }
  required_standard_vcpus = 4
}

data "aws_caller_identity" "current" {}
data "aws_availability_zone" "singapore" { name = var.singapore_zone }
data "aws_availability_zone" "hanoi" { name = var.hanoi_zone }
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
      error_message = "This profile is restricted to Singapore and Hanoi Local Zone."
    }
    precondition {
      condition     = contains(data.aws_ec2_instance_type_offerings.hanoi.instance_types, var.hanoi_instance_type)
      error_message = "Selected Hanoi instance type is not currently offered."
    }
    precondition {
      condition     = data.aws_availability_zone.singapore.network_border_group == "ap-southeast-1" && data.aws_availability_zone.hanoi.network_border_group == "ap-southeast-1-han-1"
      error_message = "Unexpected network border group; EIPs would not be safe to associate."
    }
    precondition {
      condition     = data.aws_servicequotas_service_quota.standard_vcpu.value >= local.required_standard_vcpus
      error_message = "Standard On-Demand vCPU quota is below four vCPUs."
    }
  }
}

module "network" {
  source   = "../../modules/network"
  name     = local.name
  vpc_cidr = var.vpc_cidr
  subnets = {
    singapore = { cidr = "10.73.0.0/24", availability_zone = var.singapore_zone, public = true, map_public_ip_on_launch = true }
    hanoi     = { cidr = "10.73.64.0/24", availability_zone = var.hanoi_zone, public = true, map_public_ip_on_launch = true }
  }
  tags = local.common_tags
}

resource "aws_security_group" "workload" {
  name_prefix = "${local.name}-workload-"
  description = "Direct demo APIs from reviewed presenter CIDRs; PostgreSQL stays private"
  vpc_id      = module.network.vpc_id
  tags        = merge(local.common_tags, { Name = "${local.name}-workload" })
}
resource "aws_vpc_security_group_ingress_rule" "api" {
  for_each          = toset(var.benchmark_client_cidrs)
  security_group_id = aws_security_group.workload.id
  description       = "HTTP API from presenter CIDR"
  ip_protocol       = "tcp"
  from_port         = 8080
  to_port           = 8081
  cidr_ipv4         = each.value
}
resource "aws_vpc_security_group_ingress_rule" "hanoi_frontend" {
  for_each          = var.enable_hanoi_local_frontend ? toset(var.benchmark_client_cidrs) : toset([])
  security_group_id = aws_security_group.workload.id
  description       = "Optional Hanoi-local Nginx frontend from presenter CIDR"
  ip_protocol       = "tcp"
  from_port         = 8082
  to_port           = 8082
  cidr_ipv4         = each.value
}
resource "aws_vpc_security_group_ingress_rule" "postgres_private" {
  security_group_id            = aws_security_group.workload.id
  description                  = "PostgreSQL only between cost-minimal workload instances"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.workload.id
}
resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.workload.id
  description       = "Outbound package, AWS API, and private VPC access"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
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
resource "aws_iam_role" "singapore" {
  name_prefix        = "${local.name}-sg-"
  assume_role_policy = data.aws_iam_policy_document.assume_ec2.json
  tags               = local.common_tags
}
resource "aws_iam_role" "hanoi" {
  name_prefix        = "${local.name}-han-"
  assume_role_policy = data.aws_iam_policy_document.assume_ec2.json
  tags               = local.common_tags
}
resource "aws_iam_role_policy_attachment" "sg_ssm" {
  role       = aws_iam_role.singapore.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}
resource "aws_iam_role_policy_attachment" "han_ssm" {
  role       = aws_iam_role.hanoi.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}
resource "aws_iam_instance_profile" "singapore" {
  name_prefix = "${local.name}-sg-"
  role        = aws_iam_role.singapore.name
  tags        = local.common_tags
}
resource "aws_iam_instance_profile" "hanoi" {
  name_prefix = "${local.name}-han-"
  role        = aws_iam_role.hanoi.name
  tags        = local.common_tags
}

module "artifacts" {
  source         = "../../modules/artifact_bucket"
  name_prefix    = "${local.name}-artifacts"
  artifact_path  = var.artifact_path
  artifact_key   = "minimal-images.tar"
  read_role_arns = [aws_iam_role.singapore.arn, aws_iam_role.hanoi.arn]
  tags           = local.common_tags
}

resource "aws_secretsmanager_secret" "singapore_db" {
  name_prefix             = "${local.name}-sg-db-"
  recovery_window_in_days = 7
  tags                    = local.common_tags
}
resource "aws_secretsmanager_secret" "hanoi_db" {
  name_prefix             = "${local.name}-han-db-"
  recovery_window_in_days = 7
  tags                    = local.common_tags
}

data "aws_iam_policy_document" "sg_runtime" {
  statement {
    actions   = ["s3:GetObject"]
    resources = [module.artifacts.object_arn]
  }
  statement {
    actions   = ["secretsmanager:DescribeSecret", "secretsmanager:PutSecretValue"]
    resources = [aws_secretsmanager_secret.singapore_db.arn]
  }
  statement {
    actions   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
    resources = [aws_secretsmanager_secret.hanoi_db.arn]
  }
}
data "aws_iam_policy_document" "han_runtime" {
  statement {
    actions   = ["s3:GetObject"]
    resources = [module.artifacts.object_arn]
  }
  statement {
    actions   = ["secretsmanager:DescribeSecret", "secretsmanager:PutSecretValue"]
    resources = [aws_secretsmanager_secret.hanoi_db.arn]
  }
}
resource "aws_iam_role_policy" "sg_runtime" {
  name_prefix = "runtime-"
  role        = aws_iam_role.singapore.id
  policy      = data.aws_iam_policy_document.sg_runtime.json
}
resource "aws_iam_role_policy" "han_runtime" {
  name_prefix = "runtime-"
  role        = aws_iam_role.hanoi.id
  policy      = data.aws_iam_policy_document.han_runtime.json
}

module "frontend" {
  source            = "../../modules/static_frontend"
  name_prefix       = "hanoi-lab-cost-minimal"
  dist_path         = var.frontend_dist_path
  enable_cloudfront = var.enable_cloudfront
  tags              = local.common_tags
}

module "hanoi" {
  source                = "../../modules/colocated_app"
  name                  = "hanoi-lab-minimal-hanoi"
  ami_id                = var.ecs_ami_id
  instance_type         = var.hanoi_instance_type
  subnet_id             = module.network.subnet_ids["hanoi"]
  availability_zone     = var.hanoi_zone
  network_border_group  = data.aws_availability_zone.hanoi.network_border_group
  aws_parent_region     = var.aws_region
  security_group_id     = aws_security_group.workload.id
  instance_profile_name = aws_iam_instance_profile.hanoi.name
  artifact_bucket       = module.artifacts.bucket_name
  artifact_key          = module.artifacts.object_key
  artifact_sha256       = filesha256(var.artifact_path)
  database_secret_arn   = aws_secretsmanager_secret.hanoi_db.arn
  run_local_frontend    = var.enable_hanoi_local_frontend
  frontend_origin       = module.frontend.frontend_origin
  scenario              = "aws-real-hanoi-colocated"
  app_vantage           = "hanoi-local-zone-ec2"
  database_location     = "same-hanoi-ec2-encrypted-ebs"
  data_volume_gib       = var.data_volume_gib
  root_volume_gib       = var.root_volume_gib
  tags                  = local.common_tags
  depends_on            = [aws_iam_role_policy.han_runtime, terraform_data.safety_gate]
}

module "singapore" {
  source                   = "../../modules/colocated_app"
  name                     = "hanoi-lab-minimal-singapore"
  ami_id                   = var.ecs_ami_id
  instance_type            = var.singapore_instance_type
  subnet_id                = module.network.subnet_ids["singapore"]
  availability_zone        = var.singapore_zone
  network_border_group     = data.aws_availability_zone.singapore.network_border_group
  aws_parent_region        = var.aws_region
  cpu_credits              = "standard"
  security_group_id        = aws_security_group.workload.id
  instance_profile_name    = aws_iam_instance_profile.singapore.name
  artifact_bucket          = module.artifacts.bucket_name
  artifact_key             = module.artifacts.object_key
  artifact_sha256          = filesha256(var.artifact_path)
  database_secret_arn      = aws_secretsmanager_secret.singapore_db.arn
  peer_database_secret_arn = aws_secretsmanager_secret.hanoi_db.arn
  run_hybrid_api           = true
  frontend_origin          = module.frontend.frontend_origin
  scenario                 = "aws-real-singapore-colocated"
  app_vantage              = "singapore-regional-ec2"
  database_location        = "same-singapore-ec2-encrypted-ebs"
  data_volume_gib          = var.data_volume_gib
  root_volume_gib          = var.root_volume_gib
  tags                     = local.common_tags
  depends_on               = [module.hanoi, aws_iam_role_policy.sg_runtime, terraform_data.safety_gate]
}

resource "aws_s3_object" "runtime_config" {
  bucket        = module.frontend.bucket_name
  key           = "runtime-config.js"
  content_type  = "text/javascript; charset=utf-8"
  cache_control = "no-store"
  content = <<-JS
    window.__HANOI_LAB_CONFIG__ = ${jsonencode({
  defaultTarget = "singapore"
  targets = [
    { id = "singapore", label = "Singapore API + Singapore PostgreSQL", apiBaseUrl = "http://${module.singapore.public_ip}:8080" },
    { id = "hanoi", label = "Hanoi API + Hanoi PostgreSQL", apiBaseUrl = "http://${module.hanoi.public_ip}:8080" },
    { id = "hybrid", label = "Singapore API + Hanoi PostgreSQL", apiBaseUrl = "http://${module.singapore.public_ip}:8081" }
  ]
  provenance = "AWS_REAL cost_minimal. Frontend is a Singapore Regional S3 website; APIs and SQL operations are real."
})};
  JS
}
