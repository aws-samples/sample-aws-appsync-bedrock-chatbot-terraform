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
            // Merge function for getMessages query
            merge(existing = [], incoming) {
              // Create a map of existing messages by ID for quick lookup
              const existingMap = new Map();
              existing.forEach(msg => {
                existingMap.set(msg.id, msg);
              });
              
              // Merge incoming messages, avoiding duplicates
              const merged = [...existing];
              incoming.forEach(msg => {
                if (!existingMap.has(msg.id)) {
                  merged.push(msg);
                }
              });
              
              // Sort by timestamp to ensure chronological order
              return merged.sort((a, b) => {
                return new Date(a.timestamp) - new Date(b.timestamp);
              });
            }
          }
        }
      }
    }
  }),
});

export default client;
