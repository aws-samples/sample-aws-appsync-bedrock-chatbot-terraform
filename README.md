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
└── README.md                   # Project documentation
```

## Deployment Instructions

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
```

3. **Initialize Terraform**

```bash
cd terraform
terraform init
```

4. **Review and apply the Terraform configuration**

```bash
terraform plan
terraform apply
```

5. **Access the AppSync GraphQL API**

After deployment, Terraform will output the AppSync GraphQL endpoint URL and API key. You can use these to interact with the API using tools like the AWS AppSync Console, Postman, or a GraphQL client.

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

## Customization

- **Bedrock Model**: You can change the Bedrock model by updating the `bedrock_model_id` variable in `terraform/variables.tf`.
- **Region**: Update the AWS region in `terraform/variables.tf`.
- **Table Configuration**: Modify the DynamoDB table settings in `terraform/modules/dynamodb/main.tf`.

## Cleanup

To remove all resources created by this project:

```bash
cd terraform
terraform destroy
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
