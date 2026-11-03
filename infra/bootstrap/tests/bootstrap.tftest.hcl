# These runs plan with a mocked provider: no credentials are read and nothing reaches AWS. A computed
# value such as an ARN is unknown in a plan, so a run that checks how one resource refers to another
# gives the referenced resource a value during the plan.

mock_provider "aws" {}

run "state_bucket" {
  command = plan

  override_resource {
    target          = aws_s3_bucket.state
    override_during = plan
    values = {
      id = "workshop-tfstate-kewincosta"
    }
  }

  assert {
    condition     = aws_s3_bucket.state.bucket == "workshop-tfstate-kewincosta"
    error_message = "The state bucket must be named workshop-tfstate-kewincosta, the name environments/prod.backend.hcl repeats."
  }

  assert {
    condition = (
      aws_s3_bucket_versioning.state.bucket == aws_s3_bucket.state.id &&
      aws_s3_bucket_versioning.state.versioning_configuration[0].status == "Enabled"
    )
    error_message = "Versioning must be Enabled on the state bucket."
  }

  assert {
    condition = (
      aws_s3_bucket_server_side_encryption_configuration.state.bucket == aws_s3_bucket.state.id &&
      one(aws_s3_bucket_server_side_encryption_configuration.state.rule).apply_server_side_encryption_by_default[0].sse_algorithm == "AES256"
    )
    error_message = "Server-side encryption must be on for the state bucket."
  }

  assert {
    condition = (
      aws_s3_bucket_public_access_block.state.bucket == aws_s3_bucket.state.id &&
      aws_s3_bucket_public_access_block.state.block_public_acls == true &&
      aws_s3_bucket_public_access_block.state.block_public_policy == true &&
      aws_s3_bucket_public_access_block.state.ignore_public_acls == true &&
      aws_s3_bucket_public_access_block.state.restrict_public_buckets == true
    )
    error_message = "All four public access blocks must be on for the state bucket."
  }
}

run "oidc_provider" {
  command = plan

  assert {
    condition     = aws_iam_openid_connect_provider.github.url == "https://token.actions.githubusercontent.com"
    error_message = "The OIDC provider must be the one GitHub Actions signs its tokens with."
  }

  assert {
    condition     = aws_iam_openid_connect_provider.github.client_id_list == toset(["sts.amazonaws.com"])
    error_message = "The OIDC provider must accept only the client id sts.amazonaws.com."
  }
}

run "deploy_role_trust" {
  command = plan

  override_resource {
    target          = aws_iam_openid_connect_provider.github
    override_during = plan
    values = {
      arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
    }
  }

  assert {
    condition     = aws_iam_role.deploy.name == "workshop-deploy"
    error_message = "The role must be named workshop-deploy."
  }

  assert {
    condition     = length(jsondecode(aws_iam_role.deploy.assume_role_policy).Statement) == 1
    error_message = "The trust policy must hold one statement."
  }

  assert {
    condition = (
      jsondecode(aws_iam_role.deploy.assume_role_policy).Statement[0].Effect == "Allow" &&
      jsondecode(aws_iam_role.deploy.assume_role_policy).Statement[0].Action == "sts:AssumeRoleWithWebIdentity"
    )
    error_message = "The statement must allow sts:AssumeRoleWithWebIdentity."
  }

  assert {
    condition = (
      jsondecode(aws_iam_role.deploy.assume_role_policy).Statement[0].Principal == {
        Federated = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
      }
    )
    error_message = "The role must trust the GitHub OIDC provider and nothing else."
  }

  assert {
    condition = (
      jsondecode(aws_iam_role.deploy.assume_role_policy).Statement[0].Condition == {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "repo:kewincosta@72565745/tech-challenge-fiap@1357566072:environment:prod"
        }
      }
    )
    error_message = "The role must require the audience sts.amazonaws.com and the subject repo:kewincosta@72565745/tech-challenge-fiap@1357566072:environment:prod, matched exactly."
  }
}

run "deploy_role_trust_follows_the_prefix" {
  command = plan

  variables {
    github_subject_prefix = "repo:kewincosta@1/tech-challenge-fiap@2"
  }

  override_resource {
    target          = aws_iam_openid_connect_provider.github
    override_during = plan
    values = {
      arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
    }
  }

  assert {
    condition = (
      jsondecode(aws_iam_role.deploy.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == "repo:kewincosta@1/tech-challenge-fiap@2:environment:prod"
    )
    error_message = "The subject must be github_subject_prefix followed by :environment:prod, here repo:kewincosta@1/tech-challenge-fiap@2:environment:prod."
  }
}

run "subject_prefix_without_ids" {
  command = plan

  variables {
    github_subject_prefix = "repo:kewincosta/tech-challenge-fiap"
  }

  expect_failures = [var.github_subject_prefix]
}

run "subject_prefix_without_repository_id" {
  command = plan

  variables {
    github_subject_prefix = "repo:kewincosta@72565745/tech-challenge-fiap"
  }

  expect_failures = [var.github_subject_prefix]
}

run "subject_prefix_without_owner_id" {
  command = plan

  variables {
    github_subject_prefix = "repo:kewincosta/tech-challenge-fiap@1357566072"
  }

  expect_failures = [var.github_subject_prefix]
}

run "subject_prefix_of_another_owner" {
  command = plan

  variables {
    github_subject_prefix = "repo:someone-else@1234/tech-challenge-fiap@1357566072"
  }

  expect_failures = [var.github_subject_prefix]
}

run "subject_prefix_of_another_repository_name" {
  command = plan

  variables {
    github_subject_prefix = "repo:kewincosta@72565745/other-repository@5678"
  }

  expect_failures = [var.github_subject_prefix]
}

run "subject_prefix_of_another_repository" {
  command = plan

  variables {
    github_subject_prefix = "repo:someone-else@1234/other-repository@5678"
  }

  expect_failures = [var.github_subject_prefix]
}

run "deploy_role_permissions" {
  command = plan

  assert {
    condition     = aws_iam_role_policy_attachment.deploy_administrator.policy_arn == "arn:aws:iam::aws:policy/AdministratorAccess"
    error_message = "The deploy role carries the AWS managed AdministratorAccess policy."
  }

  assert {
    condition     = aws_iam_role_policy_attachment.deploy_administrator.role == aws_iam_role.deploy.name
    error_message = "The administrator policy must be attached to the deploy role."
  }
}
