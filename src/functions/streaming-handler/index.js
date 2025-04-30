// Import AWS SDK v3 modules
const { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } = require('@aws-sdk/client-bedrock-runtime');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { AppSyncClient } = require('@aws-sdk/client-appsync');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const { PassThrough } = require('stream');
const https = require('https');

// Initialize AWS clients
const region = process.env.AWS_REGION || 'us-east-1';
const bedrockClient = new BedrockRuntimeClient({ region });
const dynamoClient = new DynamoDBClient({ region });
const ddbDocClient = DynamoDBDocumentClient.from(dynamoClient);
const appsyncClient = new AppSyncClient({ region });
const ssmClient = new SSMClient({ region });

// Environment variables
const MESSAGES_TABLE_NAME = process.env.MESSAGES_TABLE_NAME;
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';

/**
 * Main handler for streaming responses from Bedrock
 */
exports.handler = async (event) => {
  console.log('Event received:', JSON.stringify(event, null, 2));
  
  try {
    const { messageId, conversationId, messages, appsyncEndpoint, appsyncApiKey } = event;
    
    if (!messageId || !conversationId || !messages || !Array.isArray(messages)) {
      return {
        error: 'Invalid input: messageId, conversationId, and messages array are required'
      };
    }
    
    // Store AppSync details for later use
    const APPSYNC_ENDPOINT = appsyncEndpoint;
    const APPSYNC_API_KEY = appsyncApiKey;
    
    if (!APPSYNC_ENDPOINT || !APPSYNC_API_KEY) {
      console.warn('AppSync endpoint or API key not provided. Will not be able to publish updates.');
    }
    
    // Format messages for Claude model
    const formattedMessages = messages.map(msg => {
      const role = msg.role === 'user' ? 'user' : 'assistant';
      return {
        role,
        content: [
          {
            type: "text",
            text: msg.content
          }
        ]
      };
    });
    
    // Prepare the request body for streaming
    const requestBody = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1000,
      messages: formattedMessages
      // Streaming is controlled by InvokeModelWithResponseStreamCommand, not a parameter
    };
    
    // Log available methods on the bedrock client
    console.log('Available Bedrock methods:', Object.getOwnPropertyNames(BedrockRuntimeClient.prototype));
    
    // Log the request parameters to Bedrock
    console.log('Bedrock request parameters:', {
      modelId: BEDROCK_MODEL_ID,
      requestBodyLength: JSON.stringify(requestBody).length,
      messages: formattedMessages.map(m => ({ role: m.role, contentLength: m.content[0].text.length }))
    });
    
    // Invoke Bedrock model with streaming using AWS SDK v3
    const response = await bedrockClient.send(new InvokeModelWithResponseStreamCommand({
      modelId: BEDROCK_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody)
    }));
    
    // Log response structure
    console.log('Response structure:', Object.keys(response));
    console.log('Response body type:', typeof response.body);
    if (response.body) {
      console.log('Response body methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(response.body)));
    }
    
    // Process the streaming response using async iteration
    let accumulatedContent = "";
    
    // Add a global unhandled promise rejection handler
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
    
    try {
      console.log('Starting async iteration over response.body');
      
      // Process the streaming response using async iteration
      for await (const chunk of response.body) {
        try {
          // Enhanced logging for chunk structure
          console.log('Chunk received:', chunk);
          console.log('Chunk type:', typeof chunk);
          console.log('Chunk keys:', Object.keys(chunk));
          
          // Extract bytes from the chunk
          if (chunk.chunk && chunk.chunk.bytes) {
            const chunkData = Buffer.from(chunk.chunk.bytes).toString('utf-8');
            console.log('Chunk data:', chunkData);
            
            try {
              const parsedData = JSON.parse(chunkData);
              console.log('Parsed data:', parsedData);
              
              // Check for content in the parsed data
              if (parsedData.type === 'content_block_delta' || parsedData.type === 'content_block_start') {
                if (parsedData.delta && parsedData.delta.text) {
                  const tokenText = parsedData.delta.text;
                  console.log('Extracted token text from delta:', tokenText);
                  accumulatedContent += tokenText;
                  
                  // Update DynamoDB and AppSync
                  await updateMessageInDynamoDB(messageId, accumulatedContent, false, conversationId);
                  await publishToAppSync(messageId, conversationId, accumulatedContent, false, APPSYNC_ENDPOINT, APPSYNC_API_KEY);
                }
              } else if (parsedData.content && parsedData.content[0] && parsedData.content[0].text) {
                const tokenText = parsedData.content[0].text;
                console.log('Extracted token text from content:', tokenText);
                accumulatedContent += tokenText;
                
                // Update DynamoDB with the latest content
                try {
                  await updateMessageInDynamoDB(messageId, accumulatedContent, false, conversationId);
                } catch (dbError) {
                  console.error('Error updating DynamoDB:', dbError);
                }
                
                // Publish update to AppSync
                try {
                  await publishToAppSync(messageId, conversationId, accumulatedContent, false, APPSYNC_ENDPOINT, APPSYNC_API_KEY);
                } catch (appsyncError) {
                  console.error('Error publishing to AppSync:', appsyncError);
                }
              }
            } catch (parseError) {
              console.error('Error parsing chunk data:', parseError);
              console.log('Raw chunk data:', chunkData);
            }
          } else {
            console.log('No bytes found in chunk');
            
            // Try to extract content directly from the chunk
            if (chunk.content) {
              console.log('Found content directly in chunk:', chunk.content);
              
              let tokenText = null;
              if (Array.isArray(chunk.content) && chunk.content[0] && chunk.content[0].text) {
                tokenText = chunk.content[0].text;
              } else if (chunk.content.text) {
                tokenText = chunk.content.text;
              } else if (typeof chunk.content === 'string') {
                tokenText = chunk.content;
              }
              
              if (tokenText) {
                console.log('Extracted token text:', tokenText);
                accumulatedContent += tokenText;
                
                // Update DynamoDB with the latest content
                try {
                  await updateMessageInDynamoDB(messageId, accumulatedContent, false, conversationId);
                } catch (dbError) {
                  console.error('Error updating DynamoDB:', dbError);
                }
                
                // Publish update to AppSync
                try {
                  await publishToAppSync(messageId, conversationId, accumulatedContent, false, APPSYNC_ENDPOINT, APPSYNC_API_KEY);
                } catch (appsyncError) {
                  console.error('Error publishing to AppSync:', appsyncError);
                }
              }
            }
          }
        } catch (error) {
          console.error('Error processing chunk:', error);
        }
      }
      
      console.log('Finished processing all chunks');
      
      // Add fallback message if no content was extracted
      if (accumulatedContent === "") {
        console.log('No content was extracted from the stream, using fallback message');
        accumulatedContent = "I'm sorry, I wasn't able to generate a response. Please try again.";
      }
      
      // Mark as complete
      await updateMessageInDynamoDB(messageId, accumulatedContent, true, conversationId);
      await publishToAppSync(messageId, conversationId, accumulatedContent, true, APPSYNC_ENDPOINT, APPSYNC_API_KEY);
      
      return { success: true, messageId, conversationId };
    } catch (error) {
      console.error('Error processing stream:', error);
      
      // Mark as complete with error
      const errorMessage = accumulatedContent + "\n\n[Error: Processing interrupted]";
      await updateMessageInDynamoDB(messageId, errorMessage, true, conversationId);
      await publishToAppSync(messageId, conversationId, errorMessage, true, APPSYNC_ENDPOINT, APPSYNC_API_KEY);
      
      throw error;
    }
  } catch (error) {
    console.error('Error in streaming handler:', error);
    return {
      error: error.message || 'Failed to generate streaming response'
    };
  }
};

/**
 * Update message content in DynamoDB
 */
async function updateMessageInDynamoDB(messageId, content, isComplete, conversationId) {
  console.log('Updating DynamoDB with params:', {
    messageId,
    conversationId,
    contentLength: content ? content.length : 0,
    isComplete
  });
  
  const params = {
    TableName: MESSAGES_TABLE_NAME,
    Key: { 
      id: messageId,
      conversationId: conversationId
    },
    UpdateExpression: 'SET content = :content, isComplete = :isComplete',
    ExpressionAttributeValues: {
      ':content': content,
      ':isComplete': isComplete
    }
  };
  
  console.log('DynamoDB params:', JSON.stringify(params));
  
  try {
    // Use AWS SDK v3 DynamoDB client
    await ddbDocClient.send(new UpdateCommand(params));
    console.log('DynamoDB update successful');
  } catch (error) {
    console.error('DynamoDB update error:', error);
    console.log('Error updating DynamoDB with params:', JSON.stringify(params));
    throw error;
  }
}

/**
 * Publish message update to AppSync
 */
async function publishToAppSync(messageId, conversationId, content, isComplete, appsyncEndpoint = APPSYNC_ENDPOINT, appsyncApiKey = APPSYNC_API_KEY) {
  // Log subscription event details
  console.log('Publishing subscription event for:', {
    messageId,
    conversationId,
    contentPreview: content.length > 50 ? `${content.substring(0, 50)}...` : content,
    contentLength: content.length,
    isComplete
  });
  
  // Skip if endpoint is not available
  if (!appsyncEndpoint) {
    console.log('Skipping AppSync update: endpoint not available');
    return;
  }
  
  // If API key is not available or is a placeholder, try to get it from SSM
  if (!appsyncApiKey || appsyncApiKey === 'API_KEY_NOT_AVAILABLE') {
    try {
      const projectName = process.env.PROJECT_NAME || 'chatbot';
      const parameterName = `/${projectName}/appsync/api-key`;
      
      const parameter = await ssmClient.send(new GetParameterCommand({
        Name: parameterName,
        WithDecryption: true
      }));
      
      if (parameter && parameter.Parameter && parameter.Parameter.Value) {
        appsyncApiKey = parameter.Parameter.Value;
      } else {
        console.warn('API key not found in SSM Parameter Store');
        return;
      }
    } catch (error) {
      console.error('Error getting API key from SSM:', error);
      return;
    }
  }
  
  // First, verify the message exists in DynamoDB and get the latest data
  try {
    console.log('Verifying message in DynamoDB before publishing to AppSync');
    const getParams = {
      TableName: MESSAGES_TABLE_NAME,
      Key: { 
        id: messageId,
        conversationId: conversationId
      }
    };
    
    const result = await ddbDocClient.send(new GetCommand(getParams));
    
    if (!result.Item) {
      console.error('Message not found in DynamoDB, cannot publish to AppSync');
      return;
    }
    
    console.log('Message verified in DynamoDB:', JSON.stringify({
      id: result.Item.id,
      conversationId: result.Item.conversationId,
      contentLength: result.Item.content ? result.Item.content.length : 0,
      isComplete: result.Item.isComplete
    }));
  } catch (error) {
    console.error('Error verifying message in DynamoDB:', error);
    // Continue anyway, as the message might still exist
  }
  
  // Prepare the mutation
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
  
  const variables = {
    messageId,
    conversationId,
    content,
    isComplete
  };
  
  // Log the GraphQL mutation and variables
  console.log('Publishing to AppSync with mutation:', mutation.trim());
  console.log('Publishing to AppSync with variables:', JSON.stringify({
    messageId,
    conversationId,
    contentLength: content.length,
    isComplete
  }, null, 2));
  
  // Extract API ID from the endpoint URL
  // Endpoint format: https://[api-id].appsync-api.[region].amazonaws.com/graphql
  let apiId = '';
  try {
    const urlParts = appsyncEndpoint.split('.');
    if (urlParts.length > 0) {
      apiId = urlParts[0].replace('https://', '');
      console.log('Extracted API ID from endpoint:', apiId);
    }
  } catch (error) {
    console.error('Error extracting API ID from endpoint:', error);
  }
  
  // Execute the mutation
  try {
    console.log('Available AppSync methods:', Object.getOwnPropertyNames(AppSyncClient.prototype));
    
    // Use HTTP request directly since AWS SDK v3 doesn't have a direct GraphQL operation
    console.log('Using HTTP request for GraphQL operation');
    
    // Create a promise-based HTTP request
    const makeRequest = () => {
      return new Promise((resolve, reject) => {
        const requestBody = JSON.stringify({
          query: mutation,
          variables: variables
        });
        
        const options = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': appsyncApiKey
          }
        };
        
        // Log HTTP request details
        console.log('AppSync request headers:', JSON.stringify({
          'Content-Type': options.headers['Content-Type'],
          'x-api-key': 'REDACTED'
        }, null, 2));
        console.log('AppSync request body length:', requestBody.length);
        console.log('AppSync full request body:', requestBody);
        
        const startTime = Date.now();
        
        const req = https.request(appsyncEndpoint, options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            const endTime = Date.now();
            console.log(`AppSync request completed in ${endTime - startTime}ms`);
            console.log('AppSync response status:', res.statusCode);
            console.log('AppSync full response body:', data);
            
            if (res.statusCode >= 200 && res.statusCode < 300) {
              // Log the response from AppSync
              try {
                const parsedResponse = JSON.parse(data);
                console.log('AppSync response data:', JSON.stringify(parsedResponse.data, null, 2));
                
                if (parsedResponse.errors) {
                  console.error('AppSync response errors:', JSON.stringify(parsedResponse.errors, null, 2));
                  
                  // Check for specific error types
                  const errors = parsedResponse.errors;
                  for (const error of errors) {
                    if (error.message.includes('Cannot return null for non-nullable')) {
                      console.error('Schema validation error: A non-nullable field is returning null');
                    } else if (error.message.includes('Unauthorized')) {
                      console.error('Authorization error: Check API key or IAM permissions');
                    }
                  }
                } else if (parsedResponse.data && parsedResponse.data.updateMessageContent === null) {
                  console.error('AppSync returned null for updateMessageContent. This indicates the resolver is not returning data properly.');
                  console.log('This might be due to:');
                  console.log('1. The Lambda function not returning the expected data structure');
                  console.log('2. The AppSync resolver not properly handling the Lambda response');
                  console.log('3. The DynamoDB update not completing before the response is sent');
                } else {
                  console.log('AppSync response successful (no errors)');
                }
              } catch (parseError) {
                console.log('Could not parse AppSync response as JSON:', data);
              }
              
              resolve(data);
            } else {
              console.error('AppSync HTTP error response:', data);
              reject(new Error(`HTTP Error: ${res.statusCode} ${data}`));
            }
          });
        });
        
        req.on('error', (error) => {
          console.error('AppSync request network error:', error.message);
          reject(error);
        });
        
        req.write(requestBody);
        req.end();
      });
    };
    
    await makeRequest();
    console.log('Successfully published to AppSync');
  } catch (error) {
    console.error('Error publishing to AppSync:', error);
    console.error('GraphQL endpoint:', appsyncEndpoint);
    // Don't throw the error, just log it
    // This allows the function to continue even if AppSync updates fail
  }
}
