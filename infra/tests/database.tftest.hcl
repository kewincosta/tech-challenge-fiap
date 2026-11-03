# These runs test the database module on its own. It gets the private subnets and the database's
# security group the way main.tf gives them, and every other variable from environments/prod.tfvars
# through -var-file, because the module's variables carry the names the file sets.

mock_provider "aws" {
  source = "./tests/mocks/aws"
}
mock_provider "random" {}

run "prod_database" {
  command = plan

  module {
    source = "./modules/database"
  }

  variables {
    subnet_ids         = ["subnet-0private1", "subnet-0private2"]
    security_group_ids = ["sg-0database"]
  }

  # The generated password is computed. Giving it a value shows that the instance takes it.
  override_resource {
    target          = random_password.master
    override_during = plan
    values = {
      result = "generated-password"
    }
  }

  assert {
    condition = (
      aws_db_instance.this.engine == "postgres" &&
      startswith(aws_db_instance.this.engine_version, "16.")
    )
    error_message = "The database must be RDS PostgreSQL 16."
  }

  assert {
    condition     = aws_db_instance.this.instance_class == "db.t4g.micro"
    error_message = "The database must be a db.t4g.micro."
  }

  assert {
    condition     = aws_db_instance.this.multi_az == false
    error_message = "The database must not be Multi-AZ."
  }

  assert {
    condition     = aws_db_instance.this.publicly_accessible == false
    error_message = "The database must not be publicly accessible."
  }

  assert {
    condition     = aws_db_instance.this.storage_encrypted == true
    error_message = "The database storage must be encrypted."
  }

  assert {
    condition = (
      aws_db_instance.this.db_subnet_group_name == aws_db_subnet_group.this.name &&
      aws_db_subnet_group.this.subnet_ids == toset(["subnet-0private1", "subnet-0private2"])
    )
    error_message = "The database must live in a subnet group of the private subnets."
  }

  assert {
    condition     = aws_db_instance.this.vpc_security_group_ids == toset(["sg-0database"])
    error_message = "The database must use the security group main.tf gives it."
  }

  assert {
    condition = (
      aws_db_instance.this.parameter_group_name == aws_db_parameter_group.this.name &&
      aws_db_parameter_group.this.family == "postgres16" &&
      [for parameter in aws_db_parameter_group.this.parameter : parameter.value if parameter.name == "rds.force_ssl"] == ["1"]
    )
    error_message = "The database must use a PostgreSQL 16 parameter group that sets rds.force_ssl to 1."
  }

  assert {
    condition = (
      aws_db_instance.this.password == "generated-password" &&
      aws_db_instance.this.password == random_password.master.result &&
      random_password.master.length >= 16
    )
    error_message = "The user's password must be the one Terraform generates."
  }

  assert {
    condition     = aws_db_instance.this.manage_master_user_password != true
    error_message = "manage_master_user_password must stay off: RDS would rotate the password the pods hold."
  }

  assert {
    condition = (
      aws_db_instance.this.username == "workshop" &&
      aws_db_instance.this.db_name == "workshop"
    )
    error_message = "The user and the database must carry the names environments/prod.tfvars sets."
  }
}

run "prod_database_lifecycle" {
  command = plan

  module {
    source = "./modules/database"
  }

  variables {
    subnet_ids         = ["subnet-0private1", "subnet-0private2"]
    security_group_ids = ["sg-0database"]
  }

  assert {
    condition     = aws_db_instance.this.skip_final_snapshot == true
    error_message = "Destroying the database must take no final snapshot."
  }

  assert {
    condition     = aws_db_instance.this.deletion_protection == false
    error_message = "The database must have deletion protection off."
  }
}

# The identifier is not an output of the module, so the run that changes the environment reaches it
# here, with the other settings from environments/prod.tfvars.
run "another_environment_database" {
  command = plan

  module {
    source = "./modules/database"
  }

  variables {
    environment        = "staging"
    subnet_ids         = ["subnet-0private1", "subnet-0private2"]
    security_group_ids = ["sg-0database"]
  }

  assert {
    condition = (
      aws_db_instance.this.identifier == "workshop-staging" &&
      aws_db_subnet_group.this.name == "workshop-staging" &&
      aws_db_parameter_group.this.name == "workshop-staging"
    )
    error_message = "The database and what it uses must carry the environment's name."
  }
}
