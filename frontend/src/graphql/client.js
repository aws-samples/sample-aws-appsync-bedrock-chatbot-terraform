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
              existing.forEach(msg => {
                // Ensure we're only merging messages from the same conversation
                if (msg.conversationId === args.conversationId) {
                  existingMap.set(msg.id, msg);
                }
              });
              
              // Start with messages from the current conversation only
              const merged = existing.filter(msg => msg.conversationId === args.conversationId);
              
              // Add incoming messages, avoiding duplicates
              incoming.forEach(msg => {
                if (!existingMap.has(msg.id)) {
                  merged.push(msg);
                }
              });
              
              // Sort by timestamp to ensure chronological order
              const sorted = merged.sort((a, b) => {
                return new Date(a.timestamp) - new Date(b.timestamp);
              });
              
              console.log('Merged and sorted messages:', sorted.length);
              return sorted;
            }
          }
        }
      }
    }
  }),
});

export default client;
