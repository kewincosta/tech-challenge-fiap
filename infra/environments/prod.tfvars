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

# Registry: the repository keeps the last 20 images.
registry_image_count = 20
