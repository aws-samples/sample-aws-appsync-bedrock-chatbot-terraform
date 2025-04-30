#!/usr/bin/env node

/**
 * This script updates the frontend configuration with Terraform outputs.
 * It reads the terraform outputs and updates the config.js file.
 * 
 * Usage: node update-config.js <terraform_output_file> <region>
 * Example: node update-config.js ../terraform/terraform-output.json us-east-1
 */

const fs = require('fs');
const path = require('path');

// Get command line arguments
const outputFilePath = process.argv[2];
const region = process.argv[3] || 'us-east-1';

if (!outputFilePath) {
  console.error('Error: Terraform output file path is required.');
  console.error('Usage: node update-config.js <terraform_output_file> <region>');
  console.error('Example: node update-config.js ../terraform/terraform-output.json us-east-1');
  process.exit(1);
}

// Read the Terraform output file
try {
  const terraformOutput = JSON.parse(fs.readFileSync(outputFilePath, 'utf8'));
  
  // Extract the required values
  const graphqlEndpoint = terraformOutput.appsync_graphql_endpoint?.value;
  const apiKey = terraformOutput.appsync_api_key?.value;
  
  if (!graphqlEndpoint || !apiKey) {
    console.error('Error: Could not find required values in Terraform output.');
    console.error('Make sure the output file contains appsync_graphql_endpoint and appsync_api_key.');
    process.exit(1);
  }
  
  // Read the config file
  const configPath = path.join(__dirname, 'src', 'config.js');
  const configContent = fs.readFileSync(configPath, 'utf8');
  
  // Update the config file
  const updatedConfig = configContent
    .replace(/graphqlEndpoint: ".*"/, `graphqlEndpoint: "${graphqlEndpoint}"`)
    .replace(/apiKey: ".*"/, `apiKey: "${apiKey}"`)
    .replace(/region: ".*"/, `region: "${region}"`);
  
  // Write the updated config back to the file
  fs.writeFileSync(configPath, updatedConfig);
  
  console.log('Configuration updated successfully!');
  console.log(`GraphQL Endpoint: ${graphqlEndpoint}`);
  console.log(`API Key: ${apiKey.substring(0, 5)}...${apiKey.substring(apiKey.length - 5)}`);
  console.log(`Region: ${region}`);
  
} catch (error) {
  console.error('Error updating configuration:', error.message);
  process.exit(1);
}
