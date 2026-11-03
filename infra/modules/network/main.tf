terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

data "aws_availability_zones" "available" {
  state = "available"

  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

locals {
  name = "${var.project}-${var.environment}"
  azs  = slice(data.aws_availability_zones.available.names, 0, var.availability_zone_count)

  # One public and one private subnet per zone, each cut from the VPC range into blocks of a sixteenth.
  # The private ones follow the public ones, and they carry the nodes and the pods.
  public_subnets  = [for index, _ in local.azs : cidrsubnet(var.vpc_cidr, 4, index)]
  private_subnets = [for index, _ in local.azs : cidrsubnet(var.vpc_cidr, 4, index + length(local.azs))]
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "6.7.3"

  name = local.name
  cidr = var.vpc_cidr
  azs  = local.azs

  public_subnets  = local.public_subnets
  private_subnets = local.private_subnets

  # The private subnets reach the internet through the NAT gateway: one for the whole VPC when
  # single_nat_gateway is true, otherwise one per zone.
  enable_nat_gateway     = true
  single_nat_gateway     = var.single_nat_gateway
  one_nat_gateway_per_az = !var.single_nat_gateway

  enable_dns_hostnames = true
  enable_dns_support   = true

  # Kubernetes places the load balancer of a Service in the subnets with these tags.
  public_subnet_tags = {
    "kubernetes.io/role/elb"              = "1"
    "kubernetes.io/cluster/${local.name}" = "shared"
  }
  private_subnet_tags = {
    "kubernetes.io/role/internal-elb"     = "1"
    "kubernetes.io/cluster/${local.name}" = "shared"
  }
}
