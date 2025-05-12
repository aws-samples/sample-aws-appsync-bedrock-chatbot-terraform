output "chatbot_data_table_name" {
  value = aws_dynamodb_table.chatbot_data.name
}

output "chatbot_data_table_arn" {
  value = aws_dynamodb_table.chatbot_data.arn
}

output "users_table_name" {
  value = aws_dynamodb_table.users.name
}

output "users_table_arn" {
  value = aws_dynamodb_table.users.arn
}
