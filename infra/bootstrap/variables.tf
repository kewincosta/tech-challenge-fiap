variable "region" {
  description = "The region of the bucket and of the provider calls."
  type        = string
  default     = "us-east-1"
}

variable "state_bucket_name" {
  description = "The bucket for the main stack's state. A backend file cannot take variables, so environments/prod.backend.hcl repeats this name."
  type        = string
  default     = "workshop-tfstate-kewincosta"
}

variable "github_repository" {
  description = "The repository whose workflows may assume the deploy role, as owner/name."
  type        = string
  default     = "kewincosta/tech-challenge-fiap"
}

variable "github_subject_prefix" {
  description = "The prefix of the subject GitHub puts in the token of a job: the sub_claim_prefix of `gh api repos/<owner>/<repo>/actions/oidc/customization/sub`. It carries the owner and repository IDs, as repo:<owner>@<owner id>/<name>@<repository id>."
  type        = string
  default     = "repo:kewincosta@72565745/tech-challenge-fiap@1357566072"

  validation {
    condition     = can(regex("^repo:[^/@:]+@[0-9]+/[^/@:]+@[0-9]+$", var.github_subject_prefix))
    error_message = "The prefix must carry the owner and repository IDs, as repo:<owner>@<digits>/<name>@<digits>. Read it from the sub_claim_prefix of `gh api repos/<owner>/<repo>/actions/oidc/customization/sub`."
  }

  validation {
    condition     = try(join("/", regex("^repo:([^/@:]+)@[0-9]+/([^/@:]+)@[0-9]+$", var.github_subject_prefix)) == var.github_repository, false)
    error_message = "The owner and the repository name in github_subject_prefix must be those of github_repository."
  }
}

variable "github_environment" {
  description = "The GitHub environment whose jobs may assume the deploy role."
  type        = string
  default     = "prod"
}

variable "deploy_role_name" {
  description = "The name of the role the CD assumes. The main stack's variable file repeats it."
  type        = string
  default     = "workshop-deploy"
}
