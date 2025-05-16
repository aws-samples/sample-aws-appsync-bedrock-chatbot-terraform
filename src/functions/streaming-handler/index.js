// Import AWS SDK v3 modules
const { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } = require('@aws-sdk/client-bedrock-runtime');
const { BedrockAgentRuntimeClient, RetrieveCommand } = require('@aws-sdk/client-bedrock-agent-runtime');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { AppSyncClient } = require('@aws-sdk/client-appsync');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const { SignatureV4 } = require('@aws-sdk/signature-v4');
const { HttpRequest } = require('@aws-sdk/protocol-http');
const { NodeHttpHandler } = require('@aws-sdk/node-http-handler');
const { defaultProvider } = require('@aws-sdk/credential-provider-node');
const { Hash } = require('@aws-sdk/hash-node');
const { PassThrough } = require('stream');
const https = require('https');

// Initialize AWS clients
const region = process.env.AWS_REGION || 'us-east-1';
const bedrockClient = new BedrockRuntimeClient({ region });
const bedrockAgentClient = new BedrockAgentRuntimeClient({ region });
const dynamoClient = new DynamoDBClient({ region });
const ddbDocClient = DynamoDBDocumentClient.from(dynamoClient);
const appsyncClient = new AppSyncClient({ region });
const ssmClient = new SSMClient({ region });

// Environment variables
const DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';
const KNOWLEDGE_BASE_ID = process.env.KNOWLEDGE_BASE_ID;

/**
 * Main handler for streaming responses from Bedrock
 */
exports.handler = async (event) => {
  console.log('Event received:', JSON.stringify(event, null, 2));
  
  try {
    const { messageId, conversationId, messages, documentIds, userId, appsyncEndpoint, appsyncApiKey } = event;
    
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
    
    // Check if this is a document-specific query
    let enhancedPrompt = '';
    if (documentIds && Array.isArray(documentIds) && documentIds.length > 0) {
      console.log(`Processing document query for documents: ${documentIds.join(', ')}`);
      
      try {
        // Query the Knowledge Base for relevant information
        const retrievalResults = await queryKnowledgeBase(documentIds, messages[messages.length - 1].content, userId);
        
        if (retrievalResults && retrievalResults.length > 0) {
          // Format the retrieved information for the prompt
          enhancedPrompt = formatRetrievalResults(retrievalResults);
          console.log('Enhanced prompt with Knowledge Base results');
        } else {
          console.log('No relevant information found in Knowledge Base');
        }
      } catch (error) {
        console.error('Error querying Knowledge Base:', error);
        // Continue without Knowledge Base results
      }
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
    
    // If we have an enhanced prompt from the Knowledge Base, add it to the user's message
    if (enhancedPrompt && formattedMessages.length > 0) {
      const lastUserMessageIndex = formattedMessages.length - 1;
      const userQuestion = formattedMessages[lastUserMessageIndex].content[0].text;
      
      // Create a system message with the retrieved information
      formattedMessages.unshift({
        role: 'system',
        content: [
          {
            type: "text",
            text: `You are an AI assistant that helps users find information in their documents. When answering questions about documents, use ONLY the information provided below and cite your sources. If the information needed is not in the provided context, say that you don't have enough information to answer accurately.\n\nHere is the relevant information from the user's documents:\n\n${enhancedPrompt}`
          }
        ]
      });
      
      console.log('Added system message with Knowledge Base context');
    }
    
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
 * Query the Knowledge Base for relevant information
 */
async function queryKnowledgeBase(documentIds, query, userId) {
  if (!KNOWLEDGE_BASE_ID) {
    console.warn('Knowledge Base ID not provided. Cannot query Knowledge Base.');
    return [];
  }
  
  console.log(`Querying Knowledge Base ${KNOWLEDGE_BASE_ID} for: "${query}"`);
  
  try {
    // Create a filter to ensure user can only access their own documents
    const filter = {
      andAll: [
        {
          equals: {
            key: "userId",
            value: userId
          }
        },
        {
          inAll: {
            key: "documentId",
            values: documentIds
          }
        }
      ]
    };
    
    // Prepare the retrieve command
    const retrieveParams = {
      knowledgeBaseId: KNOWLEDGE_BASE_ID,
      retrievalQuery: {
        text: query
      },
      retrievalConfiguration: {
        vectorSearchConfiguration: {
          filter: filter,
          numberOfResults: 5 // Limit to top 5 most relevant results
        }
      }
    };
    
    console.log('Retrieve params:', JSON.stringify(retrieveParams, null, 2));
    
    // Execute the retrieve command
    const retrieveCommand = new RetrieveCommand(retrieveParams);
    const retrieveResponse = await bedrockAgentClient.send(retrieveCommand);
    
    console.log('Retrieve response:', JSON.stringify({
      retrievalResultsCount: retrieveResponse.retrievalResults?.length || 0,
      statusCode: retrieveResponse.$metadata?.httpStatusCode
    }, null, 2));
    
    // Extract and return the retrieval results
    if (retrieveResponse.retrievalResults && retrieveResponse.retrievalResults.length > 0) {
      return retrieveResponse.retrievalResults.map(result => ({
        content: result.content,
        location: result.location,
        metadata: result.metadata,
        score: result.score
      }));
    }
    
    return [];
  } catch (error) {
    console.error('Error querying Knowledge Base:', error);
    return [];
  }
}

/**
 * Format retrieval results for the prompt
 */
function formatRetrievalResults(retrievalResults) {
  if (!retrievalResults || retrievalResults.length === 0) {
    return '';
  }
  
  let formattedResults = '';
  
  // Format each result with source information
  retrievalResults.forEach((result, index) => {
    // Extract document name from metadata or location
    let documentName = 'Unknown Document';
    let pageNumber = '';
    
    if (result.metadata && result.metadata.documentName) {
      documentName = result.metadata.documentName;
    } else if (result.location && result.location.s3Location && result.location.s3Location.uri) {
      // Extract filename from S3 URI
      const uriParts = result.location.s3Location.uri.split('/');
      documentName = uriParts[uriParts.length - 1];
    }
    
    // Extract page number if available
    if (result.metadata && result.metadata.pageNumber) {
      pageNumber = `, Page ${result.metadata.pageNumber}`;
    }
    
    // Format the content with source citation
    formattedResults += `[Source ${index + 1}: "${documentName}"${pageNumber}]\n${result.content}\n\n`;
  });
  
  return formattedResults;
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
  
  // First, verify the message exists in DynamoDB and get the latest data
  try {
    console.log('Verifying message in DynamoDB before publishing to AppSync');
    const getParams = {
      TableName: DYNAMODB_TABLE_NAME,
      Key: { 
        PK: `CONV#${conversationId}`,
        SK: `MSG#${messageId}`
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
  
  // Execute the mutation using AWS AppSync client with IAM auth
  try {
    console.log('Using AppSync client with IAM authentication');
    
    // Create a GraphQL request
    const requestBody = JSON.stringify({
      query: mutation,
      variables: variables
    });
    
    // Use the AWS SDK v3 AppSync client to execute the GraphQL mutation
    const graphqlParams = {
      apiId: apiId,
      query: mutation,
      variables: JSON.stringify(variables),
      authMode: 'AWS_IAM'
    };
    
    console.log('Executing GraphQL mutation with IAM auth:', graphqlParams);
    
    try {
      // Use the AppSync client to execute the mutation
      // Note: The AWS SDK v3 AppSync client doesn't have a GraphQL method
      // This will likely fail, so we'll fall back to the SigV4 signing approach
      console.log('Attempting to use AppSync client, but this will likely fail');
      try {
        const result = await appsyncClient.send({
          apiId: apiId,
          query: mutation,
          variables: JSON.stringify(variables),
          authMode: 'AWS_IAM'
        });
        console.log('AppSync GraphQL result:', result);
        console.log('Successfully published to AppSync with IAM auth');
      } catch (clientError) {
        throw new Error('AppSync client method not supported');
      }
    } catch (appsyncError) {
      console.error('Error using AppSync client:', appsyncError);
      
      // Fall back to using HTTP request with SigV4 signing using AWS SDK v3
      console.log('Falling back to HTTP request with SigV4 signing using AWS SDK v3');
      
      const endpoint = new URL(appsyncEndpoint);
      
      // Create a request to be signed
      const request = new HttpRequest({
        hostname: endpoint.hostname,
        path: endpoint.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: endpoint.hostname
        },
        body: requestBody
      });
      
      // Get credentials for debugging
      const credentialsProvider = defaultProvider();
      try {
        const credentials = await credentialsProvider();
        console.log('Using credentials with access key ID:', credentials.accessKeyId);
        console.log('Credentials expiration:', credentials.expiration);
      } catch (credError) {
        console.error('Error getting credentials:', credError);
      }
      
      // Create a signer with the service name 'appsync'
      const signer = new SignatureV4({
        credentials: credentialsProvider,
        region: region,
        service: 'appsync',
        sha256: Hash.bind(null, 'sha256')
      });
      
      console.log('Using region for signing:', region);
      
      // Sign the request
      const signedRequest = await signer.sign(request);
      
      // Log the full signed request (except for sensitive headers)
      const redactedHeaders = {...signedRequest.headers};
      if (redactedHeaders.Authorization) redactedHeaders.Authorization = "REDACTED";
      console.log('Full signed request:', {
        method: signedRequest.method,
        hostname: signedRequest.hostname,
        path: signedRequest.path,
        headers: redactedHeaders
      });
      
      // Convert the signed request to a format that can be used with https
      const options = {
        method: signedRequest.method,
        host: endpoint.hostname,
        path: endpoint.pathname,
        headers: signedRequest.headers
      };
      
      // Log HTTP request details
      console.log('AppSync request headers:', JSON.stringify({
        'Content-Type': options.headers['Content-Type'],
        'Authorization': 'REDACTED',
        'X-Amz-Date': options.headers['X-Amz-Date']
      }, null, 2));
      
      // Create a promise-based HTTP request
      const makeRequest = () => {
        return new Promise((resolve, reject) => {
          const httpRequest = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
              data += chunk;
            });
            res.on('end', () => {
              console.log('AppSync response status:', res.statusCode);
              console.log('AppSync full response body:', data);
              
              if (res.statusCode >= 200 && res.statusCode < 300) {
                try {
                  const parsedResponse = JSON.parse(data);
                  console.log('AppSync response data:', JSON.stringify(parsedResponse.data, null, 2));
                  
                  if (parsedResponse.errors) {
                    console.error('AppSync response errors:', JSON.stringify(parsedResponse.errors, null, 2));
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
          
          httpRequest.on('error', (error) => {
            console.error('AppSync request network error:', error.message);
            reject(error);
          });
          
          httpRequest.write(requestBody);
          httpRequest.end();
        });
      };
      
      await makeRequest();
      console.log('Successfully published to AppSync with SigV4 signing');
    }
  } catch (error) {
    console.error('Error publishing to AppSync:', error);
    console.error('GraphQL endpoint:', appsyncEndpoint);
    // Don't throw the error, just log it
    // This allows the function to continue even if AppSync updates fail
  }
}
