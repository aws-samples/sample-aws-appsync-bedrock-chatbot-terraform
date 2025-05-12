# Simple Serverless AWS GenAI Chatbot Implementation Guide

This document provides a detailed explanation of how this simple serverless architecture is implemented, with code examples showing each component's implementation and how data flows between them.

## Numbered Flow Diagram

![GenAI Chatbot Numbered Flow](generated-diagrams/genai-chatbot-numbered-flow.png)

## Implementation Details

### 1. Client → AppSync: Send Message

User enters a message in the frontend application, which sends a GraphQL mutation to AppSync:

```javascript
// In frontend code (frontend/src/components/ChatInterface.js)
client.mutate({ 
  mutation: SEND_MESSAGE, 
  variables: { conversationId, content } 
});
```

This initiates the conversation flow with the AI assistant. The frontend uses Apollo Client to handle GraphQL operations and manages the local state of messages.

### 2. AppSync → Message Handler: Invoke

AppSync invokes the Message Handler Lambda function as a resolver:

```javascript
// In AppSync resolver configuration (terraform/modules/appsync/main.tf)
request_template = <<EOF
{
  "version": "2018-05-29",
  "operation": "Invoke",
  "payload": {
    "action": "sendMessage",
    "arguments": $util.toJson($context.arguments)
  }
}
EOF
```

The Lambda function is triggered synchronously, with AppSync waiting for a response. The resolver passes the user's message content and conversation ID to the Lambda function.

### 3. Message Handler → DynamoDB: Store Messages

Message Handler stores the user's message in DynamoDB and creates a new empty assistant message:

```javascript
// Store user message (src/functions/message-handler/index.js)
await dynamodb.put({
  TableName: DYNAMODB_TABLE_NAME,
  Item: userMessage
}).promise();

// Create empty assistant message
await dynamodb.put({
  TableName: DYNAMODB_TABLE_NAME,
  Item: assistantMessage
}).promise();
```

Both messages are stored using the single-table design pattern. The user message is stored with `role: 'user'` and the assistant message with `role: 'assistant'` and `isComplete: false`. The empty assistant message serves as a placeholder that will be updated incrementally during streaming.

### 4. Message Handler → Streaming Handler: Invoke Async

Message Handler asynchronously invokes the Streaming Handler Lambda:

```javascript
// In message-handler/index.js
const streamingParams = {
  FunctionName: process.env.STREAMING_HANDLER_FUNCTION,
  InvocationType: 'Event', // Asynchronous invocation
  Payload: JSON.stringify({
    messageId: assistantMessageId,
    conversationId,
    messages: conversationHistory,
    appsyncEndpoint,
    appsyncApiKey
  })
};

await lambda.invoke(streamingParams).promise();
```

The asynchronous invocation allows the Message Handler to return immediately without waiting for the AI response. It passes the message ID, conversation ID, conversation history, and AppSync details to the Streaming Handler.

### 5. Streaming Handler → Bedrock: Stream Request

Streaming Handler formats the conversation history for the Bedrock model and invokes it with streaming enabled:

```javascript
// In streaming-handler/index.js
const response = await bedrockClient.send(new InvokeModelWithResponseStreamCommand({
  modelId: BEDROCK_MODEL_ID,
  contentType: 'application/json',
  accept: 'application/json',
  body: JSON.stringify(requestBody)
}));
```

The Streaming Handler uses the AWS SDK v3 for Bedrock, specifically the `InvokeModelWithResponseStreamCommand` to initiate a streaming connection. This sets up the parameters and model configuration needed to receive chunks of the response as they're generated.

### 6a. Bedrock → Streaming Handler: Stream Response

Bedrock generates the AI response and streams it back in chunks:

```javascript
// In streaming-handler/index.js
for await (const chunk of response.body) {
  // Process streaming chunks
  if (chunk.chunk && chunk.chunk.bytes) {
    const chunkData = Buffer.from(chunk.chunk.bytes).toString('utf-8');
    try {
      const parsedData = JSON.parse(chunkData);
      
      // Check for content in the parsed data
      if (parsedData.type === 'content_block_delta' || parsedData.type === 'content_block_start') {
        if (parsedData.delta && parsedData.delta.text) {
          const tokenText = parsedData.delta.text;
          accumulatedContent += tokenText;
          
          // Update DynamoDB and AppSync with each chunk
          // ...
        }
      }
    } catch (parseError) {
      console.error('Error parsing chunk data:', parseError);
    }
  }
}
```

The Streaming Handler processes each chunk as it arrives, parsing the JSON data to extract the text content. It accumulates the content incrementally, building up the complete response over time.

### 6b. Streaming Handler → DynamoDB: Update Message

For each chunk received, Streaming Handler updates the assistant message in DynamoDB:

```javascript
// In streaming-handler/index.js
await updateMessageInDynamoDB(messageId, accumulatedContent, false, conversationId);

// Function implementation
async function updateMessageInDynamoDB(messageId, content, isComplete, conversationId) {
  await ddbDocClient.send(new UpdateCommand({
    TableName: DYNAMODB_TABLE_NAME,
    Key: { PK: `CONV#${conversationId}`, SK: `MSG#${messageId}` },
    UpdateExpression: 'SET content = :content, isComplete = :isComplete',
    ExpressionAttributeValues: { ':content': content, ':isComplete': isComplete }
  }));
}
```

The Streaming Handler incrementally appends the new content to the existing message and maintains the `isComplete: false` flag until streaming is complete. This creates a progressive record of the response as it's being generated.

### 7. Streaming Handler → AppSync: Publish Updates

For each chunk processed, Streaming Handler publishes an update to AppSync:

```javascript
// In streaming-handler/index.js
await publishToAppSync(messageId, conversationId, accumulatedContent, false, APPSYNC_ENDPOINT, APPSYNC_API_KEY);

// Function implementation uses HTTPS to call AppSync GraphQL endpoint
const mutation = `
  mutation UpdateMessageContent($messageId: ID!, $conversationId: ID!, $content: String!, $isComplete: Boolean!) {
    updateMessageContent(messageId: $messageId, conversationId: $conversationId, content: $content, isComplete: $isComplete) {
      messageId
      conversationId
      content
      isComplete
      timestamp
    }
  }
`;
```

The Streaming Handler uses a GraphQL mutation to publish the current state of the message, including the message ID, conversation ID, current content, and completion status. This triggers the subscription that delivers updates to the client.

### 8. AppSync → Client: Stream Response

AppSync pushes updates to subscribed clients via WebSockets:

```javascript
// In frontend/src/components/ChatInterface.js
const { data: messageUpdateData } = useSubscription(ON_MESSAGE_UPDATE, {
  variables: { conversationId: conversation.id },
  onSubscriptionData: ({ subscriptionData }) => {
    const update = subscriptionData.data.onMessageUpdate;
    // Update UI with streaming content
    setMessages(prevMessages => {
      // Find and update the message in the local state
      return prevMessages.map(msg => {
        if (msg.id === update.messageId) {
          return { ...msg, content: update.content, isComplete: update.isComplete };
        }
        return msg;
      });
    });
  }
});
```

The client receives incremental updates through the `onMessageUpdate` subscription and renders the streaming response in real-time as words appear. When streaming completes (`isComplete: true`), the frontend finalizes the message display.

## Completion Flow

When the streaming response is complete, the Streaming Handler marks the message as complete:

```javascript
// Mark as complete when done
await updateMessageInDynamoDB(messageId, accumulatedContent, true, conversationId);
await publishToAppSync(messageId, conversationId, accumulatedContent, true, APPSYNC_ENDPOINT, APPSYNC_API_KEY);
```

This final update sets `isComplete: true`, signaling to the frontend that the response is complete and no more updates will be coming for this message.

## Error Handling

The system includes robust error handling at each step:

1. **Message Handler**: If there's an error invoking the Streaming Handler, it updates the assistant message with an error message:

```javascript
try {
  await lambda.invoke(streamingParams).promise();
} catch (error) {
  console.error('Error invoking streaming handler:', error);
  
  // Update the message to indicate an error
  await updateMessageContent(
    assistantMessageId, 
    conversationId, 
    "Sorry, I encountered an error while generating a response. Please try again.", 
    true
  );
}
```

2. **Streaming Handler**: If there's an error processing the stream, it marks the message as complete with an error indicator:

```javascript
try {
  // Process streaming response
} catch (error) {
  console.error('Error processing stream:', error);
  
  // Mark as complete with error
  const errorMessage = accumulatedContent + "\n\n[Error: Processing interrupted]";
  await updateMessageInDynamoDB(messageId, errorMessage, true, conversationId);
  await publishToAppSync(messageId, conversationId, errorMessage, true, APPSYNC_ENDPOINT, APPSYNC_API_KEY);
}
```

3. **Frontend**: The frontend handles various error states, including network errors and timeouts:

```javascript
// Error handling in subscription
onError: (error) => {
  console.error('Subscription error:', error);
  setError('Error receiving updates. Please refresh the page.');
}
```

This comprehensive error handling ensures a robust user experience even when issues occur.
