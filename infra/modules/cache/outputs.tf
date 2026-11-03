output "host" {
  description = "The address the primary node answers on."
  value       = aws_elasticache_replication_group.this.primary_endpoint_address
}

output "port" {
  description = "The port the primary node answers on."
  value       = aws_elasticache_replication_group.this.port
}

output "replication_group_id" {
  description = "The identifier of the replication group."
  value       = aws_elasticache_replication_group.this.replication_group_id
}
