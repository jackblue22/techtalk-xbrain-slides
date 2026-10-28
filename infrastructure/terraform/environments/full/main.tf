locals {
  name = "hanoi-lz-full"
  common_tags = {
    Project     = "hanoi-lz-live-demo"
    Environment = "full"
    ManagedBy   = "Terraform"
    CostCenter  = "technical-talk"
  }
  required_standard_vcpus = 6
}

data "aws_caller_identity" "current" {}
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
      error_message = "This lab is restricted to Singapore and the Hanoi Local Zone."
    }
    precondition {
      condition     = length(var.singapore_azs) == 2 && var.singapore_azs[0] != var.singapore_azs[1]
      error_message = "The Singapore ALB and RDS require two distinct regional AZs."
    }
    precondition {
      condition     = contains(data.aws_ec2_instance_type_offerings.hanoi.instance_types, var.hanoi_app_instance_type) && contains(data.aws_ec2_instance_type_offerings.hanoi.instance_types, var.hanoi_db_instance_type)
      error_message = "One or more selected Hanoi instance types are not currently offered."
    }
    precondition {
      condition     = data.aws_servicequotas_service_quota.standard_vcpu.value >= local.required_standard_vcpus
      error_message = "Standard On-Demand vCPU quota is below the six vCPUs required by the full lab."
    }
  }
}

module "network" {
  source   = "../../modules/network"
  name     = local.name
  vpc_cidr = var.vpc_cidr
  subnets = {
    sg_alb_a = { cidr = "10.72.0.0/24", availability_zone = var.singapore_azs[0], public = true }
    sg_alb_b = { cidr = "10.72.1.0/24", availability_zone = var.singapore_azs[1], public = true }
    sg_app   = { cidr = "10.72.16.0/24", availability_zone = var.singapore_azs[0], public = false }
    sg_rds_a = { cidr = "10.72.32.0/24", availability_zone = var.singapore_azs[0], public = false }
    sg_rds_b = { cidr = "10.72.33.0/24", availability_zone = var.singapore_azs[1], public = false }
    han_alb  = { cidr = "10.72.64.0/24", availability_zone = var.hanoi_zone, public = true }
    han_app  = { cidr = "10.72.65.0/24", availability_zone = var.hanoi_zone, public = false }
    han_db   = { cidr = "10.72.66.0/24", availability_zone = var.hanoi_zone, public = false }
  }
  tags = local.common_tags
}

module "security" {
  source   = "../../modules/security"
  name     = local.name
  vpc_id   = module.network.vpc_id
  vpc_cidr = module.network.vpc_cidr
  tags     = local.common_tags
}

module "endpoints" {
  source            = "../../modules/interface_endpoints"
  name              = local.name
  vpc_id            = module.network.vpc_id
  subnet_ids        = [module.network.subnet_ids["sg_app"]]
  security_group_id = module.security.endpoints_id
  services          = ["ssm", "ssmmessages", "ec2messages", "secretsmanager"]
  tags              = local.common_tags
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

resource "aws_iam_role" "app" {
  name_prefix        = "${local.name}-app-"
  assume_role_policy = data.aws_iam_policy_document.assume_ec2.json
  tags               = local.common_tags
}
resource "aws_iam_role" "database" {
  name_prefix        = "${local.name}-db-"
  assume_role_policy = data.aws_iam_policy_document.assume_ec2.json
  tags               = local.common_tags
}
resource "aws_iam_role_policy_attachment" "app_ssm" {
  role       = aws_iam_role.app.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}
resource "aws_iam_role_policy_attachment" "db_ssm" {
  role       = aws_iam_role.database.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}
resource "aws_iam_instance_profile" "app" {
  name_prefix = "${local.name}-app-"
  role        = aws_iam_role.app.name
  tags        = local.common_tags
}
resource "aws_iam_instance_profile" "database" {
  name_prefix = "${local.name}-db-"
  role        = aws_iam_role.database.name
  tags        = local.common_tags
}

module "artifacts" {
  source         = "../../modules/artifact_bucket"
  name_prefix    = local.name
  artifact_path  = var.artifact_path
  artifact_key   = "full-images.tar"
  read_role_arns = [aws_iam_role.app.arn, aws_iam_role.database.arn]
  tags           = local.common_tags
}

module "sg_rds" {
  source                = "../../modules/sg_rds"
  name                  = "hanoi-lab-sg-rds"
  subnet_ids            = [module.network.subnet_ids["sg_rds_a"], module.network.subnet_ids["sg_rds_b"]]
  security_group_id     = module.security.rds_id
  instance_class        = var.singapore_rds_instance_class
  allocated_storage_gib = var.rds_storage_gib
  tags                  = local.common_tags
}

resource "aws_secretsmanager_secret" "han_database" {
  name_prefix             = "hanoi-lab-han-postgres-credentials-"
  description             = "Runtime-generated credentials for the Hanoi PostgreSQL lab database"
  recovery_window_in_days = 7
  tags                    = merge(local.common_tags, { Name = "hanoi-lab-han-postgres-credentials" })
}

data "aws_iam_policy_document" "app_access" {
  statement {
    actions   = ["s3:GetObject"]
    resources = [module.artifacts.object_arn]
  }
  statement {
    actions   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
    resources = [module.sg_rds.master_secret_arn, aws_secretsmanager_secret.han_database.arn]
  }
}
resource "aws_iam_role_policy" "app_access" {
  name_prefix = "runtime-"
  role        = aws_iam_role.app.id
  policy      = data.aws_iam_policy_document.app_access.json
}

data "aws_iam_policy_document" "database_access" {
  statement {
    actions   = ["s3:GetObject"]
    resources = [module.artifacts.object_arn]
  }
  statement {
    actions   = ["secretsmanager:PutSecretValue", "secretsmanager:DescribeSecret"]
    resources = [aws_secretsmanager_secret.han_database.arn]
  }
}
resource "aws_iam_role_policy" "database_access" {
  name_prefix = "runtime-"
  role        = aws_iam_role.database.id
  policy      = data.aws_iam_policy_document.database_access.json
}

module "han_postgres" {
  source                = "../../modules/han_postgres"
  name                  = "hanoi-lab-han-postgres"
  ami_id                = data.aws_ssm_parameter.ecs_ami.value
  instance_type         = var.hanoi_db_instance_type
  subnet_id             = module.network.subnet_ids["han_db"]
  availability_zone     = var.hanoi_zone
  security_group_id     = module.security.han_db_id
  instance_profile_name = aws_iam_instance_profile.database.name
  artifact_bucket       = module.artifacts.bucket_name
  artifact_key          = module.artifacts.object_key
  secret_arn            = aws_secretsmanager_secret.han_database.arn
  data_volume_gib       = var.hanoi_data_volume_gib
  tags                  = local.common_tags
  depends_on            = [module.endpoints, aws_iam_role_policy.database_access, terraform_data.safety_gate]
}

locals {
  sg_uses_hanoi      = var.sg_database_target == "hanoi"
  sg_database_secret = local.sg_uses_hanoi ? aws_secretsmanager_secret.han_database.arn : module.sg_rds.master_secret_arn
  sg_database_host   = local.sg_uses_hanoi ? module.han_postgres.private_ip : module.sg_rds.endpoint
  sg_database_place  = local.sg_uses_hanoi ? "hanoi-local-zone-private-postgresql" : "singapore-rds-postgresql"
}

module "sg_app" {
  source                      = "../../modules/app_instance"
  name                        = "hanoi-lab-sg-app"
  ami_id                      = data.aws_ssm_parameter.ecs_ami.value
  instance_type               = var.singapore_app_instance_type
  subnet_id                   = module.network.subnet_ids["sg_app"]
  security_group_id           = module.security.sg_app_id
  instance_profile_name       = aws_iam_instance_profile.app.name
  artifact_bucket             = module.artifacts.bucket_name
  artifact_key                = module.artifacts.object_key
  database_secret_arn         = local.sg_database_secret
  database_host_override      = local.sg_database_host
  database_ssl_mode           = local.sg_uses_hanoi ? "disable" : "require"
  scenario                    = local.sg_uses_hanoi ? "aws-real-hybrid" : "aws-real-singapore"
  app_vantage                 = "singapore-ec2"
  database_location           = local.sg_database_place
  availability_zone           = var.singapore_azs[0]
  associate_public_ip_address = false
  tags                        = local.common_tags
  depends_on                  = [module.endpoints, aws_iam_role_policy.app_access, terraform_data.safety_gate]
}

module "han_app" {
  source                      = "../../modules/app_instance"
  name                        = "hanoi-lab-han-app"
  ami_id                      = data.aws_ssm_parameter.ecs_ami.value
  instance_type               = var.hanoi_app_instance_type
  subnet_id                   = module.network.subnet_ids["han_app"]
  security_group_id           = module.security.han_app_id
  instance_profile_name       = aws_iam_instance_profile.app.name
  artifact_bucket             = module.artifacts.bucket_name
  artifact_key                = module.artifacts.object_key
  database_secret_arn         = aws_secretsmanager_secret.han_database.arn
  database_host_override      = module.han_postgres.private_ip
  database_ssl_mode           = "disable"
  scenario                    = "aws-real-hanoi"
  app_vantage                 = "hanoi-local-zone-ec2"
  database_location           = "hanoi-local-zone-private-postgresql"
  availability_zone           = var.hanoi_zone
  associate_public_ip_address = false
  tags                        = local.common_tags
  depends_on                  = [module.han_postgres, module.endpoints, aws_iam_role_policy.app_access, terraform_data.safety_gate]
}

module "sg_alb" {
  source            = "../../modules/load_balancer"
  name              = "hanoi-lab-sg-alb"
  vpc_id            = module.network.vpc_id
  subnet_ids        = [module.network.subnet_ids["sg_alb_a"], module.network.subnet_ids["sg_alb_b"]]
  security_group_id = module.security.sg_alb_id
  instance_id       = module.sg_app.instance_id
  tags              = local.common_tags
}

module "han_alb" {
  source            = "../../modules/load_balancer"
  name              = "hanoi-lab-han-alb"
  vpc_id            = module.network.vpc_id
  subnet_ids        = [module.network.subnet_ids["han_alb"]]
  security_group_id = module.security.han_alb_id
  instance_id       = module.han_app.instance_id
  tags              = local.common_tags
}
