output "graphql_endpoint" {
  value = aws_appsync_graphql_api.chatbot_api.uris["GRAPHQL"]
}

output "api_key" {
  value = aws_appsync_api_key.chatbot_api_key.key
}

output "api_id" {
  value = aws_appsync_graphql_api.chatbot_api.id
}

output "api_name" {
  value = aws_appsync_graphql_api.chatbot_api.name
}
