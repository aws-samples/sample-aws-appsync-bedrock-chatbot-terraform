# DynamoDB tables for chat history and conversations
module "dynamodb" {
  source = "./modules/dynamodb"
  
  project_name = var.project_name
  environment  = var.environment
}

# IAM roles and policies
module "iam" {
  source = "./modules/iam"
  
  project_name = var.project_name
  environment  = var.environment
  dynamodb_messages_table_arn = module.dynamodb.messages_table_arn
  dynamodb_conversations_table_arn = module.dynamodb.conversations_table_arn
}

# Lambda functions
module "lambda" {
  source = "./modules/lambda"
  
  project_name = var.project_name
  environment  = var.environment
  lambda_execution_role_arn = module.iam.lambda_execution_role_arn
  bedrock_model_id = var.bedrock_model_id
  dynamodb_messages_table_name = module.dynamodb.messages_table_name
  dynamodb_conversations_table_name = module.dynamodb.conversations_table_name
}

# AppSync API
module "appsync" {
  source = "./modules/appsync"
  
  project_name = var.project_name
  environment  = var.environment
  lambda_function_arns = module.lambda.function_arns
  lambda_function_names = module.lambda.function_names
}
