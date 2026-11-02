# Amazon Bedrock Knowledge Base
resource "aws_bedrockagent_knowledge_base" "document_kb" {
  count = var.create_knowledge_base ? 1 : 0
  
  name        = "${var.project_name}-knowledge-base-${var.environment}"
  description = "Knowledge Base for user documents"
  role_arn    = aws_iam_role.bedrock_kb_role.arn

  knowledge_base_configuration {
    type = "VECTOR"
    vector_knowledge_base_configuration {
      embedding_model_arn = var.embedding_model_arn
    }
  }

  storage_configuration {
    type = "OPENSEARCH_SERVERLESS"
    opensearch_serverless_configuration {
      collection_arn    = aws_opensearchserverless_collection.kb_collection.arn
      vector_index_name = "bedrock-knowledge-base-default-index"
      field_mapping {
        vector_field   = "bedrock-knowledge-base-default-vector"
        text_field     = "AMAZON_BEDROCK_TEXT_CHUNK"
        metadata_field = "AMAZON_BEDROCK_METADATA"
      }
    }
  }

  # Ensure the access policy, network policy, and role are created before the knowledge base
  depends_on = [
    aws_opensearchserverless_access_policy.kb_access_policy,
    aws_opensearchserverless_security_policy.kb_network_policy,
    aws_iam_role_policy_attachment.bedrock_kb_policy_attachment
  ]

  tags = {
    Name        = "${var.project_name}-knowledge-base"
    Environment = var.environment
  }
}

# Local variable for collection name to avoid circular dependency
locals {
  kb_collection_name = "${var.project_name}-kb-collection-${var.environment}"
}

# OpenSearch Serverless Collection for the Knowledge Base
resource "aws_opensearchserverless_collection" "kb_collection" {
  name       = local.kb_collection_name
  type       = "VECTORSEARCH"
  description = "OpenSearch Serverless Collection for Knowledge Base"
  
  # Add explicit dependency on the security policies
  depends_on = [
    aws_opensearchserverless_security_policy.kb_security_policy,
    aws_opensearchserverless_security_policy.kb_network_policy
  ]

  tags = {
    Name        = "${var.project_name}-kb-collection"
    Environment = var.environment
  }
}

# OpenSearch Serverless Security Policy (Encryption)
resource "aws_opensearchserverless_security_policy" "kb_security_policy" {
  name        = "${var.project_name}-kb-sec-${var.environment}"
  type        = "encryption"
  description = "Security policy for Knowledge Base collection"
  policy = jsonencode({
    Rules = [
      {
        Resource = [
          "collection/${local.kb_collection_name}"
        ],
        ResourceType = "collection"
      }
    ],
    AWSOwnedKey = true
  })
}

# OpenSearch Serverless Network Policy
resource "aws_opensearchserverless_security_policy" "kb_network_policy" {
  name        = "${var.project_name}-kb-net-${var.environment}"
  type        = "network"
  description = "Network policy for Knowledge Base collection"
  policy = jsonencode([
    {
      Rules = [
        {
          Resource = [
            "collection/${local.kb_collection_name}"
          ],
          ResourceType = "collection"
        }
      ],
      AllowFromPublic = true
    }
  ])
}

# OpenSearch Serverless Access Policy
resource "aws_opensearchserverless_access_policy" "kb_access_policy" {
  name        = "${var.project_name}-kb-acc-${var.environment}"
  type        = "data"
  description = "Access policy for Knowledge Base collection"
  policy = jsonencode([
    {
      Rules = [
        {
          Resource = [
            "collection/${local.kb_collection_name}"
          ],
          Permission = [
            "aoss:CreateCollectionItems",
            "aoss:DeleteCollectionItems",
            "aoss:UpdateCollectionItems",
            "aoss:DescribeCollectionItems"
          ],
          ResourceType = "collection"
        },
        {
          Resource = [
            "index/${local.kb_collection_name}/*"
          ],
          Permission = [
            "aoss:CreateIndex",
            "aoss:DeleteIndex",
            "aoss:UpdateIndex",
            "aoss:DescribeIndex",
            "aoss:ReadDocument",
            "aoss:WriteDocument"
          ],
          ResourceType = "index"
        }
      ],
      Principal = [
        var.lambda_execution_role_arn,
        aws_iam_role.bedrock_kb_role.arn
      ]
    }
  ])
}

# IAM Role for Bedrock to access the Knowledge Base
resource "aws_iam_role" "bedrock_kb_role" {
  name = "${var.project_name}-bedrock-kb-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Principal = {
          Service = "bedrock.amazonaws.com"
        },
        Action = "sts:AssumeRole",
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          },
          ArnLike = {
            "AWS:SourceArn" = "arn:aws:bedrock:${var.aws_region}:${data.aws_caller_identity.current.account_id}:knowledge-base/*"
          }
        }
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-bedrock-kb-role"
    Environment = var.environment
  }
}

# Get current AWS account ID
data "aws_caller_identity" "current" {}

# IAM Policy for Bedrock to access the Knowledge Base
resource "aws_iam_policy" "bedrock_kb_policy" {
  name        = "${var.project_name}-bedrock-kb-policy-${var.environment}"
  description = "Policy for Bedrock to access the Knowledge Base"

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = [
          "aoss:APIAccessAll"
        ],
        Effect   = "Allow",
        Resource = [
          aws_opensearchserverless_collection.kb_collection.arn
        ]
      },
      {
        Action = [
          "aoss:CreateIndex",
          "aoss:DeleteIndex",
          "aoss:UpdateIndex",
          "aoss:DescribeIndex",
          "aoss:ReadDocument",
          "aoss:WriteDocument",
          "aoss:CreateCollectionItems",
          "aoss:DeleteCollectionItems",
          "aoss:UpdateCollectionItems",
          "aoss:DescribeCollectionItems"
        ],
        Effect   = "Allow",
        Resource = [
          "${aws_opensearchserverless_collection.kb_collection.arn}/*"
        ]
      },
      {
        Action = [
          "s3:GetObject",
          "s3:ListBucket"
        ],
        Effect   = "Allow",
        Resource = [
          var.user_documents_bucket_arn,
          "${var.user_documents_bucket_arn}/*"
        ]
      },
      {
        Action = [
          "bedrock:InvokeModel"
        ],
        Effect   = "Allow",
        Resource = [
          var.embedding_model_arn
        ]
      }
    ]
  })
}

# Attach the policy to the role
resource "aws_iam_role_policy_attachment" "bedrock_kb_policy_attachment" {
  role       = aws_iam_role.bedrock_kb_role.name
  policy_arn = aws_iam_policy.bedrock_kb_policy.arn
}

# Extract bucket name from ARN
locals {
  user_documents_bucket_name = split(":", var.user_documents_bucket_arn)[5]
}

# S3 data source for the Knowledge Base
resource "aws_bedrockagent_data_source" "s3_data_source" {
  count = var.create_knowledge_base ? 1 : 0
  
  knowledge_base_id = aws_bedrockagent_knowledge_base.document_kb[0].id
  name              = "${var.project_name}-s3-data-source-${var.environment}"
  
  data_source_configuration {
    type = "S3"
    s3_configuration {
      bucket_arn = var.user_documents_bucket_arn
      inclusion_prefixes = ["user-documents/"]
    }
  }
  
  # Ensure the knowledge base is created first
  depends_on = [
    aws_bedrockagent_knowledge_base.document_kb
  ]
}
