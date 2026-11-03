# The one entry of the infrastructure. It wires the modules in modules/ and holds what joins them:
# who may reach the database and the cache, and the secrets the CD hands to the pods. An
# environment is a pair of files in environments/, applied as:
#
#   terraform init -backend-config=environments/prod.backend.hcl
#   terraform apply -var-file=environments/prod.tfvars

terraform {
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.71.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "3.9.1"
    }
  }

  # The bucket, the key and the region come from the environment's backend file.
  backend "s3" {}
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

locals {
  name = "${var.project}-${var.environment}"
}

module "network" {
  source = "./modules/network"

  project                 = var.project
  environment             = var.environment
  vpc_cidr                = var.vpc_cidr
  availability_zone_count = var.availability_zone_count
  single_nat_gateway      = var.single_nat_gateway
}

module "cluster" {
  source = "./modules/cluster"

  project                    = var.project
  environment                = var.environment
  kubernetes_version         = var.kubernetes_version
  node_instance_type         = var.node_instance_type
  node_count                 = var.node_count
  cluster_log_retention_days = var.cluster_log_retention_days
  deploy_role_name           = var.deploy_role_name
  cluster_admin_arns         = var.cluster_admin_arns
  vpc_id                     = module.network.vpc_id
  subnet_ids                 = module.network.private_subnet_ids
}

module "database" {
  source = "./modules/database"

  project                      = var.project
  environment                  = var.environment
  database_name                = var.database_name
  database_user                = var.database_user
  database_engine_version      = var.database_engine_version
  database_instance_class      = var.database_instance_class
  database_allocated_storage   = var.database_allocated_storage
  database_multi_az            = var.database_multi_az
  database_skip_final_snapshot = var.database_skip_final_snapshot
  database_deletion_protection = var.database_deletion_protection
  subnet_ids                   = module.network.private_subnet_ids
  security_group_ids           = [aws_security_group.database.id]
}

module "cache" {
  source = "./modules/cache"

  project              = var.project
  environment          = var.environment
  cache_engine_version = var.cache_engine_version
  cache_node_type      = var.cache_node_type
  cache_node_count     = var.cache_node_count
  subnet_ids           = module.network.private_subnet_ids
  security_group_ids   = [aws_security_group.cache.id]
}

module "registry" {
  source = "./modules/registry"

  project              = var.project
  environment          = var.environment
  registry_image_count = var.registry_image_count
}

# Only the cluster's nodes reach the database and the cache. Each group holds one rule, a source
# group and a port, and no address range.
resource "aws_security_group" "database" {
  name        = "${local.name}-database"
  description = "PostgreSQL, open to the nodes of the ${local.name} cluster only."
  vpc_id      = module.network.vpc_id

  ingress {
    description     = "PostgreSQL from the nodes"
    protocol        = "tcp"
    from_port       = 5432
    to_port         = 5432
    security_groups = [module.cluster.node_security_group_id]
  }
}

resource "aws_security_group" "cache" {
  name        = "${local.name}-cache"
  description = "Redis, open to the nodes of the ${local.name} cluster only."
  vpc_id      = module.network.vpc_id

  ingress {
    description     = "Redis from the nodes"
    protocol        = "tcp"
    from_port       = 6379
    to_port         = 6379
    security_groups = [module.cluster.node_security_group_id]
  }
}

# Secrets Manager keeps what the CD hands to the pods. A recovery window of 0 deletes a secret at
# once, so destroying the environment and applying it again can reuse the names.
resource "aws_secretsmanager_secret" "database_password" {
  name                    = "${local.name}/database-password"
  description             = "The password of the ${var.database_user} user of the ${local.name} database."
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "database_password" {
  secret_id     = aws_secretsmanager_secret.database_password.id
  secret_string = module.database.password
}

# The application refuses a JWT secret shorter than 32 characters.
resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "${local.name}/jwt-secret"
  description             = "The key the ${local.name} application signs its tokens with."
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = random_password.jwt_secret.result
}
