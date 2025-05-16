import { gql } from '@apollo/client';

// Queries
// Document queries
export const LIST_USER_DOCUMENTS = gql`
  query ListUserDocuments {
    listUserDocuments {
      id
      userId
      documentName
      documentType
      uploadTimestamp
      status
      size
      pageCount
    }
  }
`;

export const GET_DOCUMENT = gql`
  query GetDocument($id: ID!) {
    getDocument(id: $id) {
      id
      userId
      documentName
      documentType
      uploadTimestamp
      status
      size
      pageCount
    }
  }
`;

// Conversation queries
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
// Document mutations
export const GET_DOCUMENT_UPLOAD_URL = gql`
  mutation GetDocumentUploadUrl($fileName: String!, $contentType: String!) {
    getDocumentUploadUrl(fileName: $fileName, contentType: $contentType) {
      uploadUrl
      documentId
    }
  }
`;

export const DELETE_USER_DOCUMENT = gql`
  mutation DeleteUserDocument($id: ID!) {
    deleteUserDocument(id: $id)
  }
`;

export const ASK_DOCUMENT_QUESTION = gql`
  mutation AskDocumentQuestion($documentIds: [ID!]!, $question: String!) {
    askDocumentQuestion(documentIds: $documentIds, question: $question) {
      id
      conversationId
      content
      role
      timestamp
      isComplete
    }
  }
`;

// Conversation mutations
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
