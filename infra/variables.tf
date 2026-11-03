# Every size and every name an environment sets comes from its file in environments/. Only
# cluster_admin_arns has a default, because the CD passes it from a GitHub variable.

variable "project" {
  description = "The project's name, the first part of every resource name."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,18}[a-z0-9]$", var.project))
    error_message = "The project name must be 3 to 20 lowercase letters, digits or hyphens, starting with a letter."
  }
}

variable "environment" {
  description = "The environment's name, the second part of every resource name."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,18}[a-z0-9]$", var.environment))
    error_message = "The environment name must be 3 to 20 lowercase letters, digits or hyphens, starting with a letter."
  }
}

variable "region" {
  description = "The AWS region."
  type        = string
}

variable "deploy_role_name" {
  description = "The name of the role the CD assumes, made by the bootstrap. It gets administrator access to the cluster."
  type        = string
}

variable "vpc_cidr" {
  description = "The address range of the VPC."
  type        = string
}

variable "availability_zone_count" {
  description = "How many zones get a public and a private subnet."
  type        = number

  validation {
    condition     = var.availability_zone_count >= 2
    error_message = "RDS and ElastiCache need subnets in at least two zones."
  }
}

variable "single_nat_gateway" {
  description = "True for one NAT gateway shared by every private subnet, false for one in each zone."
  type        = bool
}

variable "kubernetes_version" {
  description = "The Kubernetes version of the control plane, as major.minor."
  type        = string
}

variable "node_instance_type" {
  description = "The EC2 instance type of the cluster's nodes."
  type        = string
}

variable "node_count" {
  description = "How many nodes the cluster's node group runs."
  type        = number
}

variable "cluster_log_retention_days" {
  description = "How many days the control plane logs stay in CloudWatch."
  type        = number
}

variable "cluster_admin_arns" {
  description = "The IAM users and roles, besides the deploy role, that get administrator access to the cluster. A role's ARN carries no path."
  type        = list(string)
  default     = []
}
