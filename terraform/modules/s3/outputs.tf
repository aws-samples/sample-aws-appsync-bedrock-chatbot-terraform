output "user_documents_bucket_name" {
  description = "Name of the S3 bucket for user documents"
  value       = aws_s3_bucket.user_documents.id
}

output "user_documents_bucket_arn" {
  description = "ARN of the S3 bucket for user documents"
  value       = aws_s3_bucket.user_documents.arn
}

output "user_documents_bucket_domain_name" {
  description = "Domain name of the S3 bucket for user documents"
  value       = aws_s3_bucket.user_documents.bucket_domain_name
}
