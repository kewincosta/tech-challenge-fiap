terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

locals {
  name = "${var.project}-${var.environment}"

  # The default parameter group of the major version: a 7.x engine uses default.redis7.
  parameter_group = "default.redis${split(".", var.cache_engine_version)[0]}"
}

resource "aws_elasticache_subnet_group" "this" {
  name        = local.name
  description = "The private subnets of the ${local.name} cache."
  subnet_ids  = var.subnet_ids
}

# A replication group is the only ElastiCache resource that can encrypt the traffic in transit. With
# no auth token the application needs no Redis password, and the security group lets only the
# nodes in.
resource "aws_elasticache_replication_group" "this" {
  replication_group_id = local.name
  description          = "The Redis of ${local.name}."

  engine               = "redis"
  engine_version       = var.cache_engine_version
  node_type            = var.cache_node_type
  num_cache_clusters   = var.cache_node_count
  parameter_group_name = local.parameter_group
  port                 = 6379

  automatic_failover_enabled = false
  multi_az_enabled           = false

  subnet_group_name  = aws_elasticache_subnet_group.this.name
  security_group_ids = var.security_group_ids

  transit_encryption_enabled = true
  transit_encryption_mode    = "required"
  at_rest_encryption_enabled = true

  apply_immediately = true
}
