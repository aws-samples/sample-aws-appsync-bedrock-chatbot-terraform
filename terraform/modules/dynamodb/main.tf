resource "aws_dynamodb_table" "conversations" {
  name         = "${var.project_name}-conversations-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  tags = {
    Name        = "${var.project_name}-conversations"
    Environment = var.environment
  }
}

resource "aws_dynamodb_table" "messages" {
  name         = "${var.project_name}-messages-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"
  range_key    = "conversationId"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "conversationId"
    type = "S"
  }

  global_secondary_index {
    name               = "ConversationIndex"
    hash_key           = "conversationId"
    projection_type    = "ALL"
  }

  tags = {
    Name        = "${var.project_name}-messages"
    Environment = var.environment
  }
}
