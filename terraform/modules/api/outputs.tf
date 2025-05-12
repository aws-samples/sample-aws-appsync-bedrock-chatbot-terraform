output "auth_api_endpoint" {
  description = "The HTTP API Gateway endpoint URL"
  value       = aws_apigatewayv2_api.auth_api.api_endpoint
}

output "auth_api_id" {
  description = "The ID of the HTTP API Gateway"
  value       = aws_apigatewayv2_api.auth_api.id
}

output "auth_api_execution_arn" {
  description = "The execution ARN of the HTTP API Gateway"
  value       = aws_apigatewayv2_api.auth_api.execution_arn
}
