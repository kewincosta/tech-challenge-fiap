variable "project" {
  description = "The project's name, the first part of every resource name."
  type        = string
}

variable "environment" {
  description = "The environment's name, the second part of every resource name."
  type        = string
}

variable "vpc_cidr" {
  description = "The address range of the VPC."
  type        = string
}

variable "availability_zone_count" {
  description = "How many zones get a public and a private subnet."
  type        = number
}

variable "single_nat_gateway" {
  description = "True for one NAT gateway shared by every private subnet, false for one in each zone."
  type        = bool
}
