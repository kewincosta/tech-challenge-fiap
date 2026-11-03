variable "project" {
  description = "The project's name, the first part of every resource name."
  type        = string
}

variable "environment" {
  description = "The environment's name, the second part of every resource name."
  type        = string
}

variable "database_name" {
  description = "The database the instance creates."
  type        = string
}

variable "database_user" {
  description = "The master user of the instance."
  type        = string
}

variable "database_engine_version" {
  description = "The PostgreSQL version, with its minor."
  type        = string
}

variable "database_instance_class" {
  description = "The instance class."
  type        = string
}

variable "database_allocated_storage" {
  description = "The storage in GiB."
  type        = number
}

variable "database_multi_az" {
  description = "Whether a standby in another zone backs the instance."
  type        = bool
}

variable "database_skip_final_snapshot" {
  description = "Whether destroying the instance skips the last snapshot, which erases the data for good."
  type        = bool
}

variable "database_deletion_protection" {
  description = "Whether AWS refuses to delete the instance until the protection is switched off."
  type        = bool
}

variable "subnet_ids" {
  description = "The private subnets of the instance."
  type        = list(string)
}

variable "security_group_ids" {
  description = "The security groups of the instance."
  type        = list(string)
}
