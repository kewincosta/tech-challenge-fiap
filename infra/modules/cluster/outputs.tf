output "cluster_name" {
  description = "The name of the cluster."
  value       = module.eks.cluster_name
}

output "cluster_version" {
  description = "The Kubernetes version the control plane runs."
  value       = module.eks.cluster_version
}

output "node_security_group_id" {
  description = "The security group of the nodes. The database and the cache admit only this group."
  value       = module.eks.node_security_group_id
}

output "node_groups" {
  description = "The managed node groups the cluster runs, with the size and instance types each was given."
  value       = { for name, _ in module.eks.eks_managed_node_groups : name => local.node_groups[name] }
}

output "addons" {
  description = "The add-ons installed in the cluster, by name."
  value       = module.eks.cluster_addons
}

output "access_entries" {
  description = "The principals that can reach the cluster API."
  value       = module.eks.access_entries
}

output "access_policy_associations" {
  description = "The access policy each principal holds."
  value       = module.eks.access_policy_associations
}
