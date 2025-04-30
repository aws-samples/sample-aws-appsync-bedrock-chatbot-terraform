#!/usr/bin/env node

/**
 * This script generates mock Terraform outputs for testing the frontend
 * without actually deploying the infrastructure.
 * 
 * Usage: node generate-mock-outputs.js
 */

const fs = require('fs');
const path = require('path');

// Generate a random API key
const generateApiKey = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Create mock Terraform outputs
const mockOutputs = {
  appsync_graphql_endpoint: {
    sensitive: false,
    type: "string",
    value: "https://example-mock-endpoint.appsync-api.us-east-1.amazonaws.com/graphql"
  },
  appsync_api_key: {
    sensitive: true,
    type: "string",
    value: generateApiKey()
  },
  dynamodb_messages_table_name: {
    sensitive: false,
    type: "string",
    value: "mock-messages-table"
  },
  dynamodb_conversations_table_name: {
    sensitive: false,
    type: "string",
    value: "mock-conversations-table"
  }
};

// Write the mock outputs to a file
const outputPath = path.join(__dirname, '..', 'terraform', 'mock-terraform-output.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(mockOutputs, null, 2));

console.log('Mock Terraform outputs generated at:', outputPath);
console.log('');
console.log('To use these mock outputs with the frontend:');
console.log('node update-config.js ../terraform/mock-terraform-output.json us-east-1');
console.log('');
console.log('Note: The frontend will not be able to connect to a real backend with these mock values.');
console.log('This is only useful for UI development and testing the frontend components.');
