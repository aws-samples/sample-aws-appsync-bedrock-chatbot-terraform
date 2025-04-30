const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

// Load config from terraform output
let config;
try {
  const terraformOutput = fs.readFileSync(path.join(__dirname, 'terraform/terraform-output.json'), 'utf8');
  config = JSON.parse(terraformOutput);
} catch (error) {
  console.error('Error loading terraform output:', error);
  console.log('Please run "terraform output -json > terraform/terraform-output.json" first');
  process.exit(1);
}

// Extract values from config
const region = config.aws_region?.value || 'us-east-1';
const projectName = config.project_name?.value || 'genai-chatbot';
const environment = config.environment?.value || 'dev';

// Initialize AWS SDK
AWS.config.update({ region });
const ssm = new AWS.SSM();
const https = require('https');

async function getAppSyncDetails() {
  // Get AppSync API ID
  const appSync = new AWS.AppSync();
  const apis = await appSync.listGraphqlApis().promise();
  const api = apis.graphqlApis.find(api => api.name.includes(projectName));
  
  if (!api) {
    throw new Error(`AppSync API for ${projectName} not found`);
  }
  
  console.log('Found AppSync API:', api.name);
  
  // Get API key from SSM
  const parameterName = `/${projectName}/appsync/api-key`;
  const parameter = await ssm.getParameter({
    Name: parameterName,
    WithDecryption: true
  }).promise();
  
  if (!parameter || !parameter.Parameter || !parameter.Parameter.Value) {
    throw new Error(`API key not found in SSM Parameter Store: ${parameterName}`);
  }
  
  return {
    endpoint: api.uris.GRAPHQL,
    apiKey: parameter.Parameter.Value
  };
}

async function publishTestUpdate(endpoint, apiKey, messageId, conversationId) {
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
    content: `This is a test message update at ${new Date().toISOString()}`,
    isComplete: false
  };
  
  // Create a promise-based HTTP request
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({
      query: mutation,
      variables: variables
    });
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      }
    };
    
    console.log('Sending GraphQL request to:', endpoint);
    
    const req = https.request(endpoint, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP Error: ${res.statusCode} ${data}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.write(requestBody);
    req.end();
  });
}

async function main() {
  try {
    // Check command line arguments
    const messageId = process.argv[2];
    const conversationId = process.argv[3];
    
    if (!messageId || !conversationId) {
      console.error('Usage: node test-subscription.js <messageId> <conversationId>');
      process.exit(1);
    }
    
    // Get AppSync details
    const { endpoint, apiKey } = await getAppSyncDetails();
    
    // Publish test update
    console.log(`Publishing test update for message ${messageId} in conversation ${conversationId}`);
    const result = await publishTestUpdate(endpoint, apiKey, messageId, conversationId);
    
    console.log('Result:', result);
    console.log('\nIf the subscription is working correctly, you should see this message update in the frontend.');
    console.log('Check the browser console for logs from the subscription handler.');
    
    // Send a complete update after 5 seconds
    console.log('\nSending a "complete" update in 5 seconds...');
    setTimeout(async () => {
      const completeVariables = {
        messageId,
        conversationId,
        content: `This is a completed test message at ${new Date().toISOString()}`,
        isComplete: true
      };
      
      const completeRequestBody = JSON.stringify({
        query: mutation,
        variables: completeVariables
      });
      
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        }
      };
      
      const req = https.request(endpoint, options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          console.log('Complete update result:', data);
        });
      });
      
      req.on('error', (error) => {
        console.error('Error sending complete update:', error);
      });
      
      req.write(completeRequestBody);
      req.end();
    }, 5000);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Define the mutation here for the setTimeout callback
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

main();
