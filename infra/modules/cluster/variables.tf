variable "project" {
  description = "The project's name, the first part of every resource name."
  type        = string
}

variable "environment" {
  description = "The environment's name, the second part of every resource name."
  type        = string
}

variable "kubernetes_version" {
  description = "The Kubernetes version of the control plane, as major.minor."
  type        = string
}

variable "node_instance_type" {
  description = "The EC2 instance type of the nodes."
  type        = string
}

variable "node_count" {
  description = "How many nodes the managed node group runs."
  type        = number
}

variable "cluster_log_retention_days" {
  description = "How many days the control plane logs stay in CloudWatch."
  type        = number
}

variable "deploy_role_name" {
  description = "The name of the role the CD assumes. It gets administrator access."
  type        = string
}

variable "cluster_admin_arns" {
  description = "The IAM users and roles, besides the deploy role, that get administrator access. A role's ARN carries no path."
  type        = list(string)
}

variable "vpc_id" {
  description = "The VPC of the cluster."
  type        = string
}

variable "subnet_ids" {
  description = "The private subnets of the nodes."
  type        = list(string)
}
