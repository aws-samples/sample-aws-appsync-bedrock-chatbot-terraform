output "appsync_graphql_endpoint" {
  description = "The endpoint URL for the AppSync GraphQL API"
  value       = module.appsync.graphql_endpoint
}

output "appsync_api_key" {
  description = "The API key for the AppSync GraphQL API"
  value       = module.appsync.api_key
  sensitive   = true
}

output "dynamodb_messages_table_name" {
  description = "The name of the DynamoDB messages table"
  value       = module.dynamodb.messages_table_name
}

output "dynamodb_conversations_table_name" {
  description = "The name of the DynamoDB conversations table"
  value       = module.dynamodb.conversations_table_name
}
