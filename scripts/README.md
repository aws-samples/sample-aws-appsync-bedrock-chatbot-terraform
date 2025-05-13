# Utility Scripts

This directory contains utility scripts for managing data in the GenAI Chatbot application.

## seed-users.js

This script seeds the DynamoDB users table with default users for testing.

### Usage

```bash
AWS_REGION=us-east-1 USERS_TABLE_NAME=your-table-name node seed-users.js
```

### Parameters

The script uses the following environment variables:
- `AWS_REGION`: The AWS region where the DynamoDB table is located
- `USERS_TABLE_NAME`: The name of the DynamoDB users table

### Example

```bash
# Using environment variables
AWS_REGION=us-east-1 USERS_TABLE_NAME=genai-chatbot-users-dev node seed-users.js

# Or using the table name from Terraform output
AWS_REGION=us-east-1 USERS_TABLE_NAME=$(cd ../terraform && terraform output -raw dynamodb_users_table_name) node seed-users.js
```

### What the Script Does

1. Creates default users with predefined usernames and passwords
2. Hashes passwords using bcrypt for secure storage
3. Stores user data in the DynamoDB users table

### AWS Credentials

The script uses the AWS SDK, which will look for credentials in the following order:
1. Environment variables (AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY)
2. Shared credentials file (~/.aws/credentials)
3. EC2 instance profile (if running on EC2)

Make sure you have the appropriate credentials configured before running the script.
