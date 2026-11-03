output "vpc_id" {
  description = "The VPC."
  value       = module.vpc.vpc_id
}

output "availability_zones" {
  description = "The zones that hold the subnets."
  value       = module.vpc.azs
}

output "public_subnet_ids" {
  description = "The public subnets, in the order of the zones."
  value       = module.vpc.public_subnets
}

output "private_subnet_ids" {
  description = "The private subnets, in the order of the zones. The nodes, the database and the cache live here."
  value       = module.vpc.private_subnets
}

output "public_subnet_zones" {
  description = "The zone of each public subnet."
  value       = [for subnet in module.vpc.public_subnet_objects : subnet.availability_zone]
}

output "private_subnet_zones" {
  description = "The zone of each private subnet."
  value       = [for subnet in module.vpc.private_subnet_objects : subnet.availability_zone]
}

output "nat_gateway_ids" {
  description = "The NAT gateways."
  value       = module.vpc.natgw_ids
}
