# These runs plan with mocked providers: no credentials are read and nothing reaches AWS. They run
# with -var-file=environments/prod.tfvars. A run against the root configuration reaches the root's
# resources and the outputs of the modules, and a run with a module block reaches that module's own
# resources.

mock_provider "aws" {
  source = "./tests/mocks/aws"
}
mock_provider "time" {}
mock_provider "tls" {}
mock_provider "cloudinit" {}
mock_provider "null" {}

run "prod_network" {
  command = plan

  assert {
    condition     = length(distinct(module.network.availability_zones)) == 2
    error_message = "The network must span two zones."
  }

  assert {
    condition = (
      length(module.network.public_subnet_ids) == 2 &&
      toset(module.network.public_subnet_zones) == toset(module.network.availability_zones)
    )
    error_message = "Each of the two zones must hold one public subnet."
  }

  assert {
    condition = (
      length(module.network.private_subnet_ids) == 2 &&
      toset(module.network.private_subnet_zones) == toset(module.network.availability_zones)
    )
    error_message = "Each of the two zones must hold one private subnet."
  }

  assert {
    condition     = length(module.network.nat_gateway_ids) == 1
    error_message = "The network must have one NAT gateway."
  }
}
