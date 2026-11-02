output "appsync_graphql_endpoint" {
  description = "The endpoint URL for the AppSync GraphQL API"
  value       = module.appsync.graphql_endpoint
}

output "appsync_api_key" {
  description = "The API key for the AppSync GraphQL API"
  value       = module.appsync.api_key
  sensitive   = true
}

output "dynamodb_chatbot_data_table_name" {
  description = "The name of the DynamoDB chatbot data table"
  value       = module.dynamodb.chatbot_data_table_name
}

output "dynamodb_chatbot_data_table_arn" {
  description = "The ARN of the DynamoDB chatbot data table"
  value       = module.dynamodb.chatbot_data_table_arn
}

output "dynamodb_users_table_name" {
  description = "The name of the DynamoDB users table"
  value       = module.dynamodb.users_table_name
}

output "dynamodb_users_table_arn" {
  description = "The ARN of the DynamoDB users table"
  value       = module.dynamodb.users_table_arn
}

output "auth_api_endpoint" {
  description = "The endpoint URL for the Auth API Gateway"
  value       = module.api.auth_api_endpoint
}

output "jwt_secret_arn" {
  description = "The ARN of the JWT secret in Secrets Manager"
  value       = module.secrets.jwt_secret_arn
  sensitive   = true
}

# Frontend outputs
output "frontend_url" {
  description = "URL of the deployed frontend"
  value       = module.frontend.frontend_url
}

output "frontend_bucket_name" {
  description = "Name of the S3 bucket hosting the frontend"
  value       = module.frontend.frontend_bucket_name
}

output "cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution"
  value       = module.frontend.cloudfront_distribution_id
}

# Bedrock Knowledge Base outputs
output "opensearch_collection_id" {
  description = "ID of the OpenSearch Serverless Collection"
  value       = module.bedrock.opensearch_collection_id
}

output "opensearch_collection_arn" {
  description = "ARN of the OpenSearch Serverless Collection"
  value       = module.bedrock.opensearch_collection_arn
}
