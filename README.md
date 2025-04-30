# AWS GenAI Chatbot with AppSync, Lambda, DynamoDB, Bedrock, and Terraform

This project demonstrates how to build a generative AI chatbot on AWS using AppSync, Lambda, DynamoDB, Amazon Bedrock, and Terraform. The architecture provides a scalable, serverless solution for creating AI-powered conversational experiences.

## Architecture Overview

![Architecture Diagram](https://via.placeholder.com/800x400?text=AWS+GenAI+Chatbot+Architecture)

The solution consists of the following components:

- **AWS AppSync**: Provides the GraphQL API layer with real-time capabilities
- **AWS Lambda**: Handles business logic and integration with Bedrock
- **Amazon DynamoDB**: Stores chat history and conversation data
- **Amazon Bedrock**: Provides the foundation model for AI capabilities
- **Terraform**: Infrastructure as Code (IaC) for provisioning all resources
- **React Frontend**: User interface for interacting with the chatbot

## Prerequisites

- AWS Account with appropriate permissions
- AWS CLI configured with access credentials
- Terraform (v1.2.0 or later)
- Node.js (v14 or later) and npm

## Project Structure

```
appsync-genai-terraform/
├── terraform/                  # Terraform configuration
│   ├── main.tf                 # Main Terraform configuration
│   ├── variables.tf            # Input variables
│   ├── outputs.tf              # Output values
│   ├── providers.tf            # Provider configuration
│   └── modules/                # Terraform modules
│       ├── appsync/            # AppSync module
│       ├── lambda/             # Lambda functions module
│       ├── dynamodb/           # DynamoDB module
│       └── iam/                # IAM roles and policies module
├── src/                        # Source code
│   ├── functions/              # Lambda functions
│   │   ├── message-handler/    # Message handling Lambda
│   │   └── bedrock-client/     # Bedrock integration Lambda
│   └── schema/                 # GraphQL schema
│       └── schema.graphql      # AppSync GraphQL schema
├── frontend/                   # React frontend application
│   ├── public/                 # Public assets
│   ├── src/                    # Frontend source code
│   │   ├── components/         # React components
│   │   ├── graphql/            # GraphQL operations and client
│   │   └── ...                 # Other frontend files
│   ├── package.json            # Frontend dependencies
│   └── README.md               # Frontend documentation
└── README.md                   # Project documentation
```

## Deployment Instructions

For detailed deployment instructions, please refer to the [Deployment Guide](deployment-guide.md).

1. **Clone the repository**

```bash
git clone https://github.com/yourusername/appsync-genai-terraform.git
cd appsync-genai-terraform
```

2. **Install dependencies for Lambda functions**

```bash
cd src/functions/message-handler
npm install
cd ../../..

cd src/functions/bedrock-client
npm install
cd ../../..

cd src/functions/streaming-handler
npm install
cd ../../..
```

3. **Initialize Terraform**

```bash
cd terraform
terraform init
cd ..
```

4. **Deploy using the consolidated script**

```bash
# Standard deployment
./apply-changes.sh

# Deployment with frontend rebuild
./apply-changes.sh --build
```

This script will apply Terraform changes, update the frontend configuration, and restart the frontend application.

## Testing After Deployment

After deploying the infrastructure with Terraform, you have several options to test your AWS GenAI Chatbot:

### Option 1: Using the React Frontend (Recommended)

1. **Set up the frontend application**:

```bash
cd frontend
npm install
```

2. **Update the frontend configuration with Terraform outputs**:

```bash
node update-config.js ../terraform/terraform-output.json your-aws-region
```

3. **Start the frontend application**:

```bash
npm start
```

4. **Access the application** at http://localhost:3000 and start chatting with the AI.

### Option 2: Using the AWS AppSync Console

1. Log in to the AWS Management Console
2. Navigate to AWS AppSync
3. Find your API (the name is available in the Terraform output)
4. Go to the "Queries" section
5. Use the API key from Terraform output for authentication
6. Test GraphQL operations as described in the "Using the Chatbot" section below

### Option 3: Using Postman or Insomnia

1. Get the GraphQL endpoint URL and API key from Terraform outputs
2. Set up a new request in Postman/Insomnia:
   - Method: POST
   - URL: Your GraphQL endpoint
   - Headers:
     - `Content-Type: application/json`
     - `x-api-key: YOUR_API_KEY`
   - Body (JSON): Your GraphQL query or mutation

### Option 4: Using the test-api.sh Script

We've included a convenient bash script to test the API directly from the command line:

```bash
# Make the script executable (if not already)
chmod +x test-api.sh

# Run the script
./test-api.sh
```

This interactive script allows you to:
- Create new conversations
- List all conversations
- Send messages to the AI
- View messages in a conversation

The script requires `jq` to be installed for JSON processing.

### Option 5: Using AWS CLI for DynamoDB Testing

```bash
# List conversations in DynamoDB
aws dynamodb scan --table-name $(terraform -chdir=terraform output -raw dynamodb_conversations_table_name)

# List messages in DynamoDB
aws dynamodb scan --table-name $(terraform -chdir=terraform output -raw dynamodb_messages_table_name)
```

### Option 5: Using CloudWatch Logs for Debugging

1. Go to AWS CloudWatch in the console
2. Navigate to "Log groups"
3. Find logs for your Lambda functions:
   - `/aws/lambda/message-handler-function`
   - `/aws/lambda/bedrock-client-function`
4. Review logs for any errors or issues

## Using the Chatbot

The chatbot provides the following GraphQL operations:

- **Queries**:
  - `getMessage(id: ID!)`: Get a specific message by ID
  - `getConversation(id: ID!)`: Get a conversation by ID
  - `listConversations`: List all conversations
  - `getMessages(conversationId: ID!)`: Get all messages in a conversation

- **Mutations**:
  - `createConversation(title: String)`: Create a new conversation
  - `sendMessage(conversationId: ID!, content: String!)`: Send a message in a conversation

- **Subscriptions**:
  - `onNewMessage(conversationId: ID!)`: Subscribe to new messages in a conversation

### Example Usage

1. Create a new conversation:

```graphql
mutation CreateConversation {
  createConversation(title: "My AI Chat") {
    id
    title
    createdAt
  }
}
```

2. Send a message:

```graphql
mutation SendMessage {
  sendMessage(
    conversationId: "CONVERSATION_ID",
    content: "Tell me about AWS AppSync"
  ) {
    id
    content
    role
    timestamp
  }
}
```

3. Subscribe to new messages:

```graphql
subscription OnNewMessage {
  onNewMessage(conversationId: "CONVERSATION_ID") {
    id
    content
    role
    timestamp
  }
}
```

## Deploying the Frontend to Production

For production use, you can deploy the frontend to various hosting services:

### Option 1: AWS Amplify

1. Push your code to a Git repository
2. Set up a new Amplify app in the AWS Management Console
3. Connect your repository and follow the deployment steps

### Option 2: AWS S3 + CloudFront

1. Build the frontend: `cd frontend && npm run build`
2. Upload the contents of the `build` directory to an S3 bucket
3. Configure the bucket for static website hosting
4. (Optional) Set up CloudFront for CDN distribution

## Customization

- **Bedrock Model**: You can change the Bedrock model by updating the `bedrock_model_id` variable in `terraform/variables.tf`.
- **Region**: Update the AWS region in `terraform/variables.tf`.
- **Table Configuration**: Modify the DynamoDB table settings in `terraform/modules/dynamodb/main.tf`.
- **Frontend Styling**: Customize the frontend appearance by modifying the CSS files in `frontend/src/components/`.

## Cleanup

To remove all resources created by this project:

```bash
cd terraform
terraform destroy
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
