# AWS GenAI Chatbot Frontend

This is a React-based frontend application for the AWS GenAI Chatbot project. It provides a user interface to interact with the AppSync GraphQL API and the AI chatbot.

## Prerequisites

- Node.js (v14 or later)
- npm or yarn
- AWS AppSync GraphQL API endpoint and API key (from Terraform outputs)

## Setup

1. Install dependencies:

```bash
cd frontend
npm install
```

2. Configure the application:

There are two ways to configure the frontend with the necessary AWS AppSync details:

### Option A: Using the update-config.js script (Recommended)

After deploying the infrastructure with Terraform:

```bash
# Generate the Terraform outputs JSON file
cd ../terraform
terraform output -json > terraform-output.json
cd ../frontend

# Update the config.js file with the Terraform outputs
node update-config.js ../terraform/terraform-output.json your-aws-region
```

### Option B: Manual configuration

Edit the `src/config.js` file and update the following values with the outputs from your Terraform deployment:

```javascript
const config = {
  appSync: {
    graphqlEndpoint: "YOUR_GRAPHQL_ENDPOINT", // From terraform output: appsync_graphql_endpoint
    apiKey: "YOUR_API_KEY", // From terraform output: appsync_api_key
    region: "us-east-1" // Change to your deployment region
  }
};
```

### For UI Development Without Backend Deployment

If you want to develop the UI without deploying the backend infrastructure:

```bash
# Generate mock Terraform outputs
node generate-mock-outputs.js

# Update the config with mock values
node update-config.js ../terraform/mock-terraform-output.json us-east-1
```

Note: With mock values, the frontend will render but won't be able to connect to a real backend.

## Running the Application

Start the development server:

```bash
npm start
```

This will launch the application at [http://localhost:3000](http://localhost:3000).

## Building for Production

To create a production build:

```bash
npm run build
```

This will create a `build` directory with optimized production files.

## Deploying the Frontend

You can deploy the frontend to various hosting services:

### Option 1: AWS Amplify

1. Push your code to a Git repository (GitHub, GitLab, BitBucket, etc.)
2. Set up a new Amplify app in the AWS Management Console
3. Connect your repository and follow the deployment steps

### Option 2: AWS S3 + CloudFront

1. Build the application: `npm run build`
2. Upload the contents of the `build` directory to an S3 bucket
3. Configure the bucket for static website hosting
4. (Optional) Set up CloudFront for CDN distribution

### Option 3: Other Hosting Services

You can also deploy to services like Netlify, Vercel, or GitHub Pages.

## Using the Application

1. Create a new conversation by clicking the "New Chat" button
2. Enter a title for your conversation
3. Start chatting with the AI by typing messages in the input field
4. The AI will respond in real-time through the AppSync subscription

## Features

- Create and manage multiple conversations
- Real-time message updates using GraphQL subscriptions
- Responsive design for desktop and mobile devices
- Message history persistence using DynamoDB

## Troubleshooting

- If you see authentication errors, check that your API key is correct in `config.js`
- If messages aren't loading, verify that your GraphQL endpoint is correct
- For subscription issues, ensure that your AWS region is set correctly

## License

This project is licensed under the MIT License - see the LICENSE file for details.
