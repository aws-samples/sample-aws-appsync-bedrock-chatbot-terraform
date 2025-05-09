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
