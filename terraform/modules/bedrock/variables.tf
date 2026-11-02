variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "aws_region" {
  description = "AWS region for the resources"
  type        = string
  default     = "us-east-1"
}

variable "embedding_model_arn" {
  description = "ARN of the Amazon Bedrock embedding model"
  type        = string
  default     = "arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v1"
}

variable "user_documents_bucket_arn" {
  description = "ARN of the S3 bucket for user documents"
  type        = string
}

variable "lambda_execution_role_arn" {
  description = "ARN of the Lambda execution role"
  type        = string
}

variable "bedrock_service_role_arn" {
  description = "ARN of the Bedrock service role"
  type        = string
  default     = ""
}

variable "create_knowledge_base" {
  description = "Whether to create the Bedrock Knowledge Base"
  type        = bool
  default     = false
}
