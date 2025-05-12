#!/bin/bash

# Script to apply Terraform changes and restart the frontend application
# Usage: ./apply-changes.sh [--build]
#   --build: Build the frontend before starting it

BUILD_FRONTEND=false

# Parse command line arguments
while [[ "$#" -gt 0 ]]; do
  case $1 in
    --build) BUILD_FRONTEND=true ;;
    *) echo "Unknown parameter: $1"; exit 1 ;;
  esac
  shift
done

echo "===== Installing Lambda function dependencies ====="
# Message handler
echo "Installing dependencies for message-handler..."
cd src/functions/message-handler
npm install
cd ../../..

# Streaming handler
echo "Installing dependencies for streaming-handler..."
cd src/functions/streaming-handler
npm install
cd ../../..

# Auth handler
echo "Installing dependencies for auth-handler..."
cd src/functions/auth-handler
npm install
cd ../../..

echo "===== Applying Terraform changes ====="
cd terraform
terraform apply -auto-approve

echo "===== Changing back to root directory ====="
cd ..

echo "===== Updating frontend configuration ====="
cd frontend
npm run update-config || echo "No update-config script found, skipping"
cd ..

echo "===== Restarting frontend application ====="
if [ "$BUILD_FRONTEND" = true ]; then
  echo "Building frontend before starting..."
  cd frontend
  npm run build
  cd ..
fi

./restart-frontend.sh

echo "===== Deployment complete ====="
echo "The infrastructure has been updated using Terraform."
echo "The frontend application has been restarted."
if [ "$BUILD_FRONTEND" = true ]; then
  echo "The frontend application has been rebuilt."
fi
