const AWS = require('aws-sdk');

// Initialize Bedrock client
const bedrock = new AWS.BedrockRuntime();

// Environment variables
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';

/**
 * Main handler for Bedrock client
 */
exports.handler = async (event) => {
  console.log('Event received:', JSON.stringify(event, null, 2));
  
  try {
    const { messages } = event;
    
    if (!messages || !Array.isArray(messages)) {
      return {
        error: 'Invalid input: messages array is required'
      };
    }
    
    // Log received messages
    console.log('Received messages:', JSON.stringify(messages, null, 2));
    
    // Format messages for Claude model
    const formattedMessages = formatMessagesForModel(messages);
    
    // Log formatted messages
    console.log('Formatted messages for model:', JSON.stringify(formattedMessages, null, 2));
    
    // Check for consecutive identical roles
    const roles = formattedMessages.map(msg => msg.role);
    console.log('Message roles sequence:', roles.join(', '));
    
    let hasConsecutiveSameRoles = false;
    for (let i = 1; i < roles.length; i++) {
      if (roles[i] === roles[i-1]) {
        console.error(`Found consecutive ${roles[i]} roles at positions ${i-1} and ${i}`);
        hasConsecutiveSameRoles = true;
      }
    }
    
    if (hasConsecutiveSameRoles) {
      console.error('Validation failed: Found consecutive identical roles');
      
      // Apply additional filtering to ensure alternating roles
      // This is a safety measure in case the message-handler didn't filter properly
      console.log('Applying additional filtering to ensure alternating roles');
      
      const safeMessages = [];
      let lastRole = null;
      
      for (const msg of formattedMessages) {
        if (msg.role !== lastRole) {
          safeMessages.push(msg);
          lastRole = msg.role;
        } else {
          // Replace the last message with this one
          console.log(`Replacing previous ${msg.role} message with newer one`);
          safeMessages[safeMessages.length - 1] = msg;
        }
      }
      
      formattedMessages = safeMessages;
      console.log('Filtered message roles:', formattedMessages.map(msg => msg.role).join(', '));
    }
    
    // Prepare the request body based on the model
    const requestBody = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1000,
      messages: formattedMessages
    };
    
    // Invoke Bedrock model
    const response = await bedrock.invokeModel({
      modelId: BEDROCK_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody)
    }).promise();
    
    // Parse the response
    const responseBody = JSON.parse(Buffer.from(response.body).toString());
    
    console.log('Bedrock response:', JSON.stringify(responseBody, null, 2));
    
    return {
      response: responseBody.content[0].text
    };
  } catch (error) {
    console.error('Error invoking Bedrock model:', error);
    return {
      error: error.message || 'Failed to generate response'
    };
  }
};

/**
 * Format messages for the Claude model
 */
function formatMessagesForModel(messages) {
  // Map the messages to the format expected by Claude
  return messages.map(msg => {
    // Convert 'user' and 'assistant' roles to match Claude's expected format
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
}
