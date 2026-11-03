# This run tests the registry module on its own, with its variables from environments/prod.tfvars
# through -var-file.

mock_provider "aws" {
  source = "./tests/mocks/aws"
}

run "prod_registry" {
  command = plan

  module {
    source = "./modules/registry"
  }

  assert {
    condition     = aws_ecr_repository.this.image_scanning_configuration[0].scan_on_push == true
    error_message = "The repository must scan each image on push."
  }

  assert {
    condition     = aws_ecr_lifecycle_policy.this.repository == aws_ecr_repository.this.name
    error_message = "The lifecycle policy must belong to the repository."
  }

  assert {
    condition = (
      length(jsondecode(aws_ecr_lifecycle_policy.this.policy).rules) == 1 &&
      jsondecode(aws_ecr_lifecycle_policy.this.policy).rules[0].selection.countType == "imageCountMoreThan" &&
      jsondecode(aws_ecr_lifecycle_policy.this.policy).rules[0].selection.countNumber == 20 &&
      jsondecode(aws_ecr_lifecycle_policy.this.policy).rules[0].selection.tagStatus == "any" &&
      jsondecode(aws_ecr_lifecycle_policy.this.policy).rules[0].action.type == "expire"
    )
    error_message = "The lifecycle policy must expire every image beyond the newest 20."
  }

  assert {
    condition     = aws_ecr_repository.this.force_delete == true
    error_message = "Destroying prod must remove the repository with its images."
  }
}
