# Deploying with Bedrock Knowledge Base Integration

This guide explains how to deploy the GenAI Chatbot application with Amazon Bedrock Knowledge Base integration enabled.

## Prerequisites

Before deploying with Knowledge Base integration, ensure you have:

1. AWS CLI installed and configured with appropriate permissions
2. Terraform installed (version 1.0.0 or later)
3. Access to Amazon Bedrock in your AWS account
4. Appropriate service quotas for OpenSearch Serverless and Bedrock Knowledge Base

## Deployment Steps

### 1. Configure Terraform Variables

If you need to modify any settings, you can create a `terraform.tfvars` file in the `terraform` directory with your custom values:

```hcl
aws_region = "us-east-1"
project_name = "genai-chatbot"
environment = "dev"
bedrock_model_id = "anthropic.claude-3-sonnet-20240229-v1:0"
```

### 2. Initialize Terraform

Navigate to the `terraform` directory and initialize Terraform:

```bash
cd terraform
terraform init
```

### 3. Deploy the Infrastructure (Two-Step Process)

The deployment of the Knowledge Base integration requires a two-step process due to the dependencies between OpenSearch Serverless and the Bedrock Knowledge Base.

#### Step 1: Deploy the Base Infrastructure

First, deploy the infrastructure without the Knowledge Base:

```bash
terraform apply
```

Review the planned changes and type `yes` when prompted to proceed with the deployment.

This initial deployment will create:
- DynamoDB tables for chat data and user information
- S3 bucket for user documents
- Lambda functions for message handling, streaming, authentication, and document processing
- AppSync API for GraphQL operations
- OpenSearch Serverless collection for the Knowledge Base (but not the vector index)

#### Step 2: Create the Knowledge Base

After the OpenSearch Serverless collection is active (which can take 5-10 minutes), run the script to create the vector index and the Knowledge Base:

```bash
cd ../scripts/deployment
./apply-changes.sh --create-kb
```

This script will:
1. Create the vector index in the OpenSearch Serverless collection
2. Deploy the Bedrock Knowledge Base that uses this index

### 4. Configure the Frontend

After the deployment completes, you need to update the frontend configuration:

1. Copy the outputs from Terraform:

```bash
cd scripts/deployment
./apply-changes.sh
```

2. Update the frontend configuration:

```bash
cd ../../frontend
npm install
npm run update-config
```

### 5. Deploy the Frontend

Deploy the frontend to the S3 bucket and CloudFront distribution:

```bash
cd ../scripts/deployment
./deploy-frontend.sh
```

## Verifying the Deployment

### 1. Check the Knowledge Base Status

You can verify that the Knowledge Base was created successfully by checking the AWS Management Console:

1. Navigate to the Amazon Bedrock console
2. Select "Knowledge bases" from the left navigation
3. You should see a Knowledge Base named `genai-chatbot-knowledge-base-dev` (or with your custom project name and environment)

### 2. Test Document Upload and Processing

1. Log in to the application
2. Navigate to the Document Library
3. Upload a document
4. Check the document status - it should change from "PROCESSING" to "PROCESSED" once the document is ingested into the Knowledge Base

### 3. Test Knowledge Base Retrieval

1. Start a new chat conversation
2. Ask a question related to the content of your uploaded document
3. The response should include information from the document with proper source attribution

## Troubleshooting

### OpenSearch Serverless Collection Creation Fails

If the OpenSearch Serverless collection creation fails, it may be due to service quotas or network policy conflicts. Try:

1. Check the CloudWatch Logs for the specific error message
2. Verify that you have sufficient service quotas for OpenSearch Serverless
3. Ensure there are no conflicting network policies for OpenSearch Serverless

### Document Processing Fails

If document processing fails, check:

1. The Lambda function logs in CloudWatch
2. Verify that the document format is supported
3. Ensure the document size is within limits (less than 50 MB)
4. Check that the IAM roles have the necessary permissions

### Embedding Model Permission Errors

If you encounter errors related to the embedding model, such as:

```
ValidationException: Knowledge base role is not able to call specified bedrock embedding model: User is not authorized to perform: bedrock:InvokeModel on resource: arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v1
```

Ensure that the Bedrock Knowledge Base role has the necessary permission to invoke the embedding model:

1. Check that the IAM policy for the Bedrock Knowledge Base role includes the `bedrock:InvokeModel` permission
2. Verify that the resource ARN in the policy matches the embedding model ARN used by the Knowledge Base
3. If needed, update the IAM policy and redeploy:

```hcl
# IAM Policy for Bedrock to access the Knowledge Base
resource "aws_iam_policy" "bedrock_kb_policy" {
  policy = jsonencode({
    Statement = [
      # ... other permissions ...
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
```

### Knowledge Base Retrieval Issues

If the Knowledge Base retrieval is not working as expected:

1. Verify that the document was successfully processed and ingested
2. Check the streaming handler Lambda function logs
3. Ensure the query is relevant to the content of the document
4. Try adjusting the retrieval parameters in the streaming handler function

## Cleaning Up

To remove all resources created by the deployment:

```bash
cd terraform
terraform destroy
```

Review the planned destruction and type `yes` when prompted to proceed with the cleanup.

## Next Steps

After successful deployment, you can:

1. Customize the document processing workflow
2. Adjust the retrieval parameters for better results
3. Implement additional features like document collections or advanced filtering
4. Set up monitoring and alerting for the Knowledge Base operations
