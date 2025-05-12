# AppSync API
resource "aws_appsync_graphql_api" "chatbot_api" {
  name                = "${var.project_name}-api-${var.environment}"
  authentication_type = "AWS_LAMBDA"
  schema              = file("${path.module}/../../../src/schema/schema.graphql")

  lambda_authorizer_config {
    authorizer_uri = var.auth_lambda_function_arn
    identity_validation_expression = "Bearer .*"
  }

  # Add additional authentication provider for IAM
  additional_authentication_provider {
    authentication_type = "AWS_IAM"
  }

  log_config {
    cloudwatch_logs_role_arn = aws_iam_role.appsync_logs_role.arn
    field_log_level          = "ALL"  # Change from ERROR to ALL for more detailed logs
  }

  tags = {
    Name        = "${var.project_name}-api"
    Environment = var.environment
  }
}

# API Key for AppSync (kept for backward compatibility and testing)
resource "aws_appsync_api_key" "chatbot_api_key" {
  api_id  = aws_appsync_graphql_api.chatbot_api.id
  expires = timeadd(timestamp(), "8760h")
}

# Store API key in SSM Parameter Store
resource "aws_ssm_parameter" "appsync_api_key" {
  name        = "/${var.project_name}/appsync/api-key"
  description = "API Key for AppSync GraphQL API"
  type        = "SecureString"
  value       = aws_appsync_api_key.chatbot_api_key.key
  
  tags = {
    Name        = "${var.project_name}-appsync-api-key"
    Environment = var.environment
  }
}

# IAM role for AppSync logs
resource "aws_iam_role" "appsync_logs_role" {
  name = "${var.project_name}-appsync-logs-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "appsync.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-appsync-logs-role"
    Environment = var.environment
  }
}

# Policy for AppSync logs
resource "aws_iam_policy" "appsync_logs_policy" {
  name        = "${var.project_name}-appsync-logs-policy-${var.environment}"
  description = "Policy for AppSync to write logs to CloudWatch"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Effect   = "Allow"
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

# Attach policy to AppSync logs role
resource "aws_iam_role_policy_attachment" "appsync_logs_attachment" {
  role       = aws_iam_role.appsync_logs_role.name
  policy_arn = aws_iam_policy.appsync_logs_policy.arn
}

# Lambda data source for message handler
resource "aws_appsync_datasource" "message_handler_datasource" {
  api_id           = aws_appsync_graphql_api.chatbot_api.id
  name             = "MessageHandlerDataSource"
  type             = "AWS_LAMBDA"
  service_role_arn = aws_iam_role.appsync_lambda_role.arn

  lambda_config {
    function_arn = var.lambda_function_arns.message_handler
  }
}

# IAM role for AppSync to invoke Lambda
resource "aws_iam_role" "appsync_lambda_role" {
  name = "${var.project_name}-appsync-lambda-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "appsync.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-appsync-lambda-role"
    Environment = var.environment
  }
}

# Policy for AppSync to invoke Lambda
resource "aws_iam_policy" "appsync_lambda_invoke_policy" {
  name        = "${var.project_name}-appsync-lambda-invoke-policy-${var.environment}"
  description = "Policy for AppSync to invoke Lambda functions"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "lambda:InvokeFunction"
        ]
        Effect   = "Allow"
        Resource = [for arn in values(var.lambda_function_arns) : arn]
      }
    ]
  })
}

# Attach policy to AppSync Lambda role
resource "aws_iam_role_policy_attachment" "appsync_lambda_invoke_attachment" {
  role       = aws_iam_role.appsync_lambda_role.name
  policy_arn = aws_iam_policy.appsync_lambda_invoke_policy.arn
}

# Resolvers
resource "aws_appsync_resolver" "get_message_resolver" {
  api_id      = aws_appsync_graphql_api.chatbot_api.id
  type        = "Query"
  field       = "getMessage"
  data_source = aws_appsync_datasource.message_handler_datasource.name

  request_template = <<EOF
{
  "version": "2018-05-29",
  "operation": "Invoke",
  "payload": {
    "action": "getMessage",
    "arguments": $util.toJson($context.arguments)
  }
}
EOF

  response_template = "$util.toJson($context.result)"
}

resource "aws_appsync_resolver" "get_conversation_resolver" {
  api_id      = aws_appsync_graphql_api.chatbot_api.id
  type        = "Query"
  field       = "getConversation"
  data_source = aws_appsync_datasource.message_handler_datasource.name

  request_template = <<EOF
{
  "version": "2018-05-29",
  "operation": "Invoke",
  "payload": {
    "action": "getConversation",
    "arguments": $util.toJson($context.arguments)
  }
}
EOF

  response_template = "$util.toJson($context.result)"
}

resource "aws_appsync_resolver" "list_conversations_resolver" {
  api_id      = aws_appsync_graphql_api.chatbot_api.id
  type        = "Query"
  field       = "listConversations"
  data_source = aws_appsync_datasource.message_handler_datasource.name

  request_template = <<EOF
{
  "version": "2018-05-29",
  "operation": "Invoke",
  "payload": {
    "action": "listConversations",
    "arguments": $util.toJson($context.arguments)
  }
}
EOF

  response_template = "$util.toJson($context.result)"
}

resource "aws_appsync_resolver" "get_messages_resolver" {
  api_id      = aws_appsync_graphql_api.chatbot_api.id
  type        = "Query"
  field       = "getMessages"
  data_source = aws_appsync_datasource.message_handler_datasource.name

  request_template = <<EOF
{
  "version": "2018-05-29",
  "operation": "Invoke",
  "payload": {
    "action": "getMessages",
    "arguments": $util.toJson($context.arguments)
  }
}
EOF

  response_template = "$util.toJson($context.result)"
}

resource "aws_appsync_resolver" "send_message_resolver" {
  api_id      = aws_appsync_graphql_api.chatbot_api.id
  type        = "Mutation"
  field       = "sendMessage"
  data_source = aws_appsync_datasource.message_handler_datasource.name

  request_template = <<EOF
{
  "version": "2018-05-29",
  "operation": "Invoke",
  "payload": {
    "action": "sendMessage",
    "arguments": $util.toJson($context.arguments)
  }
}
EOF

  response_template = <<EOF
#if($context.result.userMessage)
  ## Only return the user message as the mutation result
  ## The assistant message will be handled by the frontend
  $util.toJson($context.result.userMessage)
#else
  $util.toJson($context.result)
#end
EOF
}

resource "aws_appsync_resolver" "create_conversation_resolver" {
  api_id      = aws_appsync_graphql_api.chatbot_api.id
  type        = "Mutation"
  field       = "createConversation"
  data_source = aws_appsync_datasource.message_handler_datasource.name

  request_template = <<EOF
{
  "version": "2018-05-29",
  "operation": "Invoke",
  "payload": {
    "action": "createConversation",
    "arguments": $util.toJson($context.arguments)
  }
}
EOF

  response_template = "$util.toJson($context.result)"
}

# Resolver for updateMessageContent mutation
resource "aws_appsync_resolver" "update_message_content_resolver" {
  api_id      = aws_appsync_graphql_api.chatbot_api.id
  type        = "Mutation"
  field       = "updateMessageContent"
  data_source = aws_appsync_datasource.message_handler_datasource.name
  
  # This resolver will inherit authentication types from the API
  # Including AWS_IAM from the additional_authentication_provider

  request_template = <<EOF
{
  "version": "2018-05-29",
  "operation": "Invoke",
  "payload": {
    "action": "updateMessageContent",
    "arguments": $util.toJson($context.arguments),
    "authMode": "AWS_IAM",
    "identity": $util.toJson($context.identity)
  }
}
EOF

  response_template = "$util.toJson($context.result)"
}

# Note: Subscription resolvers for onNewMessage and onMessageUpdate have been removed
# as they are now handled automatically by the @aws_subscribe directive in the schema
