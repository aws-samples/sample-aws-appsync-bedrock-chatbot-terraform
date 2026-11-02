variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "genai-chatbot"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
}

variable "bedrock_model_id" {
  description = "Amazon Bedrock model ID"
  type        = string
  default     = "anthropic.claude-3-sonnet-20240229-v1:0"
}

variable "jwt_secret" {
  description = "Secret key for JWT token signing"
  type        = string
  default     = "change-me-in-production-environment"
  sensitive   = true
}

variable "cors_allowed_origins" {
  description = "List of allowed origins for CORS"
  type        = list(string)
  default     = ["*"]
}

variable "create_knowledge_base" {
  description = "Whether to create the Bedrock Knowledge Base"
  type        = bool
  default     = false
}

variable "log_retention_in_days" {
  description = "Number of days to retain Lambda CloudWatch logs"
  type        = number
  default     = 14

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653], var.log_retention_in_days)
    error_message = "log_retention_in_days must be a value supported by CloudWatch Logs (for example 1, 7, 14, 30, 90, 365)."
  }
}
