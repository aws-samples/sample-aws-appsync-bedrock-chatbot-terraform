output "knowledge_base_id" {
  description = "ID of the Amazon Bedrock Knowledge Base"
  value       = var.create_knowledge_base ? aws_bedrockagent_knowledge_base.document_kb[0].id : null
}

output "knowledge_base_arn" {
  description = "ARN of the Amazon Bedrock Knowledge Base"
  value       = var.create_knowledge_base ? aws_bedrockagent_knowledge_base.document_kb[0].arn : null
}

output "opensearch_collection_id" {
  description = "ID of the OpenSearch Serverless Collection"
  value       = aws_opensearchserverless_collection.kb_collection.id
}

output "opensearch_collection_arn" {
  description = "ARN of the OpenSearch Serverless Collection"
  value       = aws_opensearchserverless_collection.kb_collection.arn
}

output "bedrock_kb_role_arn" {
  description = "ARN of the IAM role for Bedrock to access the Knowledge Base"
  value       = aws_iam_role.bedrock_kb_role.arn
}

output "knowledge_base_data_source_id" {
  description = "ID of the S3 data source for the Knowledge Base"
  value       = var.create_knowledge_base ? aws_bedrockagent_data_source.s3_data_source[0].id : null
}
