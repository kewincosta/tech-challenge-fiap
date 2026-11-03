mock_provider "aws" {
  source = "./tests/mocks/aws"
}
mock_provider "time" {}
mock_provider "tls" {}
mock_provider "cloudinit" {}
mock_provider "null" {}

run "prod_cluster" {
  command = plan

  assert {
    condition     = module.cluster.cluster_version == "1.37"
    error_message = "The cluster must run Kubernetes 1.37, the version environments/prod.tfvars pins."
  }

  assert {
    condition     = keys(module.cluster.node_groups) == ["default"]
    error_message = "The cluster must run one managed node group."
  }

  assert {
    condition = (
      module.cluster.node_groups.default.desired_size == 2 &&
      module.cluster.node_groups.default.min_size == 2 &&
      module.cluster.node_groups.default.max_size == 2
    )
    error_message = "The node group must hold two nodes."
  }

  assert {
    condition     = module.cluster.node_groups.default.instance_types == ["t3.medium"]
    error_message = "The nodes must be t3.medium."
  }

  assert {
    condition     = contains(keys(module.cluster.addons), "metrics-server") && module.cluster.addons["metrics-server"].addon_name == "metrics-server"
    error_message = "The cluster must install the metrics-server add-on."
  }
}

run "cluster_access" {
  command = plan

  variables {
    cluster_admin_arns = [
      "arn:aws:iam::123456789012:user/alice",
      "arn:aws:iam::123456789012:role/operators",
    ]
  }

  assert {
    condition = toset([for entry in values(module.cluster.access_entries) : entry.principal_arn]) == toset([
      "arn:aws:iam::123456789012:role/workshop-deploy",
      "arn:aws:iam::123456789012:user/alice",
      "arn:aws:iam::123456789012:role/operators",
    ])
    error_message = "Only the deploy role and the principals in cluster_admin_arns may have an access entry."
  }

  assert {
    condition = (
      length(module.cluster.access_policy_associations) == 3 &&
      alltrue([for association in values(module.cluster.access_policy_associations) : (
        association.policy_arn == "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy" &&
        association.access_scope[0].type == "cluster"
      )])
    )
    error_message = "Each of the three principals must hold AmazonEKSClusterAdminPolicy at cluster scope."
  }
}

run "cluster_access_without_admins" {
  command = plan

  variables {
    cluster_admin_arns = []
  }

  assert {
    condition = (
      length(module.cluster.access_entries) == 1 &&
      module.cluster.access_entries["deploy"].principal_arn == "arn:aws:iam::123456789012:role/workshop-deploy"
    )
    error_message = "With no cluster_admin_arns, the deploy role must be the only principal with an access entry."
  }

  assert {
    condition = (
      length(module.cluster.access_policy_associations) == 1 &&
      module.cluster.access_policy_associations["deploy_administrator"].policy_arn == "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy" &&
      module.cluster.access_policy_associations["deploy_administrator"].access_scope[0].type == "cluster"
    )
    error_message = "The deploy role must hold AmazonEKSClusterAdminPolicy at cluster scope, and nobody else may hold a policy."
  }
}
