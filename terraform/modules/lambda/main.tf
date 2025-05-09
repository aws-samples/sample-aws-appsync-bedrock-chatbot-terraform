# Create a zip file for the message handler Lambda function
data "archive_file" "message_handler_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../../../src/functions/message-handler"
  output_path = "${path.module}/message-handler.zip"
}

# Create a zip file for the Bedrock client Lambda function
data "archive_file" "bedrock_client_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../../../src/functions/bedrock-client"
  output_path = "${path.module}/bedrock-client.zip"
}

# Create a zip file for the streaming handler Lambda function
data "archive_file" "streaming_handler_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../../../src/functions/streaming-handler"
  output_path = "${path.module}/streaming-handler.zip"
}

# Lambda function for handling messages
resource "aws_lambda_function" "message_handler" {
  function_name = "${var.project_name}-message-handler-${var.environment}"
  description   = "Lambda function for handling chat messages"
  role          = var.lambda_execution_role_arn
  handler       = "index.handler"
  runtime       = "nodejs18.x"
  timeout       = 30
  memory_size   = 256

  filename         = data.archive_file.message_handler_zip.output_path
  source_code_hash = data.archive_file.message_handler_zip.output_base64sha256

  environment {
    variables = {
      DYNAMODB_TABLE_NAME         = var.dynamodb_table_name
      BEDROCK_CLIENT_FUNCTION     = aws_lambda_function.bedrock_client.function_name
      STREAMING_HANDLER_FUNCTION  = aws_lambda_function.streaming_handler.function_name
      PROJECT_NAME                = var.project_name
    }
  }

  tags = {
    Name        = "${var.project_name}-message-handler"
    Environment = var.environment
  }
}

# Lambda function for Bedrock client
resource "aws_lambda_function" "bedrock_client" {
  function_name = "${var.project_name}-bedrock-client-${var.environment}"
  description   = "Lambda function for interacting with Amazon Bedrock"
  role          = var.lambda_execution_role_arn
  handler       = "index.handler"
  runtime       = "nodejs18.x"
  timeout       = 60
  memory_size   = 256

  filename         = data.archive_file.bedrock_client_zip.output_path
  source_code_hash = data.archive_file.bedrock_client_zip.output_base64sha256

  environment {
    variables = {
      BEDROCK_MODEL_ID = var.bedrock_model_id
    }
  }

  tags = {
    Name        = "${var.project_name}-bedrock-client"
    Environment = var.environment
  }
}

# Lambda function for streaming responses from Bedrock
resource "aws_lambda_function" "streaming_handler" {
  function_name = "${var.project_name}-streaming-handler-${var.environment}"
  description   = "Lambda function for streaming responses from Bedrock"
  role          = var.lambda_execution_role_arn
  handler       = "index.handler"
  runtime       = "nodejs18.x"
  timeout       = 300  # 5 minutes for long-running streaming
  memory_size   = 256

  filename         = data.archive_file.streaming_handler_zip.output_path
  source_code_hash = data.archive_file.streaming_handler_zip.output_base64sha256

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = var.dynamodb_table_name
      BEDROCK_MODEL_ID    = var.bedrock_model_id
      PROJECT_NAME        = var.project_name
    }
  }

  tags = {
    Name        = "${var.project_name}-streaming-handler"
    Environment = var.environment
  }
}

# Permission for AppSync to invoke the message handler Lambda function
resource "aws_lambda_permission" "appsync_message_handler_permission" {
  statement_id  = "AllowAppSyncToInvokeMessageHandler"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.message_handler.function_name
  principal     = "appsync.amazonaws.com"
}

# Permission for the message handler to invoke the Bedrock client Lambda function
resource "aws_lambda_permission" "message_handler_bedrock_client_permission" {
  statement_id  = "AllowMessageHandlerToInvokeBedrockClient"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.bedrock_client.function_name
  principal     = "lambda.amazonaws.com"
  source_arn    = aws_lambda_function.message_handler.arn
}

# Permission for the message handler to invoke the streaming handler Lambda function
resource "aws_lambda_permission" "message_handler_streaming_handler_permission" {
  statement_id  = "AllowMessageHandlerToInvokeStreamingHandler"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.streaming_handler.function_name
  principal     = "lambda.amazonaws.com"
  source_arn    = aws_lambda_function.message_handler.arn
}

# Permission for AppSync to invoke the streaming handler Lambda function
resource "aws_lambda_permission" "appsync_streaming_handler_permission" {
  statement_id  = "AllowAppSyncToInvokeStreamingHandler"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.streaming_handler.function_name
  principal     = "appsync.amazonaws.com"
}
