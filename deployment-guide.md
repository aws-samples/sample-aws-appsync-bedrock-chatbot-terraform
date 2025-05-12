# Deployment Guide

This project uses Terraform to manage all infrastructure resources, including Lambda functions, AppSync API, and DynamoDB tables.

## Deployment Process

The deployment process has been simplified to use Terraform exclusively for all infrastructure updates, ensuring consistent state management and proper versioning of all resources.

### Deploying Changes

To deploy changes to both infrastructure and Lambda functions, use the `apply-changes.sh` script:

```bash
# Standard deployment
./apply-changes.sh

# Deployment with frontend rebuild
./apply-changes.sh --build
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
./restart-frontend.sh
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
3. Run `./apply-changes.sh` to deploy all changes (this will automatically install dependencies)
4. Test your changes

## Benefits of Terraform-Only Approach

- **Consistent state management**: Terraform tracks the state of all resources
- **Complete infrastructure as code**: All resources are defined and versioned in your Terraform files
- **Atomic deployments**: Changes to related resources are deployed together
- **Better auditability**: All changes go through the same deployment process
