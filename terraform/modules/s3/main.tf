# S3 bucket for user documents
resource "aws_s3_bucket" "user_documents" {
  bucket = "${var.project_name}-user-documents-${var.environment}"

  tags = {
    Name        = "${var.project_name}-user-documents"
    Environment = var.environment
  }
}

# Block public access to the bucket
resource "aws_s3_bucket_public_access_block" "user_documents_block_public_access" {
  bucket = aws_s3_bucket.user_documents.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Enable versioning for the bucket
resource "aws_s3_bucket_versioning" "user_documents_versioning" {
  bucket = aws_s3_bucket.user_documents.id
  
  versioning_configuration {
    status = "Enabled"
  }
}

# Configure server-side encryption for the bucket
resource "aws_s3_bucket_server_side_encryption_configuration" "user_documents_encryption" {
  bucket = aws_s3_bucket.user_documents.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Configure lifecycle rules for the bucket
resource "aws_s3_bucket_lifecycle_configuration" "user_documents_lifecycle" {
  bucket = aws_s3_bucket.user_documents.id

  rule {
    id     = "expire-old-versions"
    status = "Enabled"
    
    filter {
      prefix = ""  # Empty prefix to apply to all objects
    }

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

# Configure CORS for the bucket
resource "aws_s3_bucket_cors_configuration" "user_documents_cors" {
  bucket = aws_s3_bucket.user_documents.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}
