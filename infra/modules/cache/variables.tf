variable "project" {
  description = "The project's name, the first part of every resource name."
  type        = string
}

variable "environment" {
  description = "The environment's name, the second part of every resource name."
  type        = string
}

variable "cache_engine_version" {
  description = "The Redis version."
  type        = string
}

variable "cache_node_type" {
  description = "The node type."
  type        = string
}

variable "cache_node_count" {
  description = "How many nodes the group runs."
  type        = number
}

variable "subnet_ids" {
  description = "The private subnets of the group."
  type        = list(string)
}

variable "security_group_ids" {
  description = "The security groups of the group."
  type        = list(string)
}
