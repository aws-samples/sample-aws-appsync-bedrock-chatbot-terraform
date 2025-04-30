# Lambda execution role
resource "aws_iam_role" "lambda_execution_role" {
  name = "${var.project_name}-lambda-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-lambda-role"
    Environment = var.environment
  }
}

# Policy for Lambda to access DynamoDB
resource "aws_iam_policy" "lambda_dynamodb_policy" {
  name        = "${var.project_name}-lambda-dynamodb-policy-${var.environment}"
  description = "Policy for Lambda to access DynamoDB tables"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Effect = "Allow"
        Resource = [
          var.dynamodb_messages_table_arn,
          var.dynamodb_conversations_table_arn,
          "${var.dynamodb_messages_table_arn}/index/*"
        ]
      }
    ]
  })
}

# Policy for Lambda to access Bedrock
resource "aws_iam_policy" "lambda_bedrock_policy" {
  name        = "${var.project_name}-lambda-bedrock-policy-${var.environment}"
  description = "Policy for Lambda to access Amazon Bedrock"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream"
        ]
        Effect   = "Allow"
        Resource = "*"
      }
    ]
  })
}

# Policy for Lambda to write logs
resource "aws_iam_policy" "lambda_logging_policy" {
  name        = "${var.project_name}-lambda-logging-policy-${var.environment}"
  description = "Policy for Lambda to write logs to CloudWatch"

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

# Policy for Lambda to invoke other Lambda functions
resource "aws_iam_policy" "lambda_invoke_policy" {
  name        = "${var.project_name}-lambda-invoke-policy-${var.environment}"
  description = "Policy for Lambda to invoke other Lambda functions"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "lambda:InvokeFunction"
        ]
        Effect   = "Allow"
        Resource = "*"  # You can restrict this to specific Lambda ARNs if needed
      }
    ]
  })
}

# Policy for Lambda to invoke AppSync mutations
resource "aws_iam_policy" "lambda_appsync_policy" {
  name        = "${var.project_name}-lambda-appsync-policy-${var.environment}"
  description = "Policy for Lambda to invoke AppSync mutations"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "appsync:GraphQL",
          "appsync:ListGraphqlApis",
          "appsync:ListApiKeys"
        ]
        Effect   = "Allow"
        Resource = "*"  # You can restrict this to specific AppSync API ARNs if needed
      }
    ]
  })
}

# Policy for Lambda to access SSM parameters
resource "aws_iam_policy" "lambda_ssm_policy" {
  name        = "${var.project_name}-lambda-ssm-policy-${var.environment}"
  description = "Policy for Lambda to access SSM parameters"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters"
        ]
        Effect   = "Allow"
        Resource = "arn:aws:ssm:*:*:parameter/${var.project_name}/*"
      }
    ]
  })
}

# Attach policies to Lambda execution role
resource "aws_iam_role_policy_attachment" "lambda_dynamodb_attachment" {
  role       = aws_iam_role.lambda_execution_role.name
  policy_arn = aws_iam_policy.lambda_dynamodb_policy.arn
}

resource "aws_iam_role_policy_attachment" "lambda_bedrock_attachment" {
  role       = aws_iam_role.lambda_execution_role.name
  policy_arn = aws_iam_policy.lambda_bedrock_policy.arn
}

resource "aws_iam_role_policy_attachment" "lambda_logging_attachment" {
  role       = aws_iam_role.lambda_execution_role.name
  policy_arn = aws_iam_policy.lambda_logging_policy.arn
}

resource "aws_iam_role_policy_attachment" "lambda_invoke_attachment" {
  role       = aws_iam_role.lambda_execution_role.name
  policy_arn = aws_iam_policy.lambda_invoke_policy.arn
}

resource "aws_iam_role_policy_attachment" "lambda_appsync_attachment" {
  role       = aws_iam_role.lambda_execution_role.name
  policy_arn = aws_iam_policy.lambda_appsync_policy.arn
}

resource "aws_iam_role_policy_attachment" "lambda_ssm_attachment" {
  role       = aws_iam_role.lambda_execution_role.name
  policy_arn = aws_iam_policy.lambda_ssm_policy.arn
}

# AppSync service role
resource "aws_iam_role" "appsync_service_role" {
  name = "${var.project_name}-appsync-role-${var.environment}"

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
    Name        = "${var.project_name}-appsync-role"
    Environment = var.environment
  }
}

# Policy for AppSync to invoke Lambda
resource "aws_iam_policy" "appsync_lambda_policy" {
  name        = "${var.project_name}-appsync-lambda-policy-${var.environment}"
  description = "Policy for AppSync to invoke Lambda functions"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "lambda:InvokeFunction"
        ]
        Effect   = "Allow"
        Resource = "*"
      }
    ]
  })
}

# Attach policy to AppSync service role
resource "aws_iam_role_policy_attachment" "appsync_lambda_attachment" {
  role       = aws_iam_role.appsync_service_role.name
  policy_arn = aws_iam_policy.appsync_lambda_policy.arn
}
