# The one entry of the infrastructure. It wires the modules in modules/. An environment is a pair
# of files in environments/, applied as:
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
