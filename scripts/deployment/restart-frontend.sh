#!/bin/bash

# Script to restart the frontend application

echo "===== Stopping any running frontend processes ====="
pkill -f "node.*start" || echo "No frontend processes found"

echo "===== Changing to frontend directory ====="
cd frontend

echo "===== Installing dependencies ====="
npm install

echo "===== Starting frontend application ====="
npm start
