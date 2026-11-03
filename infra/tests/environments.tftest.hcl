mock_provider "aws" {
  source = "./tests/mocks/aws"
}
mock_provider "random" {}
mock_provider "time" {}
mock_provider "tls" {}
mock_provider "cloudinit" {}
mock_provider "null" {}

# Another environment is another variable file. Only the environment's name changes here, and every
# name the modules and main.tf give carries it. The database instance is the one name not reachable
# from the root: see another_environment_database in database.tftest.hcl.
run "another_environment" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition     = module.cluster.cluster_name == "workshop-staging"
    error_message = "The cluster's name must carry the environment's name."
  }

  assert {
    condition     = module.registry.repository_name == "workshop-staging"
    error_message = "The repository's name must carry the environment's name."
  }

  assert {
    condition     = module.cache.replication_group_id == "workshop-staging"
    error_message = "The cache's name must carry the environment's name."
  }

  assert {
    condition = (
      aws_secretsmanager_secret.database_password.name == "workshop-staging/database-password" &&
      aws_secretsmanager_secret.jwt_secret.name == "workshop-staging/jwt-secret"
    )
    error_message = "The secrets' names must carry the environment's name."
  }

  assert {
    condition = (
      aws_security_group.database.name == "workshop-staging-database" &&
      aws_security_group.cache.name == "workshop-staging-cache"
    )
    error_message = "The security groups' names must carry the environment's name."
  }

  assert {
    condition = !anytrue([for name in [
      module.cluster.cluster_name,
      module.registry.repository_name,
      module.cache.replication_group_id,
      aws_secretsmanager_secret.database_password.name,
      aws_secretsmanager_secret.jwt_secret.name,
      aws_security_group.database.name,
      aws_security_group.cache.name,
    ] : strcontains(name, "prod")])
    error_message = "No name may still carry the name of the prod environment."
  }
}
