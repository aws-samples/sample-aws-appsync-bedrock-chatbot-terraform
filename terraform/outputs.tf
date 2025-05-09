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
