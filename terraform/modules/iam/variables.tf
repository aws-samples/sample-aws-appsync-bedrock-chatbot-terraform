variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "dynamodb_messages_table_arn" {
  description = "ARN of the DynamoDB messages table"
  type        = string
}

variable "dynamodb_conversations_table_arn" {
  description = "ARN of the DynamoDB conversations table"
  type        = string
}
