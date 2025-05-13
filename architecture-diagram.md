# AWS GenAI Chatbot Architecture Diagrams

This document contains the architecture diagrams for the AWS GenAI Chatbot project, illustrating the system components and their interactions.

## System Architecture Overview

```mermaid
flowchart TD
    subgraph "Client Layer"
        Client[Client Application]
    end
    
    subgraph "Authentication Layer"
        AuthLambda[Lambda: Auth Handler]
    end
    
    subgraph "API Layer"
        AppSync[AWS AppSync GraphQL API]
    end
    
    subgraph "Processing Layer"
        MessageHandler[Lambda: Message Handler]
        StreamingHandler[Lambda: Streaming Handler]
    end
    
    subgraph "AI Services"
        Bedrock[Amazon Bedrock]
    end
    
    subgraph "Data Layer"
        DynamoDBTable[DynamoDB: Single Table]
        UsersTable[DynamoDB: Users Table]
        SecretsManager[AWS Secrets Manager]
    end
    
    Client -- "1. Login Request" --> AuthLambda
    AuthLambda -- "2. Verify Credentials" --> UsersTable
    AuthLambda -- "3. Get JWT Secret" --> SecretsManager
    AuthLambda -- "4. JWT Token" --> Client
    Client -- "5. Request with JWT" --> AppSync
    AppSync -- "6. Validate JWT" --> AuthLambda
    AppSync -- "7. If Authorized" --> MessageHandler
    MessageHandler --> StreamingHandler
    StreamingHandler --> Bedrock
    MessageHandler --> DynamoDBTable
    StreamingHandler --> DynamoDBTable
    StreamingHandler --> AppSync
    AppSync --> Client
    
    style Client fill:#f9f,stroke:#333,stroke-width:2px
    style AppSync fill:#bbf,stroke:#333,stroke-width:2px
    style MessageHandler fill:#bfb,stroke:#333,stroke-width:2px
    style StreamingHandler fill:#bfb,stroke:#333,stroke-width:2px
    style Bedrock fill:#fbb,stroke:#333,stroke-width:2px
    style DynamoDBTable fill:#ffd,stroke:#333,stroke-width:2px
    style UsersTable fill:#ffd,stroke:#333,stroke-width:2px
    style AuthLambda fill:#bfb,stroke:#333,stroke-width:2px
    style SecretsManager fill:#ffd,stroke:#333,stroke-width:2px
```

## Secure Frontend Deployment Architecture

This diagram illustrates the secure frontend deployment architecture using S3 and CloudFront with Origin Access Identity (OAI).

```mermaid
flowchart LR
    User[End Users] --> |HTTPS| CloudFront[CloudFront Distribution]
    User --> |GraphQL/WebSocket| AppSync[AppSync GraphQL API]
    
    subgraph "Frontend Hosting"
        CloudFront
        subgraph "Private Access"
            S3["S3 Bucket<br/>(Private)"]
            OAI["Origin Access<br/>Identity"]
            Firewall["Public Access<br/>Blocked"]
        end
    end
    
    CloudFront --> |Secure access| OAI
    OAI --> |Restricted access| S3
    Firewall --> |Blocked| S3
    
    CloudFront --> |WebSocket connection| AppSync
    
    subgraph "Backend Services"
        AppSync
        subgraph "Processing"
            MessageHandler[Message Handler]
            StreamingHandler[Streaming Handler]
        end
        
        subgraph "Data Storage"
            DynamoDB[DynamoDB Tables]
        end
    end
    
    AppSync --> MessageHandler
    MessageHandler --> StreamingHandler
    MessageHandler --> DynamoDB
    StreamingHandler --> DynamoDB
    StreamingHandler --> AppSync
    
    style User fill:#f9f,stroke:#333,stroke-width:2px
    style CloudFront fill:#bbf,stroke:#333,stroke-width:2px
    style S3 fill:#ffd,stroke:#333,stroke-width:2px
    style OAI fill:#bfb,stroke:#333,stroke-width:2px
    style Firewall fill:#fbb,stroke:#333,stroke-width:2px
    style AppSync fill:#bbf,stroke:#333,stroke-width:2px
    style MessageHandler fill:#bfb,stroke:#333,stroke-width:2px
    style StreamingHandler fill:#bfb,stroke:#333,stroke-width:2px
    style DynamoDB fill:#ffd,stroke:#333,stroke-width:2px
```

## Streaming Data Flow

```mermaid
sequenceDiagram
    participant Client
    participant AppSync as AWS AppSync
    participant MessageHandler as Lambda: Message Handler
    participant StreamingHandler as Lambda: Streaming Handler
    participant Bedrock as Amazon Bedrock
    participant DynamoDB
    
    Client->>AppSync: sendMessage mutation
    AppSync->>MessageHandler: Invoke Lambda resolver
    MessageHandler->>DynamoDB: Store user message
    
    MessageHandler->>DynamoDB: Create initial empty assistant message
    MessageHandler->>StreamingHandler: Invoke asynchronously
    MessageHandler-->>AppSync: Return user message
    AppSync->>Client: Return user message
    
    StreamingHandler->>Bedrock: Invoke model with streaming
    
    loop For each chunk of the response
        Bedrock-->>StreamingHandler: Stream response chunk
        StreamingHandler->>DynamoDB: Update message content incrementally
        StreamingHandler->>AppSync: Publish updateMessageContent mutation
        AppSync->>Client: Push update via onMessageUpdate subscription
    end
    
    StreamingHandler->>DynamoDB: Mark message as complete (isComplete=true)
    StreamingHandler->>AppSync: Publish final updateMessageContent
    AppSync->>Client: Push final update via subscription
```

## Subscription Flow

```mermaid
flowchart TD
    subgraph "Client Application"
        UserMessage[User sends message]
        DisplayUserMessage[Display user message]
        DisplayTyping[Display typing indicator]
        DisplayStreamingResponse[Display streaming response]
        DisplayFinalResponse[Display final response]
    end
    
    subgraph "AppSync API"
        SendMessageMutation[sendMessage mutation]
        OnNewMessageSub[onNewMessage subscription]
        OnMessageUpdateSub[onMessageUpdate subscription]
    end
    
    subgraph "Lambda Functions"
        MessageHandler[Message Handler]
        StreamingHandler[Streaming Handler]
    end
    
    subgraph "DynamoDB"
        StoreUserMessage[Store user message]
        CreateEmptyResponse[Create empty assistant message]
        UpdateMessageContent[Update message content]
        MarkComplete[Mark message as complete]
    end
    
    UserMessage --> SendMessageMutation
    SendMessageMutation --> MessageHandler
    MessageHandler --> StoreUserMessage
    MessageHandler --> CreateEmptyResponse
    MessageHandler --> StreamingHandler
    
    OnNewMessageSub --> DisplayUserMessage
    
    StreamingHandler --> UpdateMessageContent
    UpdateMessageContent --> OnMessageUpdateSub
    OnMessageUpdateSub --> DisplayStreamingResponse
    
    StreamingHandler --> MarkComplete
    MarkComplete --> OnMessageUpdateSub
    OnMessageUpdateSub --> DisplayFinalResponse
    
    style UserMessage fill:#f9f,stroke:#333,stroke-width:2px
    style SendMessageMutation fill:#bbf,stroke:#333,stroke-width:2px
    style OnNewMessageSub fill:#bbf,stroke:#333,stroke-width:2px
    style OnMessageUpdateSub fill:#bbf,stroke:#333,stroke-width:2px
    style MessageHandler fill:#bfb,stroke:#333,stroke-width:2px
    style StreamingHandler fill:#bfb,stroke:#333,stroke-width:2px
    style StoreUserMessage fill:#ffd,stroke:#333,stroke-width:2px
    style CreateEmptyResponse fill:#ffd,stroke:#333,stroke-width:2px
    style UpdateMessageContent fill:#ffd,stroke:#333,stroke-width:2px
    style MarkComplete fill:#ffd,stroke:#333,stroke-width:2px
    style DisplayUserMessage fill:#f9f,stroke:#333,stroke-width:2px
    style DisplayTyping fill:#f9f,stroke:#333,stroke-width:2px
    style DisplayStreamingResponse fill:#f9f,stroke:#333,stroke-width:2px
    style DisplayFinalResponse fill:#f9f,stroke:#333,stroke-width:2px
```

## Data Access Security Model

```mermaid
flowchart TD
    subgraph "Authentication"
        User[User] --> |1. Login| AuthLambda[Auth Lambda]
        AuthLambda --> |2. JWT Token| User
    end
    
    subgraph "User-Specific Data Access"
        User --> |3. Request with JWT| AppSync[AppSync API]
        AppSync --> |4. Extract userId| MessageHandler[Message Handler]
        
        MessageHandler --> |5a. Query USER#userId| DynamoDB[(DynamoDB)]
        MessageHandler --> |5b. Verify Ownership| DynamoDB
        MessageHandler --> |5c. Access Data| DynamoDB
    end
    
    subgraph "Data Model"
        UserConv[USER#userId → CONV#convId]
        ConvMeta[CONV#convId → METADATA]
        Messages[CONV#convId → MSG#msgId]
        
        UserConv --> |"Ownership"| ConvMeta
        ConvMeta --> |"Contains"| Messages
    end
    
    style User fill:#f9f,stroke:#333,stroke-width:2px
    style AppSync fill:#bbf,stroke:#333,stroke-width:2px
    style MessageHandler fill:#bfb,stroke:#333,stroke-width:2px
    style DynamoDB fill:#ffd,stroke:#333,stroke-width:2px
    style UserConv fill:#ffd,stroke:#333,stroke-width:2px
    style ConvMeta fill:#ffd,stroke:#333,stroke-width:2px
    style Messages fill:#ffd,stroke:#333,stroke-width:2px
    style AuthLambda fill:#bfb,stroke:#333,stroke-width:2px
```

This diagram illustrates how user-specific data access is enforced:

1. User authenticates and receives a JWT token
2. JWT token contains the user's ID
3. AppSync extracts the user ID from the JWT token
4. Message Handler uses the user ID to query only the user's conversations
5. Before accessing conversation data, ownership is verified
6. The data model links users directly to their conversations
