#!/bin/bash

# This script helps test the AWS GenAI Chatbot API using AWS CLI
# It requires jq for JSON processing (https://stedolan.github.io/jq/)

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed. Please install jq first."
    echo "Installation instructions: https://stedolan.github.io/jq/download/"
    exit 1
fi

# Check if we're in the right directory
if [ ! -d "terraform" ]; then
    echo "Error: This script should be run from the project root directory."
    echo "Please navigate to the directory containing the terraform folder."
    exit 1
fi

# Get Terraform outputs
echo "Fetching Terraform outputs..."
cd terraform
GRAPHQL_ENDPOINT=$(terraform output -raw appsync_graphql_endpoint)
API_KEY=$(terraform output -raw appsync_api_key)
cd ..

if [ -z "$GRAPHQL_ENDPOINT" ] || [ -z "$API_KEY" ]; then
    echo "Error: Could not retrieve GraphQL endpoint or API key from Terraform outputs."
    echo "Make sure you have deployed the infrastructure with Terraform first."
    exit 1
fi

echo "GraphQL Endpoint: $GRAPHQL_ENDPOINT"
echo "API Key: ${API_KEY:0:5}...${API_KEY: -5}"
echo

# Function to execute GraphQL operations
execute_graphql() {
    local query=$1
    local variables=$2
    local operation_name=$3

    # Construct the request body
    local body="{\"query\": \"$query\""
    
    if [ ! -z "$variables" ]; then
        body="$body, \"variables\": $variables"
    fi
    
    if [ ! -z "$operation_name" ]; then
        body="$body, \"operationName\": \"$operation_name\""
    fi
    
    body="$body}"

    # Execute the request
    curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "x-api-key: $API_KEY" \
        -d "$body" \
        "$GRAPHQL_ENDPOINT" | jq .
}

# Main menu
while true; do
    echo "AWS GenAI Chatbot API Test Menu"
    echo "------------------------------"
    echo "1. Create a new conversation"
    echo "2. List all conversations"
    echo "3. Send a message"
    echo "4. Get messages in a conversation"
    echo "5. Exit"
    echo
    read -p "Select an option (1-5): " option
    echo

    case $option in
        1)
            echo "Creating a new conversation..."
            read -p "Enter conversation title: " title
            
            query="mutation CreateConversation { createConversation(title: \\\"$title\\\") { id title createdAt updatedAt } }"
            execute_graphql "$query"
            ;;
        2)
            echo "Listing all conversations..."
            
            query="query ListConversations { listConversations { id title createdAt updatedAt } }"
            execute_graphql "$query"
            ;;
        3)
            echo "Sending a message..."
            read -p "Enter conversation ID: " conversation_id
            read -p "Enter message content: " content
            
            query="mutation SendMessage { sendMessage(conversationId: \\\"$conversation_id\\\", content: \\\"$content\\\") { id content role timestamp } }"
            execute_graphql "$query"
            
            echo "Message sent. The AI will respond asynchronously."
            echo "Use option 4 to check for the AI response after a few seconds."
            ;;
        4)
            echo "Getting messages in a conversation..."
            read -p "Enter conversation ID: " conversation_id
            
            query="query GetMessages { getMessages(conversationId: \\\"$conversation_id\\\") { id content role timestamp } }"
            execute_graphql "$query"
            ;;
        5)
            echo "Exiting..."
            exit 0
            ;;
        *)
            echo "Invalid option. Please try again."
            ;;
    esac
    
    echo
    read -p "Press Enter to continue..."
    echo
done
