const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// Initialize DynamoDB client
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

// Environment variables
const MESSAGES_TABLE_NAME = process.env.MESSAGES_TABLE_NAME;
const CONVERSATIONS_TABLE_NAME = process.env.CONVERSATIONS_TABLE_NAME;
const BEDROCK_CLIENT_FUNCTION = process.env.BEDROCK_CLIENT_FUNCTION;

/**
 * Main handler for AppSync resolvers
 */
exports.handler = async (event) => {
  console.log('Event received:', JSON.stringify(event, null, 2));
  
  const { action, arguments: args } = event;
  
  switch (action) {
    case 'getMessage':
      return getMessage(args.id);
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
    default:
      throw new Error(`Unsupported action: ${action}`);
  }
};

/**
 * Get a message by ID
 */
async function getMessage(id) {
  const params = {
    TableName: MESSAGES_TABLE_NAME,
    Key: { id }
  };
  
  const result = await dynamodb.get(params).promise();
  return result.Item;
}

/**
 * Get a conversation by ID
 */
async function getConversation(id) {
  const params = {
    TableName: CONVERSATIONS_TABLE_NAME,
    Key: { id }
  };
  
  const result = await dynamodb.get(params).promise();
  return result.Item;
}

/**
 * List all conversations
 */
async function listConversations() {
  const params = {
    TableName: CONVERSATIONS_TABLE_NAME
  };
  
  const result = await dynamodb.scan(params).promise();
  return result.Items;
}

/**
 * Get messages for a conversation
 */
async function getMessages(conversationId) {
  const params = {
    TableName: MESSAGES_TABLE_NAME,
    IndexName: 'ConversationIndex',
    KeyConditionExpression: 'conversationId = :conversationId',
    ExpressionAttributeValues: {
      ':conversationId': conversationId
    }
  };
  
  const result = await dynamodb.query(params).promise();
  return result.Items;
}

/**
 * Send a message in a conversation
 */
async function sendMessage(conversationId, content) {
  // First, check if the conversation exists
  const conversationParams = {
    TableName: CONVERSATIONS_TABLE_NAME,
    Key: { id: conversationId }
  };
  
  const conversationResult = await dynamodb.get(conversationParams).promise();
  if (!conversationResult.Item) {
    throw new Error(`Conversation with ID ${conversationId} not found`);
  }
  
  // Create a user message
  const timestamp = new Date().toISOString();
  const userMessageId = uuidv4();
  
  const userMessage = {
    id: userMessageId,
    conversationId,
    content,
    role: 'user',
    timestamp
  };
  
  // Save the user message
  await dynamodb.put({
    TableName: MESSAGES_TABLE_NAME,
    Item: userMessage
  }).promise();
  
  // Update the conversation's updatedAt timestamp
  await dynamodb.update({
    TableName: CONVERSATIONS_TABLE_NAME,
    Key: { id: conversationId },
    UpdateExpression: 'SET updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':updatedAt': timestamp
    }
  }).promise();
  
  // Get conversation history for context
  const historyParams = {
    TableName: MESSAGES_TABLE_NAME,
    IndexName: 'ConversationIndex',
    KeyConditionExpression: 'conversationId = :conversationId',
    ExpressionAttributeValues: {
      ':conversationId': conversationId
    },
    Limit: 10, // Limit to recent messages for context
    ScanIndexForward: false // Get most recent messages first
  };
  
  const historyResult = await dynamodb.query(historyParams).promise();
  console.log('Raw history result:', JSON.stringify(historyResult.Items, null, 2));
  
  const recentMessages = historyResult.Items.reverse(); // Reverse to get chronological order
  console.log('Reversed recent messages:', JSON.stringify(recentMessages, null, 2));
  
  // Map messages to include only role and content
  const mappedMessages = recentMessages.map(msg => ({
    role: msg.role,
    content: msg.content
  }));
  
  // Filter conversation history to ensure alternating roles
  // This will keep only the most recent message when consecutive messages have the same role
  const filteredHistory = [];
  let lastRole = null;
  
  // Process existing messages from history
  for (let i = 0; i < mappedMessages.length; i++) {
    const currentMsg = mappedMessages[i];
    
    // If this message has a different role than the last one we kept, add it
    // Or if this is the first message, add it
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
  
  // Now add the new user message, ensuring we don't add it if the last message is already from a user
  const conversationHistory = [...filteredHistory];
  
  if (conversationHistory.length > 0 && conversationHistory[conversationHistory.length - 1].role === 'user') {
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
  
  // Log the final conversation history
  console.log('Prepared conversation history:', JSON.stringify(conversationHistory, null, 2));
  
  // Log the roles sequence to easily spot consecutive user messages
  const rolesSequence = conversationHistory.map(msg => msg.role).join(', ');
  console.log('Roles sequence:', rolesSequence);
  
  // Call Bedrock client Lambda to generate a response
  const bedrockParams = {
    FunctionName: BEDROCK_CLIENT_FUNCTION,
    Payload: JSON.stringify({
      messages: conversationHistory
    })
  };
  
  const bedrockResponse = await lambda.invoke(bedrockParams).promise();
  const bedrockResult = JSON.parse(bedrockResponse.Payload);
  
  if (bedrockResult.error) {
    console.error('Error from Bedrock client:', bedrockResult.error);
    throw new Error(`Failed to generate response: ${bedrockResult.error}`);
  }
  
  // Create an assistant message with the response
  const assistantMessageId = uuidv4();
  const assistantMessage = {
    id: assistantMessageId,
    conversationId,
    content: bedrockResult.response,
    role: 'assistant',
    timestamp: new Date().toISOString()
  };
  
  // Save the assistant message
  await dynamodb.put({
    TableName: MESSAGES_TABLE_NAME,
    Item: assistantMessage
  }).promise();
  
  // Return the user message (the assistant message will be delivered via subscription)
  return userMessage;
}

/**
 * Create a new conversation
 */
async function createConversation(title) {
  const timestamp = new Date().toISOString();
  const conversation = {
    id: uuidv4(),
    title: title || 'New Conversation',
    createdAt: timestamp,
    updatedAt: timestamp
  };
  
  await dynamodb.put({
    TableName: CONVERSATIONS_TABLE_NAME,
    Item: conversation
  }).promise();
  
  return conversation;
}
