output "conversations_table_name" {
  value = aws_dynamodb_table.conversations.name
}

output "conversations_table_arn" {
  value = aws_dynamodb_table.conversations.arn
}

output "messages_table_name" {
  value = aws_dynamodb_table.messages.name
}

output "messages_table_arn" {
  value = aws_dynamodb_table.messages.arn
}
