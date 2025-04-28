output "lambda_execution_role_arn" {
  value = aws_iam_role.lambda_execution_role.arn
}

output "lambda_execution_role_name" {
  value = aws_iam_role.lambda_execution_role.name
}

output "appsync_service_role_arn" {
  value = aws_iam_role.appsync_service_role.arn
}

output "appsync_service_role_name" {
  value = aws_iam_role.appsync_service_role.name
}
