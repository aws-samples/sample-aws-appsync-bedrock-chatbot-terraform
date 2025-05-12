output "message_handler_function_arn" {
  value = aws_lambda_function.message_handler.arn
}

output "message_handler_function_name" {
  value = aws_lambda_function.message_handler.function_name
}

output "streaming_handler_function_arn" {
  value = aws_lambda_function.streaming_handler.arn
}

output "streaming_handler_function_name" {
  value = aws_lambda_function.streaming_handler.function_name
}

output "auth_handler_function_arn" {
  value = aws_lambda_function.auth_handler.arn
}

output "auth_handler_function_name" {
  value = aws_lambda_function.auth_handler.function_name
}

output "auth_handler_invoke_arn" {
  value = aws_lambda_function.auth_handler.invoke_arn
}

output "function_arns" {
  value = {
    message_handler   = aws_lambda_function.message_handler.arn
    streaming_handler = aws_lambda_function.streaming_handler.arn
    auth_handler      = aws_lambda_function.auth_handler.arn
  }
}

output "function_names" {
  value = {
    message_handler   = aws_lambda_function.message_handler.function_name
    streaming_handler = aws_lambda_function.streaming_handler.function_name
    auth_handler      = aws_lambda_function.auth_handler.function_name
  }
}
