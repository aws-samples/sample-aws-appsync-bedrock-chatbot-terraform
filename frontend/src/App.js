import React, { useState, useEffect } from 'react';
import { ApolloProvider } from '@apollo/client';
import client from './graphql/client';
import ConversationList from './components/ConversationList';
import ChatInterface from './components/ChatInterface';
import './App.css';

function App() {
  const [selectedConversation, setSelectedConversation] = useState(null);

  // Handle conversation selection
  const handleSelectConversation = (conversation) => {
    setSelectedConversation(conversation);
  };

  return (
    <ApolloProvider client={client}>
      <div className="app">
        <header className="app-header">
          <h1>AWS GenAI Chatbot</h1>
        </header>
        <div className="app-container">
          <div className="sidebar">
            <ConversationList 
              onSelectConversation={handleSelectConversation}
              selectedConversationId={selectedConversation?.id}
            />
          </div>
          <div className="main-content">
            {selectedConversation ? (
              <ChatInterface conversation={selectedConversation} />
            ) : (
              <div className="empty-state">
                <p>Select a conversation or create a new one to start chatting</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </ApolloProvider>
  );
}

export default App;
