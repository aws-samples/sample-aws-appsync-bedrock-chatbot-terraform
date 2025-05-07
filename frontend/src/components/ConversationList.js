import React, { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { LIST_CONVERSATIONS, CREATE_CONVERSATION } from '../graphql/operations';
import './ConversationList.css';

function ConversationList({ onSelectConversation, selectedConversationId }) {
  const [newConversationTitle, setNewConversationTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Query to fetch all conversations
  const { loading, error, data, refetch } = useQuery(LIST_CONVERSATIONS);

  // Mutation to create a new conversation
  const [createConversation] = useMutation(CREATE_CONVERSATION, {
    onCompleted: (data) => {
      // Reset form and select the new conversation
      setNewConversationTitle('');
      setIsCreating(false);
      onSelectConversation(data.createConversation);
      refetch(); // Refresh the list
    },
    onError: (error) => {
      console.error('Error creating conversation:', error);
      alert('Failed to create conversation. Please try again.');
    }
  });

  // Handle form submission to create a new conversation
  const handleCreateConversation = (e) => {
    e.preventDefault();
    if (!newConversationTitle.trim()) return;

    createConversation({
      variables: {
        title: newConversationTitle
      }
    });
  };

  // Format date for display
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  if (loading) return <div className="loading">Loading conversations...</div>;
  if (error) return <div className="error">Error loading conversations: {error.message}</div>;

  // Sort conversations by updatedAt timestamp in descending order (newest first)
  const conversations = [...(data?.listConversations || [])].sort((a, b) => 
    new Date(b.updatedAt) - new Date(a.updatedAt)
  );

  return (
    <div className="conversation-list">
      <div className="conversation-list-header">
        <h2>Conversations</h2>
        <button 
          className="new-conversation-btn"
          onClick={() => setIsCreating(!isCreating)}
        >
          {isCreating ? 'Cancel' : 'New Chat'}
        </button>
      </div>

      {isCreating && (
        <form className="new-conversation-form" onSubmit={handleCreateConversation}>
          <input
            type="text"
            placeholder="Conversation title"
            value={newConversationTitle}
            onChange={(e) => setNewConversationTitle(e.target.value)}
            autoFocus
          />
          <button type="submit">Create</button>
        </form>
      )}

      {conversations.length === 0 ? (
        <div className="empty-list">No conversations yet</div>
      ) : (
        <ul className="conversations">
          {conversations.map((conversation) => (
            <li 
              key={conversation.id}
              className={`conversation-item ${selectedConversationId === conversation.id ? 'selected' : ''}`}
              onClick={() => onSelectConversation(conversation)}
            >
              <div className="conversation-title">{conversation.title || 'Untitled Conversation'}</div>
              <div className="conversation-date">{formatDate(conversation.updatedAt)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ConversationList;
