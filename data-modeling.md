# DynamoDB Data Modeling Guide

This document explains the data modeling approach used in the AWS GenAI Chatbot application, focusing on the single-table design pattern and user-specific data access.

## Single-Table Design

The application uses a single-table design pattern for DynamoDB with the following key structure:

### Primary Table (chatbot_data)
- **PK (Partition Key)**: String
- **SK (Sort Key)**: String
- **GSI1PK (GSI1 Partition Key)**: String
- **GSI1SK (GSI1 Sort Key)**: String

## Entity Types and Access Patterns

### User-Conversation Mapping
- **PK**: `USER#<userId>`
- **SK**: `CONV#<conversationId>`
- **GSI2PK**: `USER#<userId>`
- **GSI2SK**: `<reversedTimestamp>` (for time-based sorting)
- **Attributes**: id, userId, title, createdAt, updatedAt
- **Access Patterns**: 
  - List all conversations for a specific user
  - List conversations sorted by most recent activity

### Conversation Metadata
- **PK**: `CONV#<conversationId>`
- **SK**: `METADATA`
- **Attributes**: id, userId, title, createdAt, updatedAt
- **Access Pattern**: Get conversation details by ID

### Message
- **PK**: `CONV#<conversationId>`
- **SK**: `MSG#<messageId>`
- **GSI1PK**: `CONV#<conversationId>`
- **GSI1SK**: `<timestamp>#MSG#<messageId>`
- **Attributes**: id, conversationId, content, role, timestamp, isComplete
- **Access Patterns**: 
  - Get all messages for a conversation
  - Get messages in chronological order

## Security Model

The data model enforces user-specific data access through the following mechanisms:

1. **Direct User-Conversation Mapping**: Each conversation is directly linked to its owner through the `USER#<userId>` partition key
2. **Ownership Verification**: Before accessing conversation messages, the system verifies the user owns the conversation
3. **No Cross-User Access**: Users can only see conversations and messages they own

## Example Queries

### List User's Conversations
```javascript
const params = {
  TableName: DYNAMODB_TABLE_NAME,
  KeyConditionExpression: 'PK = :userId',
  ExpressionAttributeValues: {
    ':userId': `USER#${userId}`
  }
};
```

### Get Conversation (with ownership check)
```javascript
// First check if user owns the conversation
const userConvParams = {
  TableName: DYNAMODB_TABLE_NAME,
  Key: { 
    PK: `USER#${userId}`,
    SK: `CONV#${conversationId}`
  }
};
```

### Get Messages for a Conversation (chronologically)
```javascript
// After ownership verification
const params = {
  TableName: DYNAMODB_TABLE_NAME,
  IndexName: "GSI1",
  KeyConditionExpression: 'GSI1PK = :pk',
  ExpressionAttributeValues: {
    ':pk': `CONV#${conversationId}`
  }
};
```

### List User's Conversations by Most Recent Activity
```javascript
const params = {
  TableName: DYNAMODB_TABLE_NAME,
  IndexName: "GSI2",
  KeyConditionExpression: 'GSI2PK = :userId',
  ExpressionAttributeValues: {
    ':userId': `USER#${userId}`
  },
  Limit: 10 // Limit to most recent 10 conversations
};
```

## Transaction Example: Creating a New Conversation

```javascript
const timestamp = new Date().toISOString();
const reversedTimestamp = `${9999999999999 - Date.now()}`; // For descending order

const params = {
  TransactItems: [
    {
      Put: {
        TableName: DYNAMODB_TABLE_NAME,
        Item: {
          PK: `USER#${userId}`,
          SK: `CONV#${id}`,
          GSI2PK: `USER#${userId}`,
          GSI2SK: reversedTimestamp,
          id,
          userId,
          title,
          createdAt: timestamp,
          updatedAt: timestamp
        }
      }
    },
    {
      Put: {
        TableName: DYNAMODB_TABLE_NAME,
        Item: {
          PK: `CONV#${id}`,
          SK: 'METADATA',
          id,
          userId,
          title,
          createdAt: timestamp,
          updatedAt: timestamp
        }
      }
    }
  ]
};
```

## Access Pattern Analysis

The table below summarizes all access patterns supported by this data model:

| Access Pattern | Query Method | Key Structure | Description |
|----------------|--------------|--------------|-------------|
| Authenticate user | Get on users table | `username` | Verify user credentials |
| List user conversations | Query | `PK = USER#<userId>` | Get all conversations for a user |
| Get conversation | Get | `PK = USER#<userId>`, `SK = CONV#<id>` | Get a specific conversation with ownership check |
| Get conversation messages | Query | `PK = CONV#<id>`, `SK begins_with MSG#` | Get all messages in a conversation |
| Get messages chronologically | Query GSI1 | `GSI1PK = CONV#<id>` | Get messages sorted by timestamp |
| Get specific message | Get | `PK = CONV#<id>`, `SK = MSG#<msgId>` | Get a specific message |
| Update message content | Update | `PK = CONV#<id>`, `SK = MSG#<msgId>` | Update streaming message content |
| List recent conversations | Query GSI2 | `GSI2PK = USER#<userId>` | Get user's conversations sorted by most recent activity |

## Time-Based Sorting of Conversations

A common requirement for chat applications is to display conversations sorted by most recent activity. Users expect to see their most recently updated conversations at the top of the list. To support this access pattern efficiently, we've implemented a time-based sorting mechanism using a Global Secondary Index (GSI).

### Design Decision: GSI vs. Composite Sort Key

We evaluated two approaches for implementing time-based sorting:

1. **Composite Sort Key Approach**: Embedding timestamps in the primary sort key
   - `PK = USER#<userId>`
   - `SK = TS#<timestamp>#CONV#<conversationId>`

2. **GSI Approach**: Using a separate GSI with timestamp as sort key
   - Primary Table: `PK = USER#<userId>`, `SK = CONV#<conversationId>`
   - GSI2: `GSI2PK = USER#<userId>`, `GSI2SK = <reversedTimestamp>`

We chose the **GSI approach** for the following reasons:

1. **Simplified Update Logic**: When a conversation is updated, we only need to update the GSI2SK attribute rather than deleting and recreating the entire item. This reduces the complexity of update operations and lowers the risk of data inconsistency.

2. **Development Efficiency**: The simpler update logic results in less code to maintain and fewer potential bugs, optimizing for developer productivity during the development stage.

3. **Flexibility**: The GSI approach allows us to easily add different sort orders in the future (e.g., alphabetical by title, creation date) without changing the primary table structure.

4. **Cost-Effective**: While GSIs do incur additional costs, the incremental cost for this specific use case is minimal compared to the development time saved. For our expected data volume, the additional storage and throughput costs are negligible.

5. **Migration Friendly**: Adding a GSI is less disruptive than changing the primary key structure, making it easier to implement if we already have data in the current format.

The eventual consistency of GSIs (typically a few seconds) is acceptable for conversation listing, as it doesn't significantly impact the user experience in this context.

### Implementation Details

#### User-Conversation Mapping with Timestamp

```javascript
// When creating a conversation
const timestamp = new Date().toISOString();
const reversedTimestamp = `${9999999999999 - Date.now()}`; // For descending order

const userConversationItem = {
  PK: `USER#${userId}`,
  SK: `CONV#${id}`,
  GSI2PK: `USER#${userId}`,
  GSI2SK: reversedTimestamp,
  id,
  userId,
  title: title || 'New Conversation',
  createdAt: timestamp,
  updatedAt: timestamp
};
```

#### Updating Conversation Timestamp

When a new message is added to a conversation, we update the conversation's timestamp:

```javascript
// When updating a conversation (e.g., adding a new message)
const newTimestamp = new Date().toISOString();
const reversedNewTimestamp = `${9999999999999 - Date.now()}`;

await dynamodb.update({
  TableName: DYNAMODB_TABLE_NAME,
  Key: { 
    PK: `USER#${userId}`, 
    SK: `CONV#${conversationId}` 
  },
  UpdateExpression: 'SET updatedAt = :updatedAt, GSI2SK = :reversedTimestamp',
  ExpressionAttributeValues: { 
    ':updatedAt': newTimestamp,
    ':reversedTimestamp': reversedNewTimestamp
  }
}).promise();
```

#### Querying Conversations by Most Recent

To retrieve a user's conversations sorted by most recent activity:

```javascript
// Query for most recent conversations
const params = {
  TableName: DYNAMODB_TABLE_NAME,
  IndexName: "GSI2",
  KeyConditionExpression: 'GSI2PK = :userId',
  ExpressionAttributeValues: {
    ':userId': `USER#${userId}`
  },
  // No need for ScanIndexForward: false since we're using reversed timestamps
  Limit: 10 // Limit to most recent 10 conversations
};

const result = await dynamodb.query(params).promise();
```

This query efficiently retrieves the user's most recently active conversations without any additional filtering or sorting in the application code.

## Benefits of This Design

1. **Security**: Enforces user-specific data access at the data model level
2. **Performance**: Efficient queries with minimal filtering
3. **Scalability**: Distributes data across partition keys by user
4. **Flexibility**: Supports all required access patterns with minimal indexes
