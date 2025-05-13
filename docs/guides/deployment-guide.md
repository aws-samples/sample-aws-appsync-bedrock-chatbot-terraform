# Deployment Guide

This project uses Terraform to manage all infrastructure resources, including Lambda functions, AppSync API, and DynamoDB tables.

## Deployment Process

The deployment process has been simplified to use Terraform exclusively for all infrastructure updates, ensuring consistent state management and proper versioning of all resources.

### Deploying Changes

To deploy changes to both infrastructure and Lambda functions, use the `apply-changes.sh` script:

```bash
# Standard deployment
./scripts/deployment/apply-changes.sh

# Deployment with frontend rebuild
./scripts/deployment/apply-changes.sh --build
```

#### Options:

- `--build`: Builds the frontend application before starting it. Use this option when you've made changes to the frontend code that require a rebuild.

### What the Script Does:

1. Installs dependencies for all Lambda functions
2. Applies Terraform changes to update all infrastructure resources
3. Updates the frontend configuration (if applicable)
4. Optionally builds the frontend application
5. Restarts the frontend application

### Frontend-Only Updates

If you only need to restart the frontend application without deploying infrastructure changes:

```bash
./scripts/deployment/restart-frontend.sh
```

## Authentication System

This project includes a JWT-based authentication system with the following components:

- User management in DynamoDB
- JWT token generation and validation via Lambda
- API Gateway endpoints for authentication
- Secret management in AWS Secrets Manager

### Initial Setup

After deploying the infrastructure, you'll need to seed the Users table with initial users:

```bash
cd scripts
npm install
AWS_REGION=us-east-1 USERS_TABLE_NAME=$(cd ../terraform && terraform output -raw dynamodb_users_table_name) node seed-users.js
```

This will create demo users with the following credentials:
- Username: demo / Password: password123
- Username: admin / Password: admin123

## Frontend Configuration

The frontend application needs to be configured with the correct endpoints and API keys from your deployed infrastructure.

### Automatic Configuration

The `apply-changes.sh` script attempts to update the frontend configuration automatically, but it may fail if the `update-config` script is not defined in package.json.

### Manual Configuration

To manually update the frontend configuration:

1. Generate the Terraform outputs:
   ```bash
   cd terraform
   terraform output -json > terraform-output.json
   cd ..
   ```

2. Run the update-config.js script from the project root:
   ```bash
   cd frontend
   node update-config.js ../terraform/terraform-output.json us-east-1
   ```

> **Important**: Make sure to run this command from the project root directory, not from inside the terraform directory.

The script will update the following values in `frontend/src/config.js`:
- GraphQL endpoint URL
- API key
- AWS region
- Authentication API endpoint

## Lambda Function Dependencies

The `apply-changes.sh` script automatically installs dependencies for all Lambda functions before deploying. However, if you're deploying manually or using a different process, make sure to install dependencies for all Lambda functions:

```bash
# Install dependencies for message-handler
cd src/functions/message-handler
npm install
cd ../../..

# Install dependencies for streaming-handler
cd src/functions/streaming-handler
npm install
cd ../../..

# Install dependencies for auth-handler
cd src/functions/auth-handler
npm install
cd ../../..
```

> **Important**: If dependencies are not installed, your Lambda functions may fail with errors like `Cannot find module 'jsonwebtoken'` because the dependencies are not included in the deployment package.

## Development Workflow

1. Make changes to your infrastructure code in the `terraform/` directory
2. Make changes to your Lambda function code in the `src/functions/` directory
3. Run `./scripts/deployment/apply-changes.sh` to deploy all changes (this will automatically install dependencies)
4. Test your changes

## Production Frontend Deployment

In addition to local development, this project supports automated deployment of the frontend to AWS using S3 and CloudFront.

### S3 + CloudFront Deployment

The project includes a Terraform module that provisions:
- An S3 bucket configured for website hosting
- A CloudFront distribution for content delivery
- Proper IAM permissions and bucket policies

To deploy the frontend to production:

1. **Apply the Terraform infrastructure** (if not already done):
   ```bash
   cd terraform
   terraform init
   terraform apply
   cd ..
   ```

2. **Deploy the frontend using the provided script**:
   ```bash
   ./scripts/deployment/deploy-frontend.sh
   ```

This script will:
- Build the React application
- Update the configuration with Terraform outputs
- Upload the build files to S3
- Invalidate the CloudFront cache

After deployment, the frontend will be available at the CloudFront URL provided in the output.

### Security Configuration Details

The S3 and CloudFront deployment includes several security enhancements:

#### S3 Bucket Security

The S3 bucket is configured with the following security settings:

```terraform
resource "aws_s3_bucket_public_access_block" "frontend_bucket_access" {
  bucket = aws_s3_bucket.frontend_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_acl" "frontend_bucket_acl" {
  bucket = aws_s3_bucket.frontend_bucket.id
  acl    = "private"
}
```

These settings ensure that:
- The bucket blocks all public access
- No public ACLs can be applied
- The bucket ignores any public ACLs
- The bucket restricts all public access
- The bucket ACL is set to private

#### CloudFront Origin Access Identity

The deployment uses CloudFront Origin Access Identity (OAI) to restrict access to the S3 bucket:

```terraform
resource "aws_cloudfront_origin_access_identity" "frontend_oai" {
  comment = "OAI for ${var.project_name} frontend"
}
```

#### S3 Bucket Policy

The S3 bucket policy is configured to only allow access from the CloudFront distribution:

```terraform
resource "aws_s3_bucket_policy" "frontend_bucket_policy" {
  bucket = aws_s3_bucket.frontend_bucket.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontServicePrincipal"
        Effect    = "Allow"
        Principal = {
          AWS = "arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity ${aws_cloudfront_origin_access_identity.frontend_oai.id}"
        }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.frontend_bucket.arn}/*"
      }
    ]
  })
}
```

This policy ensures that:
- Only the CloudFront distribution can access objects in the S3 bucket
- Direct access to the S3 bucket is not allowed
- The S3 bucket content is only accessible through CloudFront

#### CloudFront WebSocket Support

The CloudFront distribution is configured to support WebSocket connections:

```terraform
default_cache_behavior {
  allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
  cached_methods   = ["GET", "HEAD"]
  
  forwarded_values {
    query_string = true
    headers      = ["Origin", "Access-Control-Request-Headers", "Access-Control-Request-Method"]
    cookies {
      forward = "none"
    }
  }
}
```

These settings ensure that:
- All HTTP methods required for WebSocket connections are allowed
- Necessary headers for CORS and WebSocket handshakes are forwarded
- Query strings are forwarded, which may be needed for WebSocket connections

### Security Best Practices

When deploying to production, follow these additional security best practices:

1. **Enable HTTPS**: The CloudFront distribution is configured to redirect HTTP to HTTPS
2. **Use Custom Domain with SSL**: For production, consider adding a custom domain with a valid SSL certificate
3. **Implement WAF**: Consider adding AWS WAF to protect against common web exploits
4. **Enable CloudFront Logs**: Enable access logs for CloudFront to monitor and audit access
5. **Set Up Monitoring**: Configure CloudWatch alarms for unusual traffic patterns

## Benefits of Terraform-Only Approach

- **Consistent state management**: Terraform tracks the state of all resources
- **Complete infrastructure as code**: All resources are defined and versioned in your Terraform files
- **Atomic deployments**: Changes to related resources are deployed together
- **Better auditability**: All changes go through the same deployment process
- **Simplified production deployment**: Frontend and backend infrastructure managed through the same workflow
