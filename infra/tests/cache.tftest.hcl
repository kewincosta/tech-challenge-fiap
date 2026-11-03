# This run tests the cache module on its own. It gets the private subnets and the cache's security
# group the way main.tf gives them, and every other variable from environments/prod.tfvars through
# -var-file.

mock_provider "aws" {
  source = "./tests/mocks/aws"
}

run "prod_cache" {
  command = plan

  module {
    source = "./modules/cache"
  }

  variables {
    subnet_ids         = ["subnet-0private1", "subnet-0private2"]
    security_group_ids = ["sg-0cache"]
  }

  assert {
    condition = (
      aws_elasticache_replication_group.this.engine == "redis" &&
      startswith(aws_elasticache_replication_group.this.engine_version, "7.")
    )
    error_message = "The cache must be ElastiCache Redis 7."
  }

  assert {
    condition     = aws_elasticache_replication_group.this.node_type == "cache.t4g.micro"
    error_message = "The cache must be a cache.t4g.micro."
  }

  assert {
    condition     = aws_elasticache_replication_group.this.num_cache_clusters == 1
    error_message = "The cache must run one node."
  }

  assert {
    condition     = aws_elasticache_replication_group.this.transit_encryption_enabled == true
    error_message = "The cache must encrypt the traffic in transit."
  }

  assert {
    condition = (
      aws_elasticache_replication_group.this.subnet_group_name == aws_elasticache_subnet_group.this.name &&
      aws_elasticache_subnet_group.this.subnet_ids == toset(["subnet-0private1", "subnet-0private2"])
    )
    error_message = "The cache must live in a subnet group of the private subnets."
  }

  assert {
    condition     = aws_elasticache_replication_group.this.security_group_ids == toset(["sg-0cache"])
    error_message = "The cache must use the security group main.tf gives it."
  }

  assert {
    condition     = aws_elasticache_replication_group.this.parameter_group_name == "default.redis7"
    error_message = "The cache must use the default Redis 7 parameter group."
  }

  assert {
    condition     = aws_elasticache_replication_group.this.auth_token == null
    error_message = "The cache must have no auth token: the application has no Redis password setting."
  }
}
