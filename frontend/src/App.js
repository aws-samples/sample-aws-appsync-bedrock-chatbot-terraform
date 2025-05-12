import React, { useState, useEffect, useRef } from 'react';
import { ApolloProvider, useApolloClient } from '@apollo/client';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import client from './graphql/client';
import ConversationList from './components/ConversationList';
import ChatInterface from './components/ChatInterface';
import Login from './components/Login';
import PrivateRoute from './auth/PrivateRoute';
import authService from './auth/authService';
import { GET_MESSAGES } from './graphql/operations';
import './App.css';

// Dashboard component that contains the main app functionality
function Dashboard() {
  const [selectedConversation, setSelectedConversation] = useState(null);
  const apolloClient = useApolloClient();
  const previousConversationRef = useRef(null);

  // Handle conversation selection with cache management
  const handleSelectConversation = (conversation) => {
    // If we're switching conversations, ensure the cache is properly managed
    if (previousConversationRef.current && previousConversationRef.current.id !== conversation.id) {
      console.log('Switching from conversation', previousConversationRef.current.id, 'to', conversation.id);
      
      // Update the selected conversation
      setSelectedConversation(conversation);
      
      // Update the ref
      previousConversationRef.current = conversation;
    } else {
      // First selection or same conversation
      setSelectedConversation(conversation);
      previousConversationRef.current = conversation;
    }
  };

  // Handle logout
  const handleLogout = () => {
    authService.logout();
    window.location.href = '/login';
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>AWS GenAI Chatbot</h1>
        <div className="user-info">
          <span>Welcome, {authService.getUsername()}</span>
          <button onClick={handleLogout} className="logout-button">Logout</button>
        </div>
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
            <ChatInterface 
              key={`chat-interface-${selectedConversation.id}`} 
              conversation={selectedConversation} 
            />
          ) : (
            <div className="empty-state">
              <p>Select a conversation or create a new one to start chatting</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Main App component that provides the Apollo client and routing
function App() {
  return (
    <ApolloProvider client={client}>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Navigate to="/conversations" replace />} />
          
          {/* Protected routes */}
          <Route element={<PrivateRoute />}>
            <Route path="/conversations" element={<Dashboard />} />
            <Route path="/conversations/:id" element={<Dashboard />} />
          </Route>
        </Routes>
      </Router>
    </ApolloProvider>
  );
}

export default App;
