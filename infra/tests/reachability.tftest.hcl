mock_provider "aws" {
  source = "./tests/mocks/aws"
}
mock_provider "random" {}
mock_provider "time" {}
mock_provider "tls" {}
mock_provider "cloudinit" {}
mock_provider "null" {}

run "prod_reachability" {
  command = plan

  # The nodes' security group is computed. Giving it a value shows that the rules name that group.
  override_module {
    target          = module.cluster
    override_during = plan
    outputs = {
      cluster_name           = "workshop-prod"
      node_security_group_id = "sg-0nodes"
    }
  }

  assert {
    condition = (
      length(aws_security_group.database.ingress) == 1 &&
      alltrue([for rule in aws_security_group.database.ingress : (
        rule.protocol == "tcp" &&
        rule.from_port == 5432 &&
        rule.to_port == 5432 &&
        rule.security_groups == toset(["sg-0nodes"]) &&
        length(coalesce(rule.cidr_blocks, [])) == 0 &&
        length(coalesce(rule.ipv6_cidr_blocks, [])) == 0 &&
        length(coalesce(rule.prefix_list_ids, [])) == 0 &&
        coalesce(rule.self, false) == false
      )])
    )
    error_message = "The database's security group must hold one rule: TCP 5432 from the nodes' security group and from nothing else."
  }

  assert {
    condition = (
      length(aws_security_group.cache.ingress) == 1 &&
      alltrue([for rule in aws_security_group.cache.ingress : (
        rule.protocol == "tcp" &&
        rule.from_port == 6379 &&
        rule.to_port == 6379 &&
        rule.security_groups == toset(["sg-0nodes"]) &&
        length(coalesce(rule.cidr_blocks, [])) == 0 &&
        length(coalesce(rule.ipv6_cidr_blocks, [])) == 0 &&
        length(coalesce(rule.prefix_list_ids, [])) == 0 &&
        coalesce(rule.self, false) == false
      )])
    )
    error_message = "The cache's security group must hold one rule: TCP 6379 from the nodes' security group and from nothing else."
  }
}
