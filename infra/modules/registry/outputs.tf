output "repository_url" {
  description = "The address to push images to and pull them from."
  value       = aws_ecr_repository.this.repository_url
}

output "repository_name" {
  description = "The name of the repository."
  value       = aws_ecr_repository.this.name
}
