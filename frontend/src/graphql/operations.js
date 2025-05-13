import { gql } from '@apollo/client';

// Queries
export const GET_CONVERSATION = gql`
  query GetConversation($id: ID!) {
    getConversation(id: $id) {
      id
      userId
      title
      createdAt
      updatedAt
    }
  }
`;

export const LIST_CONVERSATIONS = gql`
  query ListConversations {
    listConversations {
      id
      userId
      title
      createdAt
      updatedAt
    }
  }
`;

export const LIST_RECENT_CONVERSATIONS = gql`
  query ListRecentConversations($limit: Int) {
    listRecentConversations(limit: $limit) {
      id
      userId
      title
      createdAt
      updatedAt
    }
  }
`;

export const GET_MESSAGES = gql`
  query GetMessages($conversationId: ID!) {
    getMessages(conversationId: $conversationId) {
      id
      conversationId
      content
      role
      timestamp
      isComplete
    }
  }
`;

// Mutations
export const CREATE_CONVERSATION = gql`
  mutation CreateConversation($title: String) {
    createConversation(title: $title) {
      id
      userId
      title
      createdAt
      updatedAt
    }
  }
`;

export const SEND_MESSAGE = gql`
  mutation SendMessage($conversationId: ID!, $content: String!) {
    sendMessage(conversationId: $conversationId, content: $content) {
      id
      conversationId
      content
      role
      timestamp
      isComplete
    }
  }
`;

// Subscriptions
export const ON_NEW_MESSAGE = gql`
  subscription OnNewMessage($conversationId: ID!) {
    onNewMessage(conversationId: $conversationId) {
      id
      conversationId
      content
      role
      timestamp
      isComplete
    }
  }
`;

export const ON_MESSAGE_UPDATE = gql`
  subscription OnMessageUpdate($conversationId: ID!) {
    onMessageUpdate(conversationId: $conversationId) {
      messageId
      conversationId
      content
      isComplete
      timestamp
    }
  }
`;
