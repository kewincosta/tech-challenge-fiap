variable "project" {
  description = "The project's name, the first part of every resource name."
  type        = string
}

variable "environment" {
  description = "The environment's name, the second part of every resource name."
  type        = string
}

variable "registry_image_count" {
  description = "How many images the repository keeps. Older ones expire."
  type        = number
}
