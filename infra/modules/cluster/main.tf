terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

data "aws_partition" "current" {}

data "aws_caller_identity" "current" {}

locals {
  name = "${var.project}-${var.environment}"

  # The role the CD assumes, made by the bootstrap. Building its ARN from the account of the caller
  # keeps the account id out of the files.
  deploy_role_arn = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:role/${var.deploy_role_name}"

  # The deploy role and every principal in cluster_admin_arns administer the cluster, and nobody
  # else gets in: the cluster creator is not added, and the authentication mode leaves out the
  # aws-auth ConfigMap. The listed principals are keyed by their ARN, which is known when planning,
  # and a principal listed twice counts once: a repeated key would stop the plan.
  administrators = merge(
    { deploy = local.deploy_role_arn },
    { for arn in distinct(var.cluster_admin_arns) : arn => arn if arn != local.deploy_role_arn },
  )

  access_entries = {
    for key, arn in local.administrators : key => {
      principal_arn = arn
      policy_associations = {
        administrator = {
          policy_arn   = "arn:${data.aws_partition.current.partition}:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"
          access_scope = { type = "cluster" }
        }
      }
    }
  }

  # A fixed number of nodes: the pods scale inside them with the HorizontalPodAutoscaler.
  node_groups = {
    default = {
      instance_types = [var.node_instance_type]
      min_size       = var.node_count
      max_size       = var.node_count
      desired_size   = var.node_count
    }
  }
}

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "21.29.0"

  name               = local.name
  kubernetes_version = var.kubernetes_version

  vpc_id     = var.vpc_id
  subnet_ids = var.subnet_ids

  # The GitHub runner and the user's kubectl reach the API server over the internet. The nodes use
  # the private endpoint.
  endpoint_public_access  = true
  endpoint_private_access = true

  authentication_mode                      = "API"
  enable_cluster_creator_admin_permissions = false
  access_entries                           = local.access_entries

  # The pods call no AWS API, so the cluster needs no OIDC provider for service account roles.
  enable_irsa = false

  # EKS upgrades a version that leaves standard support. Extended support costs extra per cluster hour.
  upgrade_policy = {
    support_type = "STANDARD"
  }

  cloudwatch_log_group_retention_in_days = var.cluster_log_retention_days

  eks_managed_node_groups = local.node_groups

  addons = {
    # The network plugin must run before the nodes start, or they never become ready.
    vpc-cni = {
      before_compute = true
    }
    kube-proxy = {}
    coredns    = {}
    # Reads the pods' CPU and memory for the HorizontalPodAutoscaler.
    metrics-server = {}
  }
}
