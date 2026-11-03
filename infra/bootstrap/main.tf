# Applied once, by hand, with the user's own credentials. The state of this folder stays local
# (terraform.tfstate here, which git ignores): the bucket that would hold it is created by it.
#
# It makes what the main stack and the CD need before they can run: the bucket for the main stack's
# state, the GitHub OIDC provider, and the role the CD assumes.

terraform {
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.71.0"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      ManagedBy = "terraform"
      Stack     = "bootstrap"
    }
  }
}

locals {
  github_oidc_host = "token.actions.githubusercontent.com"
}

# The state of the main stack. Versioning keeps every earlier state, and the public access blocks
# close the bucket whatever policy or ACL is put on it later.
resource "aws_s3_bucket" "state" {
  bucket = var.state_bucket_name
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# GitHub signs the token of each workflow job. IAM checks it against GitHub's published keys, so the
# provider needs no thumbprint.
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://${local.github_oidc_host}"
  client_id_list = ["sts.amazonaws.com"]
}

# The only way into the role is a job that runs in this repository's GitHub environment. The
# subject names the repository and the environment exactly, so no other branch, pull request or
# repository can assume it.
resource "aws_iam_role" "deploy" {
  name        = var.deploy_role_name
  description = "Assumed by the CD jobs of the ${var.github_environment} environment of ${var.github_repository}."

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRoleWithWebIdentity"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Condition = {
        StringEquals = {
          "${local.github_oidc_host}:aud" = "sts.amazonaws.com"
          "${local.github_oidc_host}:sub" = "repo:${var.github_repository}:environment:${var.github_environment}"
        }
      }
    }]
  })
}

# The main stack creates and destroys IAM roles, a VPC, EKS, RDS, ElastiCache, ECR, Secrets Manager,
# KMS keys and CloudWatch log groups. Listing every action of those services would take hundreds of
# lines, so the trust above is the limit and the permissions are the AWS managed administrator ones.
resource "aws_iam_role_policy_attachment" "deploy_administrator" {
  role       = aws_iam_role.deploy.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}
