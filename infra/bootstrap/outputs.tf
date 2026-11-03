output "state_bucket" {
  description = "The bucket that environments/prod.backend.hcl names."
  value       = aws_s3_bucket.state.bucket
}

output "oidc_provider_arn" {
  description = "The GitHub OIDC provider."
  value       = aws_iam_openid_connect_provider.github.arn
}

output "deploy_role_arn" {
  description = "The ARN to store in the secret DEPLOY_ROLE_ARN of the GitHub prod environment."
  value       = aws_iam_role.deploy.arn
}
