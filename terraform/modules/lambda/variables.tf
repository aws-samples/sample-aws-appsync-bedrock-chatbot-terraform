variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "lambda_execution_role_arn" {
  description = "ARN of the Lambda execution role"
  type        = string
}

variable "bedrock_model_id" {
  description = "Amazon Bedrock model ID"
  type        = string
}

variable "dynamodb_table_name" {
  description = "Name of the DynamoDB table for chat data"
  type        = string
}

# These variables are removed to break the circular dependency
# The AppSync endpoint and API key will be passed through the event payload
