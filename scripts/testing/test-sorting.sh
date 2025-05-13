#!/bin/bash

# Script to test the time-based sorting functionality
# This script creates multiple conversations, sends messages to them,
# and verifies that the listRecentConversations query returns them in the correct order

# Set variables
API_URL=$(grep -o 'graphqlEndpoint: "[^"]*"' frontend/src/config.js | cut -d'"' -f2)
API_KEY=$(grep -o 'apiKey: "[^"]*"' frontend/src/config.js | cut -d'"' -f2)

if [ -z "$API_URL" ] || [ -z "$API_KEY" ]; then
  echo "Error: Could not find API URL or API Key in frontend/src/config.js"
  echo "Please run ./apply-changes.sh first to update the configuration"
  exit 1
fi

echo "===== Testing Time-Based Sorting ====="
echo "API URL: $API_URL"
echo "API Key: ${API_KEY:0:5}...${API_KEY: -5}"

# Function to create a conversation
create_conversation() {
  local title=$1
  echo "Creating conversation: $title"
  
  response=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -H "x-api-key: $API_KEY" \
    -d "{\"query\": \"mutation CreateConversation { createConversation(title: \\\"$title\\\") { id title createdAt updatedAt } }\"}" \
    "$API_URL")
  
  # Extract conversation ID
  conversation_id=$(echo $response | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  
  if [ -z "$conversation_id" ]; then
    echo "Error creating conversation: $response"
    return 1
  fi
  
  echo "Created conversation with ID: $conversation_id"
  echo $conversation_id
}

# Function to send a message
send_message() {
  local conversation_id=$1
  local content=$2
  echo "Sending message to conversation $conversation_id: $content"
  
  response=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -H "x-api-key: $API_KEY" \
    -d "{\"query\": \"mutation SendMessage { sendMessage(conversationId: \\\"$conversation_id\\\", content: \\\"$content\\\") { id conversationId content role timestamp } }\"}" \
    "$API_URL")
  
  # Extract message ID
  message_id=$(echo $response | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  
  if [ -z "$message_id" ]; then
    echo "Error sending message: $response"
    return 1
  fi
  
  echo "Sent message with ID: $message_id"
  echo $message_id
}

# Function to list recent conversations
list_recent_conversations() {
  local limit=$1
  echo "Listing recent conversations (limit: $limit)"
  
  response=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -H "x-api-key: $API_KEY" \
    -d "{\"query\": \"query ListRecentConversations { listRecentConversations(limit: $limit) { id title updatedAt } }\"}" \
    "$API_URL")
  
  echo "Recent conversations:"
  echo $response | jq '.data.listRecentConversations[] | {id: .id, title: .title, updatedAt: .updatedAt}'
}

# Create three conversations
echo "===== Creating test conversations ====="
conv1=$(create_conversation "First Conversation")
sleep 2
conv2=$(create_conversation "Second Conversation")
sleep 2
conv3=$(create_conversation "Third Conversation")
sleep 2

# List conversations (should be in reverse order of creation: conv3, conv2, conv1)
echo "===== Initial conversation order ====="
list_recent_conversations 10

# Send a message to the first conversation (should move it to the top)
echo "===== Sending message to first conversation ====="
send_message $conv1 "Hello from the first conversation"
sleep 2

# List conversations again (should now be: conv1, conv3, conv2)
echo "===== Updated conversation order ====="
list_recent_conversations 10

# Send a message to the second conversation (should move it to the top)
echo "===== Sending message to second conversation ====="
send_message $conv2 "Hello from the second conversation"
sleep 2

# List conversations again (should now be: conv2, conv1, conv3)
echo "===== Final conversation order ====="
list_recent_conversations 10

echo "===== Test complete ====="
echo "Check the conversation order above to verify time-based sorting is working correctly."
echo "Expected final order: Second Conversation, First Conversation, Third Conversation"
