const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// Initialize DynamoDB client
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

// Environment variables
const DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;

// Initialize S3 client
const s3 = new AWS.S3();

/**
 * Main handler for AppSync resolvers
 */
exports.handler = async (event) => {
  console.log('Event received:', JSON.stringify(event, null, 2));
  
  const { action, arguments: args, identity } = event;
  
  switch (action) {
    case 'getMessage':
      return getMessage(args.id, args.conversationId, identity);
    case 'getConversation':
      return getConversation(args.id, identity);
    case 'listConversations':
      return listConversations(identity);
    case 'listRecentConversations':
      return listRecentConversations(args.limit, identity);
    case 'getMessages':
      return getMessages(args.conversationId, identity);
    case 'sendMessage':
      return sendMessage(args.conversationId, args.content, identity);
    case 'createConversation':
      return createConversation(args.title, identity);
    case 'updateMessageContent':
      return updateMessageContent(args.messageId, args.conversationId, args.content, args.isComplete);
    case 'onNewMessage':
      // For subscription, just pass through the arguments
      // This is used by the subscription resolver
      return args;
    case 'onMessageUpdate':
      // For subscription, just pass through the arguments
      return args;
    
    // Document operations
    case 'listUserDocuments':
      return listUserDocuments(identity);
    case 'getDocument':
      return getDocument(args.id, identity);
    case 'getDocumentUploadUrl':
      return getDocumentUploadUrl(args.fileName, args.contentType, identity);
    case 'deleteUserDocument':
      return deleteUserDocument(args.id, identity);
    case 'askDocumentQuestion':
      return askDocumentQuestion(args.documentIds, args.question, identity);
    default:
      throw new Error(`Unsupported action: ${action}`);
  }
};

/**
 * Get a message by ID
 */
async function getMessage(id, conversationId, identity) {
  const userId = identity?.resolverContext?.userId || 'default-user';
  
  // First verify ownership
  const userConvParams = {
    TableName: DYNAMODB_TABLE_NAME,
    Key: { 
      PK: `USER#${userId}`,
      SK: `CONV#${conversationId}`
    }
  };
  
  const userConvResult = await dynamodb.get(userConvParams).promise();
  if (!userConvResult.Item) {
    console.warn(`User ${userId} attempted to access message ${id} in conversation ${conversationId} they don't own`);
    return null;
  }
  
  // Now get the message
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
async function getConversation(id, identity) {
  const userId = identity?.resolverContext?.userId || 'default-user';
  
  // First check if user owns the conversation
  const userConvParams = {
    TableName: DYNAMODB_TABLE_NAME,
    Key: { 
      PK: `USER#${userId}`,
      SK: `CONV#${id}`
    }
  };
  
  const userConvResult = await dynamodb.get(userConvParams).promise();
  if (!userConvResult.Item) {
    console.warn(`User ${userId} attempted to access conversation ${id} they don't own`);
    return null;
  }
  
  // If user owns the conversation, return it
  return {
    id: userConvResult.Item.id,
    userId: userConvResult.Item.userId,
    title: userConvResult.Item.title,
    createdAt: userConvResult.Item.createdAt,
    updatedAt: userConvResult.Item.updatedAt
  };
}

/**
 * List all conversations for a user
 */
async function listConversations(identity) {
  const userId = identity?.resolverContext?.userId || 'default-user';
  
  const params = {
    TableName: DYNAMODB_TABLE_NAME,
    KeyConditionExpression: 'PK = :userId',
    ExpressionAttributeValues: {
      ':userId': `USER#${userId}`
    }
  };
  
  const result = await dynamodb.query(params).promise();
  
  // Transform the items to match the expected schema
  return result.Items.map(item => ({
    id: item.id,
    userId: item.userId,
    title: item.title,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  }));
}

/**
 * List recent conversations for a user
 */
async function listRecentConversations(limit, identity) {
  // Extract user ID from identity with detailed logging
  // Note: identity is the direct identity object, not wrapped in a context object
  const userId = identity?.resolverContext?.userId || 'default-user';
  const contextSource = identity?.resolverContext ? 'resolver' : 'fallback';
  const maxLimit = limit && limit > 0 && limit <= 50 ? limit : 10;
  
  console.log('Listing recent conversations with identity:', { 
    userId,
    limit: maxLimit,
    contextSource,
    hasIdentity: !!identity,
    hasResolverContext: !!identity?.resolverContext,
    resolverContextKeys: identity?.resolverContext ? Object.keys(identity.resolverContext) : [],
    rawUserId: identity?.resolverContext?.userId
  });
  
  const params = {
    TableName: DYNAMODB_TABLE_NAME,
    IndexName: "GSI2",
    KeyConditionExpression: 'GSI2PK = :userId',
    ExpressionAttributeValues: {
      ':userId': `USER#${userId}`
    },
    Limit: maxLimit
  };
  
  console.log('DynamoDB query params:', {
    TableName: params.TableName,
    IndexName: params.IndexName,
    KeyConditionExpression: params.KeyConditionExpression,
    ExpressionAttributeValues: params.ExpressionAttributeValues,
    Limit: params.Limit
  });
  
  try {
    const result = await dynamodb.query(params).promise();
    
    console.log('Query result stats:', {
      count: result.Items.length,
      scannedCount: result.ScannedCount,
      lastEvaluatedKey: result.LastEvaluatedKey ? 'Present' : 'None'
    });
    
    if (result.Items.length === 0) {
      console.log('No conversations found for user:', userId);
    } else {
      console.log('Found conversations:', result.Items.map(item => ({
        id: item.id,
        title: item.title,
        updatedAt: item.updatedAt
      })));
    }
    
    // Transform the items to match the expected schema
    return result.Items.map(item => ({
      id: item.id,
      userId: item.userId,
      title: item.title,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    }));
  } catch (error) {
    console.error('Error listing recent conversations:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      statusCode: error.statusCode
    });
    throw error;
  }
}

/**
 * Get messages for a conversation
 */
async function getMessages(conversationId, identity) {
  const userId = identity?.resolverContext?.userId || 'default-user';
  
  // First verify ownership
  const userConvParams = {
    TableName: DYNAMODB_TABLE_NAME,
    Key: { 
      PK: `USER#${userId}`,
      SK: `CONV#${conversationId}`
    }
  };
  
  const userConvResult = await dynamodb.get(userConvParams).promise();
  if (!userConvResult.Item) {
    console.warn(`User ${userId} attempted to access messages for conversation ${conversationId} they don't own`);
    return []; // Return empty array for security
  }
  
  // Now get the messages
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
async function sendMessage(conversationId, content, identity) {
  const userId = identity?.resolverContext?.userId || 'default-user';
  
  // First verify ownership
  const userConvParams = {
    TableName: DYNAMODB_TABLE_NAME,
    Key: { 
      PK: `USER#${userId}`,
      SK: `CONV#${conversationId}`
    }
  };
  
  const userConvResult = await dynamodb.get(userConvParams).promise();
  if (!userConvResult.Item) {
    console.warn(`User ${userId} attempted to send message to conversation ${conversationId} they don't own`);
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
  
  // Update the user-conversation mapping with new timestamp for time-based sorting
  const reversedTimestamp = `${9999999999999 - Date.now()}`;
  
  await dynamodb.update({
    TableName: DYNAMODB_TABLE_NAME,
    Key: { 
      PK: `USER#${userId}`,
      SK: `CONV#${conversationId}`
    },
    UpdateExpression: 'SET updatedAt = :updatedAt, GSI2SK = :reversedTimestamp',
    ExpressionAttributeValues: {
      ':updatedAt': timestamp,
      ':reversedTimestamp': reversedTimestamp
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
async function createConversation(title, identity) {
  // Extract user ID from identity with detailed logging
  // Note: identity is the direct identity object, not wrapped in a context object
  const userId = identity?.resolverContext?.userId || 'default-user';
  const contextSource = identity?.resolverContext ? 'resolver' : 'fallback';
  
  console.log('Creating conversation with identity:', { 
    userId,
    title,
    contextSource,
    hasIdentity: !!identity,
    hasResolverContext: !!identity?.resolverContext,
    resolverContextKeys: identity?.resolverContext ? Object.keys(identity.resolverContext) : [],
    rawUserId: identity?.resolverContext?.userId
  });
  
  const timestamp = new Date().toISOString();
  const id = uuidv4();
  const reversedTimestamp = `${9999999999999 - Date.now()}`; // For descending order
  
  // Create user-conversation mapping
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
  
  // Create conversation metadata
  const conversationMetadataItem = {
    PK: `CONV#${id}`,
    SK: 'METADATA',
    id,
    userId,
    title: title || 'New Conversation',
    createdAt: timestamp,
    updatedAt: timestamp
  };
  
  console.log('Creating conversation items:', {
    userConversationItem: {
      PK: userConversationItem.PK,
      SK: userConversationItem.SK,
      GSI2PK: userConversationItem.GSI2PK,
      id: userConversationItem.id,
      userId: userConversationItem.userId
    },
    conversationMetadataItem: {
      PK: conversationMetadataItem.PK,
      SK: conversationMetadataItem.SK,
      id: conversationMetadataItem.id,
      userId: conversationMetadataItem.userId
    }
  });
  
  // Write both items in a transaction
  try {
    await dynamodb.transactWrite({
      TransactItems: [
        { Put: { TableName: DYNAMODB_TABLE_NAME, Item: userConversationItem } },
        { Put: { TableName: DYNAMODB_TABLE_NAME, Item: conversationMetadataItem } }
      ]
    }).promise();
    
    console.log('Successfully created conversation:', { id, userId });
  } catch (error) {
    console.error('Error creating conversation:', error);
    throw error;
  }
  
  // Transform to match the expected schema
  return {
    id,
    userId,
    title: title || 'New Conversation',
    createdAt: timestamp,
    updatedAt: timestamp
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

/**
 * List all documents for a user
 */
async function listUserDocuments(identity) {
  const userId = identity?.resolverContext?.userId || 'default-user';
  
  const params = {
    TableName: DYNAMODB_TABLE_NAME,
    KeyConditionExpression: 'PK = :userId AND begins_with(SK, :sk_prefix)',
    ExpressionAttributeValues: {
      ':userId': `USER#${userId}`,
      ':sk_prefix': 'DOC#'
    }
  };
  
  const result = await dynamodb.query(params).promise();
  
  // Transform the items to match the expected schema
  return result.Items.map(item => ({
    id: item.id,
    userId: item.userId,
    documentName: item.documentName,
    documentType: item.documentType,
    uploadTimestamp: item.uploadTimestamp,
    status: item.status,
    size: item.size,
    pageCount: item.pageCount || 0,
    ingestionJobId: item.ingestionJobId
  }));
}

/**
 * Get a document by ID
 */
async function getDocument(id, identity) {
  const userId = identity?.resolverContext?.userId || 'default-user';
  
  const params = {
    TableName: DYNAMODB_TABLE_NAME,
    Key: { 
      PK: `USER#${userId}`,
      SK: `DOC#${id}`
    }
  };
  
  const result = await dynamodb.get(params).promise();
  if (!result.Item) {
    console.warn(`User ${userId} attempted to access document ${id} they don't own`);
    return null;
  }
  
  // Transform the item to match the expected schema
  return {
    id: result.Item.id,
    userId: result.Item.userId,
    documentName: result.Item.documentName,
    documentType: result.Item.documentType,
    uploadTimestamp: result.Item.uploadTimestamp,
    status: result.Item.status,
    size: result.Item.size,
    pageCount: result.Item.pageCount || 0,
    ingestionJobId: result.Item.ingestionJobId
  };
}

/**
 * Generate a presigned URL for document upload
 */
async function getDocumentUploadUrl(fileName, contentType, identity) {
  const userId = identity?.resolverContext?.userId || 'default-user';
  const documentId = uuidv4();
  const timestamp = new Date().toISOString();
  
  // Create the S3 key with user isolation
  const key = `user-documents/${userId}/${documentId}/original${getFileExtension(fileName)}`;
  
  // Generate a presigned URL for direct upload
  const s3Params = {
    Bucket: process.env.USER_DOCUMENTS_BUCKET,
    Key: key,
    ContentType: contentType,
    Expires: 300 // URL expires in 5 minutes
  };
  
  const uploadUrl = await s3.getSignedUrlPromise('putObject', s3Params);
  
  // Create document metadata in DynamoDB
  const documentItem = {
    PK: `USER#${userId}`,
    SK: `DOC#${documentId}`,
    id: documentId,
    userId,
    documentName: fileName,
    documentType: contentType,
    s3Path: key,
    uploadTimestamp: timestamp,
    status: 'PROCESSING', // Initial status
    size: 0, // Will be updated after upload
    createdAt: timestamp,
    updatedAt: timestamp
  };
  
  await dynamodb.put({
    TableName: DYNAMODB_TABLE_NAME,
    Item: documentItem
  }).promise();
  
  return {
    uploadUrl,
    documentId
  };
}

/**
 * Delete a user document
 */
async function deleteUserDocument(id, identity) {
  const userId = identity?.resolverContext?.userId || 'default-user';
  
  // First verify ownership
  const params = {
    TableName: DYNAMODB_TABLE_NAME,
    Key: { 
      PK: `USER#${userId}`,
      SK: `DOC#${id}`
    }
  };
  
  const result = await dynamodb.get(params).promise();
  if (!result.Item) {
    console.warn(`User ${userId} attempted to delete document ${id} they don't own`);
    return false;
  }
  
  // Delete the document from S3
  if (result.Item.s3Path) {
    try {
      await s3.deleteObject({
        Bucket: process.env.USER_DOCUMENTS_BUCKET,
        Key: result.Item.s3Path
      }).promise();
    } catch (error) {
      console.error(`Error deleting document from S3: ${error}`);
      // Continue with DynamoDB deletion even if S3 deletion fails
    }
  }
  
  // Delete document metadata from DynamoDB
  await dynamodb.delete({
    TableName: DYNAMODB_TABLE_NAME,
    Key: { 
      PK: `USER#${userId}`,
      SK: `DOC#${id}`
    }
  }).promise();
  
  // Delete any document chunks
  try {
    const chunksParams = {
      TableName: DYNAMODB_TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk_prefix)',
      ExpressionAttributeValues: {
        ':pk': `DOC#${id}`,
        ':sk_prefix': 'CHUNK#'
      }
    };
    
    const chunksResult = await dynamodb.query(chunksParams).promise();
    
    // Delete chunks in batches of 25 (DynamoDB batch limit)
    const chunkBatches = [];
    for (let i = 0; i < chunksResult.Items.length; i += 25) {
      const batch = chunksResult.Items.slice(i, i + 25);
      chunkBatches.push(batch);
    }
    
    for (const batch of chunkBatches) {
      const deleteRequests = batch.map(chunk => ({
        DeleteRequest: {
          Key: {
            PK: `DOC#${id}`,
            SK: chunk.SK
          }
        }
      }));
      
      await dynamodb.batchWrite({
        RequestItems: {
          [DYNAMODB_TABLE_NAME]: deleteRequests
        }
      }).promise();
    }
  } catch (error) {
    console.error(`Error deleting document chunks: ${error}`);
    // Continue even if chunk deletion fails
  }
  
  return true;
}

/**
 * Ask a question about specific documents
 */
async function askDocumentQuestion(documentIds, question, identity) {
  const userId = identity?.resolverContext?.userId || 'default-user';
  
  // Verify document ownership for all documentIds
  for (const documentId of documentIds) {
    const userDocParams = {
      TableName: DYNAMODB_TABLE_NAME,
      Key: { 
        PK: `USER#${userId}`,
        SK: `DOC#${documentId}`
      }
    };
    
    const userDocResult = await dynamodb.get(userDocParams).promise();
    if (!userDocResult.Item) {
      console.warn(`User ${userId} attempted to access document ${documentId} they don't own`);
      throw new Error(`Document with ID ${documentId} not found`);
    }
  }
  
  // Create a new conversation for this document question
  const conversationTitle = documentIds.length === 1 
    ? `Question about ${documentIds[0]}` 
    : `Question about ${documentIds.length} documents`;
  
  const conversation = await createConversation(conversationTitle, identity);
  
  // Send the question as a message in the new conversation
  const message = await sendMessage(conversation.id, question, identity);
  
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
        }
      } catch (ssmError) {
        console.error('Error getting API key from SSM:', ssmError);
      }
    }
  } catch (error) {
    console.error('Error getting AppSync details:', error);
  }
  
  // Invoke the streaming handler with document context
  const streamingParams = {
    FunctionName: process.env.STREAMING_HANDLER_FUNCTION,
    InvocationType: 'Event',
    Payload: JSON.stringify({
      messageId: message.assistantMessage.id,
      conversationId: conversation.id,
      messages: [{ role: 'user', content: question }],
      documentIds: documentIds, // Pass document IDs for context
      userId: userId, // Pass user ID for security filtering
      appsyncEndpoint,
      appsyncApiKey
    })
  };
  
  try {
    await lambda.invoke(streamingParams).promise();
    console.log('Streaming handler invoked successfully with document context');
  } catch (error) {
    console.error('Error invoking streaming handler:', error);
    
    // Update the message to indicate an error
    await updateMessageContent(
      message.assistantMessage.id, 
      conversation.id, 
      "Sorry, I encountered an error while generating a response. Please try again.", 
      true
    );
  }
  
  // Return the user message
  return {
    id: message.userMessage.id,
    conversationId: message.userMessage.conversationId,
    content: message.userMessage.content,
    role: message.userMessage.role,
    timestamp: message.userMessage.timestamp
  };
}

/**
 * Helper function to get file extension from filename
 */
function getFileExtension(fileName) {
  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return ''; // No extension
  }
  return fileName.substring(lastDotIndex);
}
