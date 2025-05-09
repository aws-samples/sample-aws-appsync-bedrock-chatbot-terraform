resource "aws_dynamodb_table" "chatbot_data" {
  name         = "${var.project_name}-data-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "GSI1PK"
    type = "S"
  }

  attribute {
    name = "GSI1SK"
    type = "S"
  }

  global_secondary_index {
    name               = "GSI1"
    hash_key           = "GSI1PK"
    range_key          = "GSI1SK"
    projection_type    = "ALL"
  }

  global_secondary_index {
    name               = "SK-PK-index"
    hash_key           = "SK"
    range_key          = "PK"
    projection_type    = "ALL"
  }

  tags = {
    Name        = "${var.project_name}-data"
    Environment = var.environment
  }
}
