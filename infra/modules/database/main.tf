terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
    random = {
      source = "hashicorp/random"
    }
  }
}

locals {
  name = "${var.project}-${var.environment}"

  # The parameter group family is postgres plus the major version: a 16.x engine uses postgres16.
  family = "postgres${split(".", var.database_engine_version)[0]}"
}

# RDS accepts any printable character except /, @, " and a space. Letters and digits keep the
# password safe to put in a URL, a shell command or a Kubernetes Secret.
resource "random_password" "master" {
  length  = 32
  special = false
}

resource "aws_db_subnet_group" "this" {
  name        = local.name
  description = "The private subnets of the ${local.name} database."
  subnet_ids  = var.subnet_ids
}

resource "aws_db_parameter_group" "this" {
  name        = local.name
  description = "Requires TLS for every connection to the ${local.name} database."
  family      = local.family

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
}

resource "aws_db_instance" "this" {
  identifier     = local.name
  engine         = "postgres"
  engine_version = var.database_engine_version
  instance_class = var.database_instance_class

  allocated_storage = var.database_allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = var.database_name
  username = var.database_user

  # The password is the generated one. manage_master_user_password stays unset, as the provider
  # requires beside password: with it on, RDS would rotate the password every seven days while the
  # pods keep the one they read when they were deployed.
  password = random_password.master.result

  multi_az               = var.database_multi_az
  publicly_accessible    = false
  db_subnet_group_name   = aws_db_subnet_group.this.name
  parameter_group_name   = aws_db_parameter_group.this.name
  vpc_security_group_ids = var.security_group_ids

  # The version the variable file names is the one that runs, until someone changes the file.
  auto_minor_version_upgrade = false
  apply_immediately          = true

  skip_final_snapshot = var.database_skip_final_snapshot
  deletion_protection = var.database_deletion_protection
}
