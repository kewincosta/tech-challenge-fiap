# The prod environment, the only one in AWS. A name or a size changes here and nowhere else.

project          = "workshop"
environment      = "prod"
region           = "us-east-1"
deploy_role_name = "workshop-deploy"

# Network: a public and a private subnet in two zones, and one NAT gateway for both.
vpc_cidr                = "10.0.0.0/16"
availability_zone_count = 2
single_nat_gateway      = true

# Cluster: the newest Kubernetes version in standard support, two nodes.
kubernetes_version         = "1.37"
node_instance_type         = "t3.medium"
node_count                 = 2
cluster_log_retention_days = 7

# Database: PostgreSQL 16 in one zone. Destroying prod erases it, with no final snapshot.
database_name                = "workshop"
database_user                = "workshop"
database_engine_version      = "16.15"
database_instance_class      = "db.t4g.micro"
database_allocated_storage   = 20
database_multi_az            = false
database_skip_final_snapshot = true
database_deletion_protection = false

# Cache: Redis 7 on one node.
cache_engine_version = "7.1"
cache_node_type      = "cache.t4g.micro"
cache_node_count     = 1

# Registry: the repository keeps the last 20 images.
registry_image_count = 20
