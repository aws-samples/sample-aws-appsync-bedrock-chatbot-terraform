variable "project_name" {
  description = "Name of the project, used as a prefix for resource names"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "jwt_secret" {
  description = "Secret key for JWT token signing"
  type        = string
  default     = null  # Make it optional since we're generating a random one if not provided
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
