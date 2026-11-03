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
