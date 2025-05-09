import { ApolloClient, InMemoryCache, createHttpLink } from '@apollo/client';
import { ApolloLink } from 'apollo-link';
import { createAuthLink } from 'aws-appsync-auth-link';
import { createSubscriptionHandshakeLink } from 'aws-appsync-subscription-link';
import config from '../config';

// Create an HTTP link for queries and mutations
const httpLink = createHttpLink({
  uri: config.appSync.graphqlEndpoint,
});

// Create an auth link for API key authentication
const authLink = createAuthLink({
  url: config.appSync.graphqlEndpoint,
  region: config.appSync.region,
  auth: {
    type: 'API_KEY',
    apiKey: config.appSync.apiKey,
  },
});

// Create a subscription link for real-time data
const subscriptionLink = createSubscriptionHandshakeLink({
  url: config.appSync.graphqlEndpoint,
  region: config.appSync.region,
  auth: {
    type: 'API_KEY',
    apiKey: config.appSync.apiKey,
  },
});

// Combine the links
const link = ApolloLink.from([
  authLink,
  // Use subscription link for subscription operations, http link for others
  ApolloLink.split(
    operation => {
      const operationType = operation.query.definitions[0].operation;
      return operationType === 'subscription';
    },
    subscriptionLink,
    httpLink
  ),
]);

// Create the Apollo Client with cache configuration
const client = new ApolloClient({
  link,
  cache: new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          getMessages: {
            // Specify which arguments are used to generate the cache key
            keyArgs: ["conversationId"],
            // Merge function for getMessages query
            merge(existing = [], incoming, { args }) {
              console.log('Merging messages for conversation:', args?.conversationId);
              console.log('Existing messages:', existing.length);
              console.log('Incoming messages:', incoming.length);
              
              // Only merge messages for the same conversation
              if (!args || !args.conversationId) {
                console.log('No conversation ID provided, returning incoming data');
                return incoming;
              }
              
              // Create a map of existing messages by ID for quick lookup
              const existingMap = new Map();
              
              // Create a map of temporary user messages by content and approximate time
              // This will help us match temporary messages with their server counterparts
              const tempUserMessageMap = new Map();
              
              // Only include messages from the current conversation
              existing.forEach(msg => {
                // Skip undefined messages or messages without IDs
                if (!msg || !msg.id) {
                  console.log('Skipping undefined message or message without ID in client merge');
                  return;
                }
                
                // Ensure we're only merging messages from the same conversation
                if (msg.conversationId === args.conversationId) {
                  existingMap.set(msg.id, msg);
                  
                  // Track temporary user messages for deduplication
                  if (msg.id.startsWith('temp-user-')) {
                    const timeKey = Math.floor(new Date(msg.timestamp).getTime() / 5000);
                    const contentKey = msg.content ? msg.content.trim() : '';
                    tempUserMessageMap.set(`${contentKey}-${timeKey}`, msg.id);
                  }
                }
              });
              
              // Start with messages from the current conversation only, excluding placeholders
              // that will be replaced by real messages
              const merged = existing.filter(msg => 
                msg && msg.id && 
                msg.conversationId === args.conversationId && 
                !msg.id.startsWith('placeholder-')
              );
              
              // Add incoming messages, avoiding duplicates and handling temporary messages
              incoming.forEach(msg => {
                // Skip undefined messages
                if (!msg) {
                  console.log('Skipping undefined message in merge function');
                  return;
                }
                
                // Ensure message has an ID
                if (!msg.id) {
                  console.log('Message without ID detected in merge function:', msg);
                  // Generate a temporary ID for the message to prevent errors
                  msg = { ...msg, id: `generated-${Date.now()}-${Math.random().toString(36).substring(2, 9)}` };
                }
                
                // Always ensure the message has the correct conversation ID
                if (msg.conversationId !== args.conversationId) {
                  console.log('Fixing message with incorrect conversationId:', msg.id);
                  msg = { ...msg, conversationId: args.conversationId };
                }
                
                // Check if this is a server message that replaces a temporary one
                if (msg && msg.role === 'user' && msg.id && !msg.id.startsWith('temp-user-') && msg.content) {
                  // Look for any temporary messages with the same content
                  const timeKey = Math.floor(new Date(msg.timestamp).getTime() / 5000);
                  const contentKey = msg.content.trim();
                  
                  // Check nearby time windows (within 10 seconds)
                  for (let i = -2; i <= 2; i++) {
                    const nearbyTimeKey = timeKey + i;
                    const mapKey = `${contentKey}-${nearbyTimeKey}`;
                    
                    if (tempUserMessageMap.has(mapKey)) {
                      const tempId = tempUserMessageMap.get(mapKey);
                      console.log('Found temporary message match:', tempId, 'for server message:', msg.id);
                      
                      // Remove the temporary message from our merged array
                      const tempIndex = merged.findIndex(m => m && m.id === tempId);
                      if (tempIndex >= 0) {
                        console.log('Removing temporary message from merged array:', tempId);
                        merged.splice(tempIndex, 1);
                      }
                      
                      // Also remove from our map to prevent adding it back
                      existingMap.delete(tempId);
                      break;
                    }
                  }
                }
                
                // Add the message if it doesn't already exist
                if (!existingMap.has(msg.id)) {
                  merged.push(msg);
                  existingMap.set(msg.id, msg);
                } else if (msg.isComplete && !existingMap.get(msg.id).isComplete) {
                  // Update incomplete messages with complete versions
                  const index = merged.findIndex(m => m.id === msg.id);
                  if (index >= 0) {
                    merged[index] = msg;
                    existingMap.set(msg.id, msg);
                  }
                }
              });
              
              // Filter out any undefined messages before sorting
              const validMerged = merged.filter(msg => msg && msg.id);
              
              // Sort by timestamp to ensure chronological order
              const sorted = validMerged.sort((a, b) => {
                // Handle missing timestamps
                const aTime = a.timestamp ? new Date(a.timestamp) : new Date(0);
                const bTime = b.timestamp ? new Date(b.timestamp) : new Date(0);
                return aTime - bTime;
              });
              
              console.log('Merged and sorted messages:', sorted.length, {
                byRole: {
                  user: sorted.filter(msg => msg.role === 'user').length,
                  assistant: sorted.filter(msg => msg.role === 'assistant').length
                },
                temporaryRemaining: sorted.filter(msg => msg.id.startsWith('temp-user-')).length,
                placeholders: sorted.filter(msg => msg.id.startsWith('placeholder-')).length
              });
              
              return sorted;
            }
          }
        }
      }
    }
  }),
});

export default client;
