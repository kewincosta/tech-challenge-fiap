terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

locals {
  name = "${var.project}-${var.environment}"
}

resource "aws_ecr_repository" "this" {
  name = local.name

  # Destroying the environment removes the repository with its images.
  force_delete = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "this" {
  repository = aws_ecr_repository.this.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last ${var.registry_image_count} images."
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = var.registry_image_count
      }
      action = { type = "expire" }
    }]
  })
}
