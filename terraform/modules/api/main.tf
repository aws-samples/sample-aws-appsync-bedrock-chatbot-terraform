resource "aws_apigatewayv2_api" "auth_api" {
  name          = "${var.project_name}-auth-api"
  protocol_type = "HTTP"
  cors_configuration {
    allow_origins = var.cors_allowed_origins
    allow_methods = ["POST", "OPTIONS"]
    allow_headers = ["content-type", "authorization"]
    max_age       = 300
  }
}

resource "aws_apigatewayv2_stage" "auth_api_stage" {
  api_id      = aws_apigatewayv2_api.auth_api.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_apigatewayv2_integration" "login_integration" {
  api_id             = aws_apigatewayv2_api.auth_api.id
  integration_type   = "AWS_PROXY"
  integration_uri    = var.auth_lambda_invoke_arn
  integration_method = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "login_route" {
  api_id    = aws_apigatewayv2_api.auth_api.id
  route_key = "POST /login"
  target    = "integrations/${aws_apigatewayv2_integration.login_integration.id}"
}

resource "aws_lambda_permission" "api_gateway_auth" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = var.auth_lambda_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.auth_api.execution_arn}/*/*/login"
}
