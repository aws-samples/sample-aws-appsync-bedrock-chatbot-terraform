# Create a zip file for the message handler Lambda function
data "archive_file" "message_handler_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../../../src/functions/message-handler"
  output_path = "${path.module}/message-handler.zip"
}

# Create a zip file for the streaming handler Lambda function
data "archive_file" "streaming_handler_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../../../src/functions/streaming-handler"
  output_path = "${path.module}/streaming-handler.zip"
}

# Create a zip file for the auth handler Lambda function
data "archive_file" "auth_handler_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../../../src/functions/auth-handler"
  output_path = "${path.module}/auth-handler.zip"
}

# Create a zip file for the document handler Lambda function
data "archive_file" "document_handler_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../../../src/functions/document-handler"
  output_path = "${path.module}/document-handler.zip"
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
      STREAMING_HANDLER_FUNCTION  = aws_lambda_function.streaming_handler.function_name
      USER_DOCUMENTS_BUCKET       = var.user_documents_bucket
      PROJECT_NAME                = var.project_name
    }
  }

  tags = {
    Name        = "${var.project_name}-message-handler"
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
      KNOWLEDGE_BASE_ID   = var.knowledge_base_id
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

# Lambda function for authentication and authorization
resource "aws_lambda_function" "auth_handler" {
  function_name = "${var.project_name}-auth-handler-${var.environment}"
  description   = "Lambda function for authentication and authorization"
  role          = var.lambda_execution_role_arn
  handler       = "index.handler"
  runtime       = "nodejs18.x"
  timeout       = 30
  memory_size   = 256

  filename         = data.archive_file.auth_handler_zip.output_path
  source_code_hash = data.archive_file.auth_handler_zip.output_base64sha256

  environment {
    variables = {
      USERS_TABLE_NAME = var.users_table_name
      JWT_SECRET_ARN   = var.jwt_secret_arn
      PROJECT_NAME     = var.project_name
    }
  }

  tags = {
    Name        = "${var.project_name}-auth-handler"
    Environment = var.environment
  }
}

# Permission for AppSync to invoke the auth handler Lambda function for authorization
resource "aws_lambda_permission" "appsync_auth_handler_permission" {
  statement_id  = "AllowAppSyncToInvokeAuthHandler"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.auth_handler.function_name
  principal     = "appsync.amazonaws.com"
}

# Get current AWS account ID
data "aws_caller_identity" "current" {}

# Lambda function for document processing and Knowledge Base integration
resource "aws_lambda_function" "document_handler" {
  function_name = "${var.project_name}-document-handler-${var.environment}"
  description   = "Lambda function for document processing and Knowledge Base integration"
  role          = var.lambda_execution_role_arn
  handler       = "index.handler"
  runtime       = "nodejs18.x"
  timeout       = 300  # 5 minutes for document processing
  memory_size   = 512  # More memory for document processing

  filename         = data.archive_file.document_handler_zip.output_path
  source_code_hash = data.archive_file.document_handler_zip.output_base64sha256

  environment {
    variables = {
      DYNAMODB_TABLE_NAME           = var.dynamodb_table_name
      USER_DOCUMENTS_BUCKET         = var.user_documents_bucket
      KNOWLEDGE_BASE_ID             = var.knowledge_base_id
      KNOWLEDGE_BASE_DATA_SOURCE_ID = var.knowledge_base_data_source_id != null ? split(",", var.knowledge_base_data_source_id)[0] : ""
      PROJECT_NAME                  = var.project_name
      AWS_ACCOUNT_ID                = data.aws_caller_identity.current.account_id
    }
  }

  tags = {
    Name        = "${var.project_name}-document-handler"
    Environment = var.environment
  }
}

# Permission for AppSync to invoke the document handler Lambda function
resource "aws_lambda_permission" "appsync_document_handler_permission" {
  statement_id  = "AllowAppSyncToInvokeDocumentHandler"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.document_handler.function_name
  principal     = "appsync.amazonaws.com"
}

# Permission for S3 to invoke the document handler Lambda function
resource "aws_lambda_permission" "s3_document_handler_permission" {
  statement_id  = "AllowS3ToInvokeDocumentHandler"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.document_handler.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = "arn:aws:s3:::${var.user_documents_bucket}"
}

# S3 bucket notification configuration for document uploads
resource "aws_s3_bucket_notification" "document_upload_notification" {
  bucket = var.user_documents_bucket

  lambda_function {
    lambda_function_arn = aws_lambda_function.document_handler.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "user-documents/"
  }

  depends_on = [aws_lambda_permission.s3_document_handler_permission]
}
