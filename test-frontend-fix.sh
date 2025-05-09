#!/bin/bash

# Script to test the frontend fixes for message display issues
# 
# FIXES IMPLEMENTED:
# 1. Apollo Cache Configuration:
#    - Added keyArgs: ["conversationId"] to properly separate messages by conversation
#    - Updated merge function to only merge messages from the same conversation
#    - Added filtering to ensure messages from different conversations don't mix
#
# 2. ChatInterface Component:
#    - Added conversation change detection to clear messages when switching conversations
#    - Enhanced message merging logic to preserve conversation context
#    - Added additional logging for debugging message display issues
#
# This script will:
# 1. Start the frontend application
# 2. Open the browser to the application
# 3. Provide instructions for testing

echo "===== Testing Frontend Message Display Fixes ====="

# Check if the frontend directory exists
if [ ! -d "frontend" ]; then
  echo "Error: frontend directory not found. Make sure you're in the project root directory."
  exit 1
fi

# Navigate to the frontend directory
cd frontend

# Check if node_modules exists, if not, install dependencies
if [ ! -d "node_modules" ]; then
  echo "Installing frontend dependencies..."
  npm install
fi

# Update the frontend configuration with the latest Terraform outputs
echo "Updating frontend configuration with latest Terraform outputs..."
node update-config.js ../terraform/terraform-output.json

# Start the frontend application in the background
echo "Starting the frontend application..."
npm start &
FRONTEND_PID=$!

# Wait for the application to start
echo "Waiting for the application to start..."
sleep 5

# Open the browser to the application
echo "Opening the browser to the application..."
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  open http://localhost:3000
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  # Linux
  xdg-open http://localhost:3000
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
  # Windows
  start http://localhost:3000
else
  echo "Please open http://localhost:3000 in your browser to test the application."
fi

# Print testing instructions
echo ""
echo "===== Testing Instructions ====="
echo "1. Create a new conversation or select an existing one"
echo "2. Send a message to the AI"
echo "3. Verify that all messages in the conversation are displayed correctly"
echo "4. Check that new messages appear in real-time"
echo "5. Verify that streaming responses work correctly"
echo ""
echo "Press Ctrl+C to stop the frontend application when you're done testing."

# Wait for the user to press Ctrl+C
wait $FRONTEND_PID
