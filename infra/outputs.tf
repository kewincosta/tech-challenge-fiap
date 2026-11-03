# What the CD and the person operating the environment need to reach it.

output "region" {
  description = "The AWS region."
  value       = var.region
}

output "cluster_name" {
  description = "The name of the EKS cluster."
  value       = module.cluster.cluster_name
}
