# DynamoDB table for chat data (single-table design)
module "dynamodb" {
  source = "./modules/dynamodb"
  
  project_name = var.project_name
  environment  = var.environment
}

# Secrets Manager for JWT secret
module "secrets" {
  source = "./modules/secrets"
  
  project_name = var.project_name
  environment  = var.environment
  jwt_secret   = var.jwt_secret
}

# IAM roles and policies
module "iam" {
  source = "./modules/iam"
  
  project_name = var.project_name
  environment  = var.environment
  dynamodb_table_arn = module.dynamodb.chatbot_data_table_arn
  users_table_arn = module.dynamodb.users_table_arn
  jwt_secret_arn = module.secrets.jwt_secret_arn
  appsync_api_id = module.appsync.api_id
}

# API Gateway for authentication
module "api" {
  source = "./modules/api"
  
  project_name = var.project_name
  auth_lambda_invoke_arn = module.lambda.auth_handler_invoke_arn
  auth_lambda_function_name = module.lambda.auth_handler_function_name
  cors_allowed_origins = var.cors_allowed_origins
}

# AppSync API
module "appsync" {
  source = "./modules/appsync"
  
  project_name = var.project_name
  environment  = var.environment
  lambda_function_arns = module.lambda.function_arns
  lambda_function_names = module.lambda.function_names
  auth_lambda_function_arn = module.lambda.auth_handler_function_arn
}

# Lambda functions
module "lambda" {
  source = "./modules/lambda"
  
  project_name = var.project_name
  environment  = var.environment
  lambda_execution_role_arn = module.iam.lambda_execution_role_arn
  bedrock_model_id = var.bedrock_model_id
  dynamodb_table_name = module.dynamodb.chatbot_data_table_name
  users_table_name = module.dynamodb.users_table_name
  jwt_secret_arn = module.secrets.jwt_secret_arn
}

# Frontend hosting with S3 and CloudFront
module "frontend" {
  source = "./modules/frontend"
  
  project_name = var.project_name
  environment  = var.environment
}
