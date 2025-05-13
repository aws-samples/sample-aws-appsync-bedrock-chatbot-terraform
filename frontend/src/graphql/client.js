import { ApolloClient, InMemoryCache, createHttpLink } from '@apollo/client';
import { ApolloLink } from 'apollo-link';
import { createAuthLink } from 'aws-appsync-auth-link';
import { createSubscriptionHandshakeLink } from 'aws-appsync-subscription-link';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import config from '../config';
import authService from '../auth/authService';

// Create an HTTP link for queries and mutations
const httpLink = createHttpLink({
  uri: config.appSync.graphqlEndpoint,
});

// Create an auth link that adds the JWT token to the Authorization header
const jwtAuthLink = setContext((_, { headers }) => {
  // Get the authentication token from the auth service
  const token = authService.getToken();
  
  // Log authentication status for debugging
  console.log('Auth token status:', {
    isLoggedIn: !!token,
    tokenExpiry: token ? new Date(authService.getTokenExpiry()).toISOString() : 'none',
    username: authService.getUsername() || 'none',
    tokenLength: token ? token.length : 0,
    tokenPrefix: token ? token.substring(0, 10) + '...' : 'none'
  });
  
  // Return the headers to the context so httpLink can read them
  const authHeaders = {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : '',
    }
  };
  
  console.log('Request headers:', {
    hasAuthorization: !!authHeaders.headers.authorization,
    authHeaderLength: authHeaders.headers.authorization ? authHeaders.headers.authorization.length : 0,
    otherHeaders: Object.keys(authHeaders.headers).filter(key => key !== 'authorization')
  });
  
  return authHeaders;
});

// Fallback to API key authentication if no JWT token is available
const apiKeyAuthLink = createAuthLink({
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
    type: 'AWS_LAMBDA',
    token: () => {
      const token = authService.getToken();
      console.log('WebSocket auth token:', token ? 'Bearer ' + token : 'No token available');
      return token ? `Bearer ${token}` : '';
    },
  },
  // Add these debug options
  connectionParams: {
    authMode: 'AWS_LAMBDA',
  },
  onError: (err) => {
    console.error('WebSocket connection error:', err);
    console.error('WebSocket connection error details:', JSON.stringify(err, null, 2));
  },
});

// Log the subscription link configuration
console.log('AppSync endpoint:', config.appSync.graphqlEndpoint);
console.log('AppSync region:', config.appSync.region);

// Create an error handling link
const errorLink = onError(({ graphQLErrors, networkError }) => {
  if (graphQLErrors)
    graphQLErrors.forEach(({ message, locations, path }) =>
      console.error(
        `[GraphQL error]: Message: ${message}, Location: ${locations}, Path: ${path}`
      )
    );
  if (networkError) {
    console.error(`[Network error]:`, networkError);
    // Log additional details for WebSocket errors
    if (networkError.name === 'ServerError' && networkError.statusCode === 401) {
      console.error('WebSocket authentication error. Check your token format and validity.');
      console.error('Error details:', JSON.stringify(networkError, null, 2));
    }
  }
});

// Combine the links
const link = ApolloLink.from([
  // Add error handling link
  errorLink,
  // Always use JWT auth link to add Authorization header if user is logged in
  jwtAuthLink,
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
  connectToDevTools: true,
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'network-only',
      errorPolicy: 'all',
    },
    query: {
      fetchPolicy: 'network-only',
      errorPolicy: 'all',
    },
  },
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

// Note: We've moved the error handling to the errorLink above

// Add a helper function to decode base64 headers for debugging
window.decodeWebSocketHeader = function(encodedHeader) {
  try {
    const decoded = JSON.parse(atob(encodedHeader));
    console.log('Decoded WebSocket header:', decoded);
    return decoded;
  } catch (e) {
    console.error('Error decoding header:', e);
    return null;
  }
};

export default client;
