resource "aws_security_group" "sg_alb" {
  name_prefix = "${var.name}-sg-alb-"
  description = "Public HTTP to the Singapore application load balancer"
  vpc_id      = var.vpc_id
  ingress     = []
  egress      = []
  tags        = merge(var.tags, { Name = "${var.name}-sg-alb" })
}

resource "aws_security_group" "han_alb" {
  name_prefix = "${var.name}-han-alb-"
  description = "Public HTTP to the Hanoi Local Zone application load balancer"
  vpc_id      = var.vpc_id
  ingress     = []
  egress      = []
  tags        = merge(var.tags, { Name = "${var.name}-han-alb" })
}

resource "aws_security_group" "sg_app" {
  name_prefix = "${var.name}-sg-app-"
  description = "Singapore application instances; no public ingress"
  vpc_id      = var.vpc_id
  ingress     = []
  egress      = []
  tags        = merge(var.tags, { Name = "${var.name}-sg-app" })
}

resource "aws_security_group" "han_app" {
  name_prefix = "${var.name}-han-app-"
  description = "Hanoi application instances; no public ingress"
  vpc_id      = var.vpc_id
  ingress     = []
  egress      = []
  tags        = merge(var.tags, { Name = "${var.name}-han-app" })
}

resource "aws_security_group" "rds" {
  name_prefix = "${var.name}-rds-"
  description = "Private Singapore RDS PostgreSQL"
  vpc_id      = var.vpc_id
  ingress     = []
  egress      = []
  tags        = merge(var.tags, { Name = "${var.name}-rds" })
}

resource "aws_security_group" "han_db" {
  name_prefix = "${var.name}-han-db-"
  description = "Private Hanoi PostgreSQL; application security groups only"
  vpc_id      = var.vpc_id
  ingress     = []
  egress      = []
  tags        = merge(var.tags, { Name = "${var.name}-han-db" })
}

resource "aws_security_group" "endpoints" {
  name_prefix = "${var.name}-endpoints-"
  description = "TLS from private lab workloads to interface endpoints"
  vpc_id      = var.vpc_id
  ingress     = []
  egress      = []
  tags        = merge(var.tags, { Name = "${var.name}-endpoints" })
}

resource "aws_vpc_security_group_ingress_rule" "sg_alb_http" {
  security_group_id = aws_security_group.sg_alb.id
  description       = "HTTP demo endpoint"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  cidr_ipv4         = "0.0.0.0/0"
}
resource "aws_vpc_security_group_ingress_rule" "han_alb_http" {
  security_group_id = aws_security_group.han_alb.id
  description       = "HTTP demo endpoint"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  cidr_ipv4         = "0.0.0.0/0"
}
resource "aws_vpc_security_group_egress_rule" "sg_alb_backend" {
  security_group_id            = aws_security_group.sg_alb.id
  description                  = "Application targets"
  ip_protocol                  = "tcp"
  from_port                    = 8080
  to_port                      = 8081
  referenced_security_group_id = aws_security_group.sg_app.id
}
resource "aws_vpc_security_group_egress_rule" "han_alb_backend" {
  security_group_id            = aws_security_group.han_alb.id
  description                  = "Application targets"
  ip_protocol                  = "tcp"
  from_port                    = 8080
  to_port                      = 8081
  referenced_security_group_id = aws_security_group.han_app.id
}

resource "aws_vpc_security_group_ingress_rule" "sg_app_backend" {
  security_group_id            = aws_security_group.sg_app.id
  description                  = "Backend from Singapore ALB"
  ip_protocol                  = "tcp"
  from_port                    = 8080
  to_port                      = 8080
  referenced_security_group_id = aws_security_group.sg_alb.id
}
resource "aws_vpc_security_group_ingress_rule" "sg_app_frontend" {
  security_group_id            = aws_security_group.sg_app.id
  description                  = "Frontend from Singapore ALB"
  ip_protocol                  = "tcp"
  from_port                    = 8081
  to_port                      = 8081
  referenced_security_group_id = aws_security_group.sg_alb.id
}
resource "aws_vpc_security_group_ingress_rule" "han_app_backend" {
  security_group_id            = aws_security_group.han_app.id
  description                  = "Backend from Hanoi ALB"
  ip_protocol                  = "tcp"
  from_port                    = 8080
  to_port                      = 8080
  referenced_security_group_id = aws_security_group.han_alb.id
}
resource "aws_vpc_security_group_ingress_rule" "han_app_frontend" {
  security_group_id            = aws_security_group.han_app.id
  description                  = "Frontend from Hanoi ALB"
  ip_protocol                  = "tcp"
  from_port                    = 8081
  to_port                      = 8081
  referenced_security_group_id = aws_security_group.han_alb.id
}

resource "aws_vpc_security_group_egress_rule" "sg_app_https" {
  security_group_id = aws_security_group.sg_app.id
  description       = "HTTPS to AWS endpoints and S3"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
}
resource "aws_vpc_security_group_egress_rule" "han_app_https" {
  security_group_id = aws_security_group.han_app.id
  description       = "HTTPS to AWS endpoints and S3"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
}
resource "aws_vpc_security_group_egress_rule" "han_db_https" {
  security_group_id = aws_security_group.han_db.id
  description       = "HTTPS to AWS endpoints and S3"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
}
resource "aws_vpc_security_group_egress_rule" "sg_app_postgres" {
  security_group_id = aws_security_group.sg_app.id
  description       = "PostgreSQL in shared VPC"
  ip_protocol       = "tcp"
  from_port         = 5432
  to_port           = 5432
  cidr_ipv4         = var.vpc_cidr
}
resource "aws_vpc_security_group_egress_rule" "han_app_postgres" {
  security_group_id = aws_security_group.han_app.id
  description       = "Hanoi PostgreSQL"
  ip_protocol       = "tcp"
  from_port         = 5432
  to_port           = 5432
  cidr_ipv4         = var.vpc_cidr
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_sg_app" {
  security_group_id            = aws_security_group.rds.id
  description                  = "PostgreSQL from Singapore application"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.sg_app.id
}
resource "aws_vpc_security_group_ingress_rule" "han_db_from_han_app" {
  security_group_id            = aws_security_group.han_db.id
  description                  = "PostgreSQL from Hanoi application"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.han_app.id
}
resource "aws_vpc_security_group_ingress_rule" "han_db_from_sg_app" {
  security_group_id            = aws_security_group.han_db.id
  description                  = "Future hybrid PostgreSQL from Singapore application"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.sg_app.id
}

resource "aws_vpc_security_group_ingress_rule" "endpoints_https" {
  security_group_id = aws_security_group.endpoints.id
  description       = "TLS from lab VPC"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = var.vpc_cidr
}
resource "aws_vpc_security_group_egress_rule" "endpoints_responses" {
  security_group_id = aws_security_group.endpoints.id
  description       = "Endpoint responses"
  ip_protocol       = "-1"
  cidr_ipv4         = var.vpc_cidr
}

