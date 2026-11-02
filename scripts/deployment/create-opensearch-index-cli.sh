#!/bin/bash

# Script to create the OpenSearch Serverless index required for Bedrock Knowledge Base using AWS CLI only
# Usage: ./create-opensearch-index-cli.sh [--collection-name <name>] [--region <region>]
#   --collection-name: Optional name of the OpenSearch Serverless collection (default: genai-chatbot-kb-collection-dev)
#   --region: AWS region to use (default: us-east-1)

# Function to check AWS CLI version and capabilities
check_aws_cli_version() {
  echo "Checking AWS CLI version..."
  AWS_CLI_VERSION=$(aws --version 2>&1)
  echo "AWS CLI version: $AWS_CLI_VERSION"
  
  # Extract version number for potential feature checks
  VERSION_NUMBER=$(echo "$AWS_CLI_VERSION" | grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+' | head -1)
  if [ -n "$VERSION_NUMBER" ]; then
    echo "Version number: $VERSION_NUMBER"
  else
    echo "Could not extract version number"
  fi
  
  # Check if opensearchserverless command is available
  if aws help | grep -q opensearchserverless; then
    echo "OpenSearch Serverless commands are available"
  else
    echo "WARNING: OpenSearch Serverless commands are NOT available in your AWS CLI version"
    echo "You may need to update your AWS CLI to use this script"
  fi
  
  echo "To update your AWS CLI:"
  echo "  pip install --upgrade awscli    # For pip installation"
  echo "  brew upgrade awscli             # For Homebrew on macOS"
  echo ""
}

# Default settings
COLLECTION_NAME="genai-chatbot-kb-collection-dev"
AWS_REGION="us-east-1"
VERBOSE=false

# Parse command line arguments
while [[ "$#" -gt 0 ]]; do
  case $1 in
    --collection-name) COLLECTION_NAME="$2"; shift ;;
    --region) AWS_REGION="$2"; shift ;;
    --verbose) VERBOSE=true ;;
    *) echo "Unknown parameter: $1"; exit 1 ;;
  esac
  shift
done

echo "===== Creating OpenSearch Serverless index for Bedrock Knowledge Base ====="
echo "Collection name: $COLLECTION_NAME"
echo "AWS Region: $AWS_REGION"

# Test AWS connectivity and check CLI version
echo "Testing AWS connectivity..."
check_aws_cli_version
CALLER_IDENTITY=$(aws sts get-caller-identity)
if [ $? -ne 0 ]; then
  echo "ERROR: Failed to connect to AWS. Please check your credentials and network connection."
  exit 1
fi
AWS_ACCOUNT_ID=$(echo "$CALLER_IDENTITY" | grep -o '"Account": "[^"]*' | cut -d'"' -f4)
AWS_USER_ARN=$(echo "$CALLER_IDENTITY" | grep -o '"Arn": "[^"]*' | cut -d'"' -f4)
echo "Connected to AWS account: $AWS_ACCOUNT_ID"
echo "Using identity: $AWS_USER_ARN"

# Step 1: Check if the collection exists and is active
echo "Checking if the OpenSearch Serverless collection is active..."
COLLECTION_STATUS=$(aws opensearchserverless batch-get-collection \
  --names "$COLLECTION_NAME" \
  --query 'collectionDetails[0].status' \
  --output text \
  --region $AWS_REGION)

if [ "$COLLECTION_STATUS" != "ACTIVE" ]; then
  echo "Error: Collection '$COLLECTION_NAME' is not active or doesn't exist. Status: $COLLECTION_STATUS"
  echo "Please make sure the collection exists and is active before creating the index."
  exit 1
fi

echo "Collection is active. Getting collection ID..."

# Step 2: Get the collection ID
COLLECTION_ID=$(aws opensearchserverless batch-get-collection \
  --names "$COLLECTION_NAME" \
  --query 'collectionDetails[0].id' \
  --output text \
  --region $AWS_REGION)

echo "Collection ID: $COLLECTION_ID"

# Step 3: Check if the index already exists
echo "Checking if the index already exists..."
aws opensearchserverless get-index \
  --id "$COLLECTION_NAME/bedrock-knowledge-base-default-index" \
  --region $AWS_REGION > /dev/null 2>&1

if [ $? -eq 0 ]; then
  echo "Index 'bedrock-knowledge-base-default-index' already exists."
  exit 0
else
  echo "Index doesn't exist. Creating it now..."
fi

# Step 4: Create a temporary file for the index mapping
INDEX_MAPPING_FILE=$(mktemp)
cat > $INDEX_MAPPING_FILE << 'EOF'
{
  "mappings": {
    "properties": {
      "bedrock-knowledge-base-default-vector": {
        "type": "knn_vector",
        "dimension": 1536,
        "method": {
          "name": "hnsw",
          "space_type": "l2",
          "engine": "faiss",
          "parameters": {
            "ef_construction": 512,
            "m": 16
          }
        }
      },
      "AMAZON_BEDROCK_TEXT_CHUNK": {
        "type": "text"
      },
      "AMAZON_BEDROCK_METADATA": {
        "type": "text"
      }
    }
  }
}
EOF

echo "Created index mapping file: $INDEX_MAPPING_FILE"

# Step 5: Create the index using direct API call
echo "Creating index using direct API call to OpenSearch..."

# Get the collection endpoint for direct API access
COLLECTION_ENDPOINT=$(aws opensearchserverless batch-get-collection \
  --names "$COLLECTION_NAME" \
  --query 'collectionDetails[0].collectionEndpoint' \
  --output text \
  --region $AWS_REGION)

echo "Collection endpoint: $COLLECTION_ENDPOINT"

if [ -z "$COLLECTION_ENDPOINT" ] || [ "$COLLECTION_ENDPOINT" == "None" ]; then
  echo "ERROR: Failed to get collection endpoint. Check if the collection exists and is active."
  exit 1
fi

# Fix the endpoint format if needed
if [[ $COLLECTION_ENDPOINT == https://* ]]; then
  ENDPOINT_WITHOUT_PROTOCOL=${COLLECTION_ENDPOINT#https://}
  echo "Endpoint without protocol: $ENDPOINT_WITHOUT_PROTOCOL"
else
  ENDPOINT_WITHOUT_PROTOCOL=$COLLECTION_ENDPOINT
fi

# Get AWS credentials
AWS_ACCESS_KEY=$(aws configure get aws_access_key_id)
AWS_SECRET_KEY=$(aws configure get aws_secret_access_key)
AWS_SESSION_TOKEN=$(aws configure get aws_session_token)

echo "Checking AWS credentials..."
if [ -z "$AWS_ACCESS_KEY" ] || [ -z "$AWS_SECRET_KEY" ]; then
  echo "ERROR: AWS credentials not found. Make sure you've configured the AWS CLI."
  exit 1
fi

echo "Creating index using curl with AWS SigV4 authentication..."

# Check if curl is available
if ! command -v curl &> /dev/null; then
  echo "ERROR: curl is not available. Please install curl to use this script."
  exit 1
fi

# Calculate SHA256 hash of the request payload
REQUEST_PAYLOAD_SHA_HASH=$(openssl dgst -sha256 -hex "$INDEX_MAPPING_FILE" | sed 's/^.* //')

echo "Request payload SHA256 hash: $REQUEST_PAYLOAD_SHA_HASH"

# Create the index with curl
echo "Using curl to create index..."

# Build curl command
CURL_CMD="curl -X PUT \"https://$ENDPOINT_WITHOUT_PROTOCOL/bedrock-knowledge-base-default-index\" \
  --user \"$AWS_ACCESS_KEY:$AWS_SECRET_KEY\" \
  --aws-sigv4 \"aws:amz:$AWS_REGION:aoss\" \
  --header \"Content-Type: application/json\" \
  --header \"x-amz-content-sha256: $REQUEST_PAYLOAD_SHA_HASH\""

# Add session token if it exists
if [ -n "$AWS_SESSION_TOKEN" ]; then
  CURL_CMD="$CURL_CMD \
  -H \"x-amz-security-token:$AWS_SESSION_TOKEN\""
fi

# Add data file
CURL_CMD="$CURL_CMD \
  -d @\"$INDEX_MAPPING_FILE\""

# Add verbose flag if requested
if [ "$VERBOSE" = true ]; then
  CURL_CMD="$CURL_CMD -v"
  echo "Using verbose output for curl"
  
  # Create a temporary file for the response
  RESPONSE_FILE=$(mktemp)
  
  # Execute the curl command and capture output
  echo "Executing curl command..."
  echo "Command: $CURL_CMD"
  
  eval "$CURL_CMD > $RESPONSE_FILE"
  CREATE_RESULT=$?
  
  # Read the response
  RESPONSE=$(cat $RESPONSE_FILE)
  
  # Check if the response contains success indicators
  if [[ "$RESPONSE" == *"\"acknowledged\":true"* ]]; then
    HTTP_CODE="200"
  else
    HTTP_CODE="403"  # Default to error if we can't determine success
  fi
  
  CREATE_RESULT=$?
  
  # Check the HTTP status code even in verbose mode
  if [ "$HTTP_CODE" == "200" ] || [ "$HTTP_CODE" == "201" ]; then
    echo "Successfully created index. Status code: $HTTP_CODE"
  else
    echo "Failed to create index. Status code: $HTTP_CODE"
    echo "Error response: $(cat $RESPONSE_FILE)"
    
    # Provide guidance based on the error code
    if [ "$HTTP_CODE" == "403" ]; then
      echo ""
      echo "Permission denied (403 Forbidden). This is likely due to missing IAM permissions."
      echo "Current identity: $AWS_USER_ARN"
      echo "Make sure your AWS credentials have the following permissions:"
      echo "  - aoss:APIAccessAll"
      echo "  - aoss:DashboardsAccessAll"
      echo ""
      echo "Also ensure you have a data access policy that grants the following permissions:"
      echo "  - aoss:CreateIndex"
      echo "  - aoss:UpdateIndex"
      echo ""
      echo "For more information, see: https://docs.aws.amazon.com/opensearch-service/latest/developerguide/serverless-data-access.html"
    elif [ "$HTTP_CODE" == "404" ]; then
      echo ""
      echo "Not found (404). This could mean the collection doesn't exist or the endpoint is incorrect."
    elif [ "$HTTP_CODE" == "400" ]; then
      echo ""
      echo "Bad request (400). This could be due to invalid index mapping format."
    fi
    
    CREATE_RESULT=1
  fi
  
  # Clean up the response file
  rm $RESPONSE_FILE
else
  # Create a temporary file for the response
  RESPONSE_FILE=$(mktemp)
  
  # Execute the curl command and capture output
  echo "Executing curl command..."
  
  # Add output options to the curl command
  CURL_CMD="$CURL_CMD -s -w \"%{http_code}\" -o $RESPONSE_FILE"
  
  # Execute the command
  HTTP_CODE=$(eval "$CURL_CMD")
  
  CREATE_RESULT=$?
  
  # Check the HTTP status code
  if [ "$HTTP_CODE" == "200" ] || [ "$HTTP_CODE" == "201" ]; then
    echo "Successfully created index. Status code: $HTTP_CODE"
    echo "Response: $(cat $RESPONSE_FILE)"
  else
    echo "Failed to create index. Status code: $HTTP_CODE"
    echo "Error response: $(cat $RESPONSE_FILE)"
    
    # Provide guidance based on the error code
    if [ "$HTTP_CODE" == "403" ]; then
      echo ""
      echo "Permission denied (403 Forbidden). This is likely due to missing IAM permissions."
      echo "Make sure your AWS credentials have the following permissions:"
      echo "  - aoss:APIAccessAll"
      echo "  - aoss:DashboardsAccessAll"
      echo ""
      echo "Also ensure you have a data access policy that grants the following permissions:"
      echo "  - aoss:CreateIndex"
      echo "  - aoss:UpdateIndex"
      echo ""
      echo "For more information, see: https://docs.aws.amazon.com/opensearch-service/latest/developerguide/serverless-data-access.html"
    elif [ "$HTTP_CODE" == "404" ]; then
      echo ""
      echo "Not found (404). This could mean the collection doesn't exist or the endpoint is incorrect."
    elif [ "$HTTP_CODE" == "400" ]; then
      echo ""
      echo "Bad request (400). This could be due to invalid index mapping format."
    fi
    
    CREATE_RESULT=1
  fi
  
  # Clean up the response file
  rm $RESPONSE_FILE
fi

# Clean up the index mapping file
rm $INDEX_MAPPING_FILE

if [ $CREATE_RESULT -eq 0 ]; then
  echo "Successfully created index 'bedrock-knowledge-base-default-index'."
else
  echo "Failed to create index. Please check the error message above."
  exit 1
fi

# Step 6: Verify the index was created using curl
echo "Verifying the index was created..."
VERIFY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET "https://$ENDPOINT_WITHOUT_PROTOCOL/bedrock-knowledge-base-default-index" \
  -H "Content-Type: application/json" \
  --aws-sigv4 "aws:amz:$AWS_REGION:aoss" \
  --user "$AWS_ACCESS_KEY:$AWS_SECRET_KEY" \
  -H "x-amz-security-token:$AWS_SESSION_TOKEN")

if [ "$VERIFY_STATUS" == "200" ]; then
  echo "Verification successful: Index 'bedrock-knowledge-base-default-index' exists."
else
  echo "Warning: Could not verify index exists. Status code: $VERIFY_STATUS"
  echo "This may be due to eventual consistency. The index might still be creating."
fi

echo ""
echo "===== Index creation complete ====="
echo "You can now create the Bedrock Knowledge Base using:"
echo "  terraform apply -var=\"create_knowledge_base=true\""
echo "  or"
echo "  ./scripts/deployment/apply-changes.sh --create-kb"
