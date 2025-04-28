# AWS GenAI Chatbot Architecture

## System Architecture

```mermaid
flowchart TD
    Client[Client Application] <--> AppSync[AWS AppSync GraphQL API]
    
    subgraph "API Layer"
        AppSync --> MessageHandler[Lambda: Message Handler]
        AppSync --> Subscriptions[Real-time Subscriptions]
    end
    
    subgraph "Business Logic"
        MessageHandler --> BedrockClient[Lambda: Bedrock Client]
        BedrockClient --> Bedrock[Amazon Bedrock]
    end
    
    subgraph "Data Layer"
        MessageHandler --> MessagesTable[DynamoDB: Messages Table]
        MessageHandler --> ConversationsTable[DynamoDB: Conversations Table]
    end
    
    Terraform[Terraform IaC] -.-> AppSync
    Terraform -.-> MessageHandler
    Terraform -.-> BedrockClient
    Terraform -.-> MessagesTable
    Terraform -.-> ConversationsTable
    
    style Client fill:#f9f,stroke:#333,stroke-width:2px
    style AppSync fill:#bbf,stroke:#333,stroke-width:2px
    style MessageHandler fill:#bfb,stroke:#333,stroke-width:2px
    style BedrockClient fill:#bfb,stroke:#333,stroke-width:2px
    style Bedrock fill:#fbb,stroke:#333,stroke-width:2px
    style MessagesTable fill:#ffd,stroke:#333,stroke-width:2px
    style ConversationsTable fill:#ffd,stroke:#333,stroke-width:2px
    style Terraform fill:#ddf,stroke:#333,stroke-width:2px
    style Subscriptions fill:#bbf,stroke:#333,stroke-width:2px
```

## Data Flow

```mermaid
sequenceDiagram
    participant Client
    participant AppSync as AWS AppSync
    participant MessageHandler as Lambda: Message Handler
    participant BedrockClient as Lambda: Bedrock Client
    participant Bedrock as Amazon Bedrock
    participant DynamoDB
    
    Client->>AppSync: sendMessage mutation
    AppSync->>MessageHandler: Invoke Lambda resolver
    MessageHandler->>DynamoDB: Store user message
    MessageHandler->>BedrockClient: Request AI response
    BedrockClient->>Bedrock: Invoke model
    Bedrock-->>BedrockClient: AI-generated response
    BedrockClient-->>MessageHandler: Return response
    MessageHandler->>DynamoDB: Store AI response
    MessageHandler-->>AppSync: Return user message
    AppSync->>Client: Return user message
    AppSync->>Client: Publish AI response via subscription
```

## DynamoDB Schema

```mermaid
erDiagram
    CONVERSATION {
        string id "PK"
        string title
        string createdAt
        string updatedAt
    }
    MESSAGE {
        string id "PK"
        string conversationId "SK"
        string content
        string role
        string timestamp
    }
    CONVERSATION ||--o{ MESSAGE : contains
```
