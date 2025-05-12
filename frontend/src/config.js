// Replace these values with the outputs from your Terraform deployment
const config = {
  // AppSync configuration
  appSync: {
    // GraphQL endpoint URL from Terraform output: appsync_graphql_endpoint
    graphqlEndpoint: "https://REDACTED-APPSYNC-ID.appsync-api.us-east-1.amazonaws.com/graphql",
    
    // API key from Terraform output: appsync_api_key
    apiKey: "REDACTED-APPSYNC-KEY",
    
    // AWS region where your resources are deployed
    region: "us-east-1" // Change to your deployment region
  },
  
  // Authentication API configuration
  apiUrl: "https://syaahvlmjk.execute-api.us-east-1.amazonaws.com", // Replace with your API Gateway URL from Terraform output
  
  // JWT configuration
  jwt: {
    expiresIn: 86400, // 24 hours in seconds
    tokenPrefix: "Bearer "
  }
};

export default config;
