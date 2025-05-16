#!/bin/bash

# Script to apply Terraform changes and restart the frontend application
# Usage: ./apply-changes.sh [--build] [--create-kb]
#   --build: Build the frontend before starting it
#   --create-kb: Create the Bedrock Knowledge Base (second step of deployment)

BUILD_FRONTEND=false
CREATE_KB=false

# Parse command line arguments
while [[ "$#" -gt 0 ]]; do
  case $1 in
    --build) BUILD_FRONTEND=true ;;
    --create-kb) CREATE_KB=true ;;
    *) echo "Unknown parameter: $1"; exit 1 ;;
  esac
  shift
done

echo "===== Installing Lambda function dependencies ====="
# Message handler
echo "Installing dependencies for message-handler..."
cd src/functions/message-handler
npm install
cd ../../..

# Streaming handler
echo "Installing dependencies for streaming-handler..."
cd src/functions/streaming-handler
npm install
cd ../../..

# Auth handler
echo "Installing dependencies for auth-handler..."
cd src/functions/auth-handler
npm install
cd ../../..

# Document handler
echo "Installing dependencies for document-handler..."
cd src/functions/document-handler
npm install
cd ../../..

echo "===== Applying Terraform changes ====="
cd terraform

if [ "$CREATE_KB" = true ]; then
  echo "Creating Bedrock Knowledge Base (second step of deployment)..."
  
  # Create the OpenSearch Serverless index before creating the Knowledge Base
  echo "Creating OpenSearch Serverless index for Bedrock Knowledge Base..."
  cd ..
  echo "Using AWS CLI script to create OpenSearch index..."
  ./scripts/deployment/create-opensearch-index-cli.sh
  cd terraform
  
  # Create the Knowledge Base
  echo "Creating Bedrock Knowledge Base..."
  terraform apply -auto-approve -var="create_knowledge_base=true"
else
  echo "Deploying infrastructure without Knowledge Base (first step of deployment)..."
  terraform apply -auto-approve
fi

terraform output -json > terraform-output.json

echo "===== Changing back to root directory ====="
cd ..

echo "===== Updating frontend configuration ====="
cd frontend
# Create config.js from example if it doesn't exist
if [ ! -f src/config.js ]; then
  echo "Creating initial config.js file from example..."
  cp src/config.js.example src/config.js
fi
npm run update-config || echo "No update-config script found, skipping"
cd ..

echo "===== Restarting frontend application ====="
if [ "$BUILD_FRONTEND" = true ]; then
  echo "Building frontend before starting..."
  cd frontend
  npm run build
  cd ..
fi

./scripts/deployment/restart-frontend.sh

echo "===== Deployment complete ====="
echo "The infrastructure has been updated using Terraform."
echo "The frontend application has been restarted."
if [ "$BUILD_FRONTEND" = true ]; then
  echo "The frontend application has been rebuilt."
fi

if [ "$CREATE_KB" = true ]; then
  echo ""
  echo "The Bedrock Knowledge Base has been created."
  echo "You can now use the Knowledge Base features in the application."
else
  echo ""
  echo "IMPORTANT: This was the first step of the two-step deployment process."
  echo "The OpenSearch Serverless collection has been created, but the Bedrock Knowledge Base has not."
  echo ""
  echo "To check if the OpenSearch Serverless collection is active:"
  echo "  # Option 1: Using Terraform output (if available)"
  echo "  aws opensearchserverless batch-get-collection \\"
  echo "    --names \$(cd terraform && terraform output -raw opensearch_collection_id) \\"
  echo "    --query 'collectionDetails[0].status'"
  echo ""
  echo "  # Option 2: Using collection name directly (more reliable)"
  echo "  aws opensearchserverless batch-get-collection \\"
  echo "    --names genai-chatbot-kb-collection-dev \\"
  echo "    --query 'collectionDetails[0].status'"
  echo ""
  echo "  # Option 3: List all collections and find yours"
  echo "  aws opensearchserverless list-collections"
  echo ""
  echo "Once the status shows \"ACTIVE\" (typically 5-10 minutes), run the second step:"
  echo "  ./scripts/deployment/apply-changes.sh --create-kb"
fi
