output "message_handler_function_arn" {
  value = aws_lambda_function.message_handler.arn
}

output "message_handler_function_name" {
  value = aws_lambda_function.message_handler.function_name
}

output "bedrock_client_function_arn" {
  value = aws_lambda_function.bedrock_client.arn
}

output "bedrock_client_function_name" {
  value = aws_lambda_function.bedrock_client.function_name
}

output "function_arns" {
  value = {
    message_handler = aws_lambda_function.message_handler.arn
    bedrock_client  = aws_lambda_function.bedrock_client.arn
  }
}

output "function_names" {
  value = {
    message_handler = aws_lambda_function.message_handler.function_name
    bedrock_client  = aws_lambda_function.bedrock_client.function_name
  }
}
