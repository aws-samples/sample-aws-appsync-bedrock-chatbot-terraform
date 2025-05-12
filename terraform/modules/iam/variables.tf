variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "dynamodb_table_arn" {
  description = "ARN of the DynamoDB table for chat data"
  type        = string
}

variable "users_table_arn" {
  description = "ARN of the DynamoDB table for user data"
  type        = string
}

variable "jwt_secret_arn" {
  description = "ARN of the JWT secret in Secrets Manager"
  type        = string
}

variable "appsync_api_id" {
  description = "ID of the AppSync API"
  type        = string
  default     = ""
}
