const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// Initialize DynamoDB client
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

// Environment variables
const DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;
const BEDROCK_CLIENT_FUNCTION = process.env.BEDROCK_CLIENT_FUNCTION;

/**
 * Main handler for AppSync resolvers
 */
exports.handler = async (event) => {
  console.log('Event received:', JSON.stringify(event, null, 2));
  
  const { action, arguments: args } = event;
  
  switch (action) {
    case 'getMessage':
      return getMessage(args.id, args.conversationId);
    case 'getConversation':
      return getConversation(args.id);
    case 'listConversations':
      return listConversations();
    case 'getMessages':
      return getMessages(args.conversationId);
    case 'sendMessage':
      return sendMessage(args.conversationId, args.content);
    case 'createConversation':
      return createConversation(args.title);
    case 'updateMessageContent':
      return updateMessageContent(args.messageId, args.conversationId, args.content, args.isComplete);
    case 'onNewMessage':
      // For subscription, just pass through the arguments
      // This is used by the subscription resolver
      return args;
    case 'onMessageUpdate':
      // For subscription, just pass through the arguments
      return args;
    default:
      throw new Error(`Unsupported action: ${action}`);
  }
};

/**
 * Get a message by ID
 */
async function getMessage(id, conversationId) {
  const params = {
    TableName: DYNAMODB_TABLE_NAME,
    Key: { 
      PK: `CONV#${conversationId}`,
      SK: `MSG#${id}`
    }
  };
  
  const result = await dynamodb.get(params).promise();
  if (!result.Item) return null;
  
  // Transform the item to match the expected schema
  return {
    id: result.Item.id,
    conversationId: result.Item.conversationId,
    content: result.Item.content,
    role: result.Item.role,
    timestamp: result.Item.timestamp,
    isComplete: result.Item.isComplete
  };
}

/**
 * Get a conversation by ID
 */
async function getConversation(id) {
  const params = {
    TableName: DYNAMODB_TABLE_NAME,
    Key: { 
      PK: `CONV#${id}`,
      SK: 'METADATA'
    }
  };
  
  const result = await dynamodb.get(params).promise();
  if (!result.Item) return null;
  
  // Transform the item to match the expected schema
  return {
    id: result.Item.id,
    title: result.Item.title,
    createdAt: result.Item.createdAt,
    updatedAt: result.Item.updatedAt
  };
}

/**
 * List all conversations
 */
async function listConversations() {
  const params = {
    TableName: DYNAMODB_TABLE_NAME,
    IndexName: "SK-PK-index",
    KeyConditionExpression: 'SK = :metadata',
    ExpressionAttributeValues: {
      ':metadata': 'METADATA'
    }
  };
  
  const result = await dynamodb.query(params).promise();
  
  // Transform the items to match the expected schema
  return result.Items.map(item => ({
    id: item.id,
    title: item.title,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  }));
}

/**
 * Get messages for a conversation
 */
async function getMessages(conversationId) {
  const params = {
    TableName: DYNAMODB_TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk_prefix)',
    ExpressionAttributeValues: {
      ':pk': `CONV#${conversationId}`,
      ':sk_prefix': 'MSG#'
    }
  };
  
  const result = await dynamodb.query(params).promise();
  
  // Transform the items to match the expected schema
  return result.Items.map(item => ({
    id: item.id,
    conversationId: item.conversationId,
    content: item.content,
    role: item.role,
    timestamp: item.timestamp,
    isComplete: item.isComplete
  }));
}

/**
 * Send a message in a conversation
 */
async function sendMessage(conversationId, content) {
  // First, check if the conversation exists
  const conversationParams = {
    TableName: DYNAMODB_TABLE_NAME,
    Key: { 
      PK: `CONV#${conversationId}`,
      SK: 'METADATA'
    }
  };
  
  const conversationResult = await dynamodb.get(conversationParams).promise();
  if (!conversationResult.Item) {
    throw new Error(`Conversation with ID ${conversationId} not found`);
  }
  
  // Create a user message
  const timestamp = new Date().toISOString();
  const userMessageId = uuidv4();
  
  const userMessage = {
    PK: `CONV#${conversationId}`,
    SK: `MSG#${userMessageId}`,
    GSI1PK: `MSG#${userMessageId}`,
    GSI1SK: timestamp,
    id: userMessageId,
    conversationId,
    content,
    role: 'user',
    timestamp
  };
  
  // Save the user message
  await dynamodb.put({
    TableName: DYNAMODB_TABLE_NAME,
    Item: userMessage
  }).promise();
  
  // Update the conversation's updatedAt timestamp
  await dynamodb.update({
    TableName: DYNAMODB_TABLE_NAME,
    Key: { 
      PK: `CONV#${conversationId}`,
      SK: 'METADATA'
    },
    UpdateExpression: 'SET updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':updatedAt': timestamp
    }
  }).promise();
  
  // Get conversation history for context
  const historyParams = {
    TableName: DYNAMODB_TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk_prefix)',
    ExpressionAttributeValues: {
      ':pk': `CONV#${conversationId}`,
      ':sk_prefix': 'MSG#'
    },
    Limit: 10 // Limit to recent messages for context
  };
  
  const historyResult = await dynamodb.query(historyParams).promise();
  console.log('Raw history result:', JSON.stringify(historyResult.Items, null, 2));
  
  // Sort messages by timestamp (oldest first)
  const sortedMessages = historyResult.Items.sort((a, b) => {
    return new Date(a.timestamp) - new Date(b.timestamp);
  });
  console.log('Sorted messages by timestamp:', JSON.stringify(sortedMessages, null, 2));
  
  // Map messages to include only role and content
  const mappedMessages = sortedMessages.map(msg => ({
    role: msg.role,
    content: msg.content
  }));
  
  // Filter to ensure the conversation starts with a user message
  // and maintains proper alternating roles
  const filteredHistory = [];
  let lastRole = null;
  
  // Find the first user message to start with
  const firstUserIndex = mappedMessages.findIndex(msg => msg.role === 'user');
  if (firstUserIndex >= 0) {
    // Start with the first user message
    filteredHistory.push(mappedMessages[firstUserIndex]);
    lastRole = 'user';
    
    // Process remaining messages in chronological order
    for (let i = firstUserIndex + 1; i < mappedMessages.length; i++) {
      const currentMsg = mappedMessages[i];
      if (currentMsg.role !== lastRole) {
        filteredHistory.push(currentMsg);
        lastRole = currentMsg.role;
      } else {
        // If same role as previous, replace the last message with this one
        // This keeps only the most recent message from consecutive messages of the same role
        console.log(`Found consecutive ${currentMsg.role} messages, keeping only the most recent one`);
        filteredHistory[filteredHistory.length - 1] = currentMsg;
      }
    }
  }
  
  // Create the conversation history
  const conversationHistory = [...filteredHistory];
  
  // Ensure we have the current user message at the end
  if (conversationHistory.length === 0) {
    // If no messages, add the current user message
    conversationHistory.push({
      role: 'user',
      content
    });
  } else if (conversationHistory[conversationHistory.length - 1].role === 'user') {
    console.log('Last message in filtered history is already from user, replacing with new message');
    // Replace the last user message with the new one
    conversationHistory[conversationHistory.length - 1] = {
      role: 'user',
      content
    };
  } else {
    // Add the new user message
    conversationHistory.push({
      role: 'user',
      content
    });
  }
  
  // Final safety check: ensure the first message is from a user
  if (conversationHistory.length > 0 && conversationHistory[0].role !== 'user') {
    console.log('First message is not from a user, removing non-user messages from the beginning');
    // Remove messages until we find a user message
    while (conversationHistory.length > 0 && conversationHistory[0].role !== 'user') {
      conversationHistory.shift();
    }
    
    // If we removed all messages, add the current user message
    if (conversationHistory.length === 0) {
      conversationHistory.push({
        role: 'user',
        content
      });
    }
  }
  
  // Log the final conversation history
  console.log('Prepared conversation history:', JSON.stringify(conversationHistory, null, 2));
  
  // Log the roles sequence to easily spot consecutive user messages
  const rolesSequence = conversationHistory.map(msg => msg.role).join(', ');
  console.log('Roles sequence:', rolesSequence);
  
  // Create an initial empty assistant message
  const assistantMessageId = uuidv4();
  const assistantTimestamp = new Date().toISOString();
  const assistantMessage = {
    PK: `CONV#${conversationId}`,
    SK: `MSG#${assistantMessageId}`,
    GSI1PK: `MSG#${assistantMessageId}`,
    GSI1SK: assistantTimestamp,
    id: assistantMessageId,
    conversationId,
    content: "...", // Initial placeholder
    role: 'assistant',
    timestamp: assistantTimestamp,
    isComplete: false
  };
  
  // Save the initial assistant message
  await dynamodb.put({
    TableName: DYNAMODB_TABLE_NAME,
    Item: assistantMessage
  }).promise();
  
  // Get AppSync details
  const appSync = new AWS.AppSync();
  const ssm = new AWS.SSM();
  let appsyncEndpoint = '';
  let appsyncApiKey = '';
  
  try {
    // List GraphQL APIs to find the one for this project
    const apis = await appSync.listGraphqlApis().promise();
    const api = apis.graphqlApis.find(api => api.name.includes(process.env.PROJECT_NAME || 'chatbot'));
    
    if (api) {
      appsyncEndpoint = api.uris.GRAPHQL;
      
      // Get API key from SSM Parameter Store
      try {
        const parameterName = `/${process.env.PROJECT_NAME}/appsync/api-key`;
        const parameter = await ssm.getParameter({
          Name: parameterName,
          WithDecryption: true
        }).promise();
        
        if (parameter && parameter.Parameter && parameter.Parameter.Value) {
          appsyncApiKey = parameter.Parameter.Value;
        } else {
          console.warn('API key not found in SSM Parameter Store');
          appsyncApiKey = 'API_KEY_NOT_AVAILABLE';
        }
      } catch (ssmError) {
        console.error('Error getting API key from SSM:', ssmError);
        appsyncApiKey = 'API_KEY_NOT_AVAILABLE';
      }
    }
  } catch (error) {
    console.error('Error getting AppSync details:', error);
    // Continue without AppSync details
  }
  
  // Invoke the streaming handler asynchronously
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
  
  try {
    await lambda.invoke(streamingParams).promise();
    console.log('Streaming handler invoked successfully');
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
  
  // Return both messages so the resolver can handle them appropriately
  // Transform to match the expected schema
  return {
    userMessage: {
      id: userMessage.id,
      conversationId: userMessage.conversationId,
      content: userMessage.content,
      role: userMessage.role,
      timestamp: userMessage.timestamp
    },
    assistantMessage: {
      id: assistantMessage.id,
      conversationId: assistantMessage.conversationId,
      content: assistantMessage.content,
      role: assistantMessage.role,
      timestamp: assistantMessage.timestamp,
      isComplete: assistantMessage.isComplete
    }
  };
}

/**
 * Create a new conversation
 */
async function createConversation(title) {
  const timestamp = new Date().toISOString();
  const id = uuidv4();
  
  const conversation = {
    PK: `CONV#${id}`,
    SK: 'METADATA',
    id,
    title: title || 'New Conversation',
    createdAt: timestamp,
    updatedAt: timestamp
  };
  
  await dynamodb.put({
    TableName: DYNAMODB_TABLE_NAME,
    Item: conversation
  }).promise();
  
  // Transform to match the expected schema
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt
  };
}

/**
 * Update message content for streaming responses
 */
async function updateMessageContent(messageId, conversationId, content, isComplete) {
  const timestamp = new Date().toISOString();
  
  // Update the message in DynamoDB
  await dynamodb.update({
    TableName: DYNAMODB_TABLE_NAME,
    Key: { 
      PK: `CONV#${conversationId}`,
      SK: `MSG#${messageId}`
    },
    UpdateExpression: 'SET content = :content, isComplete = :isComplete',
    ExpressionAttributeValues: {
      ':content': content,
      ':isComplete': isComplete
    }
  }).promise();
  
  // Return the update information for the subscription
  return {
    messageId,
    conversationId,
    content,
    isComplete,
    timestamp
  };
}
