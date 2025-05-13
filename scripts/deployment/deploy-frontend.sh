#!/bin/bash
# deploy-frontend.sh

set -e

# Check if environment is provided
ENVIRONMENT=${1:-dev}
echo "Deploying frontend for environment: $ENVIRONMENT"

# Build the frontend
echo "Building frontend..."
cd frontend
npm install
npm run build
cd ..

# Get Terraform outputs
echo "Getting Terraform outputs..."
cd terraform
terraform output -json > terraform-output.json
FRONTEND_BUCKET=$(terraform output -raw frontend_bucket_name)
CLOUDFRONT_DISTRIBUTION_ID=$(terraform output -raw cloudfront_distribution_id)
cd ..

# Update frontend config with Terraform outputs
echo "Updating frontend configuration..."
cd frontend
node update-config.js ../terraform/terraform-output.json
cd ..

# Upload to S3
echo "Uploading to S3 bucket: $FRONTEND_BUCKET..."
aws s3 sync frontend/build/ s3://$FRONTEND_BUCKET/ --delete

# Invalidate CloudFront cache
echo "Invalidating CloudFront cache for distribution: $CLOUDFRONT_DISTRIBUTION_ID..."
aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_DISTRIBUTION_ID --paths "/*"

echo "Frontend deployment complete!"
echo "Frontend URL: $(cd terraform && terraform output -raw frontend_url)"
