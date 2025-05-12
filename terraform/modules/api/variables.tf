variable "project_name" {
  description = "Name of the project, used as a prefix for resource names"
  type        = string
}

variable "auth_lambda_invoke_arn" {
  description = "ARN of the Auth Lambda function for invocation"
  type        = string
}

variable "auth_lambda_function_name" {
  description = "Name of the Auth Lambda function"
  type        = string
}

variable "cors_allowed_origins" {
  description = "List of allowed origins for CORS"
  type        = list(string)
  default     = ["*"]
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
