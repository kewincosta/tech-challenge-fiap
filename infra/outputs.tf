# What the CD and the person operating the environment need to reach it.

output "region" {
  description = "The AWS region."
  value       = var.region
}

output "cluster_name" {
  description = "The name of the EKS cluster."
  value       = module.cluster.cluster_name
}

output "repository_url" {
  description = "The ECR repository the CD pushes the image to."
  value       = module.registry.repository_url
}

output "database_host" {
  description = "The address of the PostgreSQL instance."
  value       = module.database.host
}

output "database_port" {
  description = "The port of the PostgreSQL instance."
  value       = module.database.port
}

output "database_name" {
  description = "The database the application connects to."
  value       = module.database.name
}

output "database_user" {
  description = "The master user of the database."
  value       = module.database.user
}

output "redis_host" {
  description = "The address of the Redis primary node."
  value       = module.cache.host
}

output "redis_port" {
  description = "The port of the Redis primary node."
  value       = module.cache.port
}

output "database_password_secret_name" {
  description = "The Secrets Manager secret that holds the database user's password."
  value       = aws_secretsmanager_secret.database_password.name
}

output "jwt_secret_name" {
  description = "The Secrets Manager secret that holds the JWT secret."
  value       = aws_secretsmanager_secret.jwt_secret.name
}
