mock_provider "aws" {
  source = "./tests/mocks/aws"
}
mock_provider "random" {}
mock_provider "time" {}
mock_provider "tls" {}
mock_provider "cloudinit" {}
mock_provider "null" {}

run "prod_secrets" {
  command = plan

  # What a plan cannot know: the password the database module generates, the JWT secret and the ids
  # of the secrets. Giving them values shows which value goes into which secret.
  override_module {
    target          = module.database
    override_during = plan
    outputs = {
      host     = "database.example"
      port     = 5432
      name     = "workshop"
      user     = "workshop"
      password = "password-from-the-database-module"
    }
  }

  override_resource {
    target          = random_password.jwt_secret
    override_during = plan
    values = {
      result = "jwt-secret-from-random-password"
    }
  }

  override_resource {
    target          = aws_secretsmanager_secret.database_password
    override_during = plan
    values = {
      id = "secret-of-the-database-password"
    }
  }

  override_resource {
    target          = aws_secretsmanager_secret.jwt_secret
    override_during = plan
    values = {
      id = "secret-of-the-jwt-secret"
    }
  }

  assert {
    condition = (
      aws_secretsmanager_secret.database_password.name == "workshop-prod/database-password" &&
      aws_secretsmanager_secret_version.database_password.secret_id == "secret-of-the-database-password" &&
      aws_secretsmanager_secret_version.database_password.secret_string == "password-from-the-database-module"
    )
    error_message = "Secrets Manager must hold the database password the database module generates."
  }

  assert {
    condition = (
      aws_secretsmanager_secret.jwt_secret.name == "workshop-prod/jwt-secret" &&
      aws_secretsmanager_secret_version.jwt_secret.secret_id == "secret-of-the-jwt-secret" &&
      aws_secretsmanager_secret_version.jwt_secret.secret_string == random_password.jwt_secret.result
    )
    error_message = "Secrets Manager must hold the JWT secret Terraform generates."
  }

  assert {
    condition     = random_password.jwt_secret.length >= 32
    error_message = "The JWT secret must have at least 32 characters, the least the application accepts."
  }

  assert {
    condition = (
      aws_secretsmanager_secret.database_password.recovery_window_in_days == 0 &&
      aws_secretsmanager_secret.jwt_secret.recovery_window_in_days == 0
    )
    error_message = "The secrets must have no recovery window, so a destroy followed by an apply can reuse their names."
  }
}
