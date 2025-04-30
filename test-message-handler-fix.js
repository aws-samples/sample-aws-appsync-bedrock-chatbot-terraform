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
const lambda = new AWS.Lambda();
const dynamodb = new AWS.DynamoDB.DocumentClient();

// Test parameters
const messageId = process.argv[2] || 'test-message-id';
const conversationId = process.argv[3] || 'test-conversation-id';
const content = 'This is a test message update at ' + new Date().toISOString();
const isComplete = true;

async function testMessageHandlerFix() {
  try {
    console.log(`Testing message handler fix with messageId=${messageId}, conversationId=${conversationId}`);
    
    // First, create a test message in DynamoDB
    console.log('Creating test message in DynamoDB...');
    await dynamodb.put({
      TableName: `${projectName}-messages-${environment}`,
      Item: {
        id: messageId,
        conversationId: conversationId,
        content: 'Initial content',
        role: 'assistant',
        timestamp: new Date().toISOString(),
        isComplete: false
      }
    }).promise();
    
    console.log('Test message created successfully');
    
    // Now invoke the Lambda function directly with the updateMessageContent action
    console.log('Invoking message handler Lambda function...');
    const lambdaParams = {
      FunctionName: `${projectName}-message-handler-${environment}`,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({
        action: 'updateMessageContent',
        arguments: {
          messageId,
          conversationId,
          content,
          isComplete
        }
      })
    };
    
    const lambdaResult = await lambda.invoke(lambdaParams).promise();
    console.log('Lambda function invoked successfully');
    
    // Parse the Lambda response
    const response = JSON.parse(lambdaResult.Payload);
    console.log('Lambda response:', JSON.stringify(response, null, 2));
    
    // Verify the message was updated in DynamoDB
    console.log('Verifying message update in DynamoDB...');
    const getParams = {
      TableName: `${projectName}-messages-${environment}`,
      Key: {
        id: messageId,
        conversationId: conversationId
      }
    };
    
    const getResult = await dynamodb.get(getParams).promise();
    console.log('Updated message from DynamoDB:', JSON.stringify(getResult.Item, null, 2));
    
    // Check if the update was successful
    if (getResult.Item && getResult.Item.content === content && getResult.Item.isComplete === isComplete) {
      console.log('✅ Test PASSED: Message was successfully updated in DynamoDB');
    } else {
      console.log('❌ Test FAILED: Message was not updated correctly in DynamoDB');
    }
    
  } catch (error) {
    console.error('Error testing message handler fix:', error);
  }
}

testMessageHandlerFix();
