import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useSubscription, useApolloClient } from '@apollo/client';
import { GET_MESSAGES, SEND_MESSAGE, ON_NEW_MESSAGE, ON_MESSAGE_UPDATE } from '../graphql/operations';
import MessageBubble from './MessageBubble';
import './ChatInterface.css';

function ChatInterface({ conversation }) {
  const [messageInput, setMessageInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  // Add direct state management for messages
  const [messages, setMessages] = useState([]);
  const messagesEndRef = useRef(null);
  const client = useApolloClient();

  // Query to fetch messages for the current conversation
  const { loading, error, data, refetch } = useQuery(GET_MESSAGES, {
    variables: { conversationId: conversation.id },
    fetchPolicy: 'cache-and-network', // Use cache but also fetch from network
  });

  // Mutation to send a new message
  const [sendMessage] = useMutation(SEND_MESSAGE, {
    onCompleted: (data) => {
      setMessageInput('');
      setIsSending(false);
      
      // Log the sent message
      console.log('Message sent successfully:', data.sendMessage);
      
      // Create a placeholder assistant message
      const placeholderMessage = {
        id: `placeholder-${Date.now()}`,
        conversationId: conversation.id,
        content: "...",
        role: 'assistant',
        timestamp: new Date().toISOString(),
        isComplete: false
      };
      
      // Add the placeholder message to the cache
      try {
        const cache = client.cache;
        const currentData = cache.readQuery({
          query: GET_MESSAGES,
          variables: { conversationId: conversation.id }
        });
        
        const getMessages = currentData?.getMessages || [];
        
        // Check if a placeholder already exists
        const placeholderExists = getMessages.some(msg => 
          msg.role === 'assistant' && msg.content === "..." && !msg.isComplete
        );
        
        if (!placeholderExists) {
          console.log('Adding placeholder assistant message to cache:', placeholderMessage);
          const updatedMessages = [...getMessages, placeholderMessage];
          
          // Update the cache
          cache.writeQuery({
            query: GET_MESSAGES,
            variables: { conversationId: conversation.id },
            data: {
              getMessages: updatedMessages
            }
          });
          
          // Update our local state directly
          console.log('Updating local state with placeholder message');
          setMessages(updatedMessages);
        }
      } catch (error) {
        console.error('Error adding placeholder message to cache:', error);
      }
    },
    onError: (error) => {
      console.error('Error sending message:', error);
      alert('Failed to send message. Please try again.');
      setIsSending(false);
    },
    update: (cache, { data }) => {
      if (data?.sendMessage) {
        try {
          // Read the current messages from the cache
          const currentData = cache.readQuery({
            query: GET_MESSAGES,
            variables: { conversationId: conversation.id }
          });
          
          const getMessages = currentData?.getMessages || [];
          
          // Handle both single message and array of messages
          const messages = Array.isArray(data.sendMessage) ? data.sendMessage : [data.sendMessage];
          console.log('Messages from sendMessage mutation:', messages);
          
          // Add each message to the cache if it doesn't already exist
          let updatedMessages = [...getMessages];
          messages.forEach(message => {
            // Check if the message already exists in the cache
            const messageExists = getMessages.some(msg => msg.id === message.id);
            
            // If it's a new message, add it to the cache
            if (!messageExists) {
              console.log('Adding message to cache:', message);
              updatedMessages.push(message);
            }
          });
          
          // Update the cache with all messages
          cache.writeQuery({
            query: GET_MESSAGES,
            variables: { conversationId: conversation.id },
            data: {
              getMessages: updatedMessages
            }
          });
        } catch (error) {
          console.error('Error updating cache with messages:', error);
        }
      }
    }
  });

  // Subscription for real-time messages with direct cache update
  const { data: subscriptionData } = useSubscription(ON_NEW_MESSAGE, {
    variables: { conversationId: conversation.id },
    onSubscriptionData: ({ subscriptionData, client }) => {
      // When we receive a new message via subscription
      const newMessage = subscriptionData.data.onNewMessage;
      console.log('Subscription received new message:', newMessage);
      
      // Only process assistant messages (we already have the user message)
      if (newMessage.role === 'assistant') {
        try {
          // Get the current messages from the cache
          const currentData = client.readQuery({
            query: GET_MESSAGES,
            variables: { conversationId: conversation.id }
          });
          
          const getMessages = currentData?.getMessages || [];
          
          // Check if the message already exists in the cache
          const messageExists = getMessages.some(msg => msg.id === newMessage.id);
          
          // If it's a new message, update the cache
          if (!messageExists) {
            console.log('Adding new assistant message to cache:', newMessage);
            const updatedMessages = [...getMessages, newMessage];
            
            // Update the cache
            client.writeQuery({
              query: GET_MESSAGES,
              variables: { conversationId: conversation.id },
              data: {
                getMessages: updatedMessages
              }
            });
            
            // Update our local state directly
            console.log('Updating local state with new assistant message');
            setMessages(updatedMessages);
          }
        } catch (error) {
          console.error('Error updating cache with subscription data:', error);
          // Fallback to refetch if cache update fails
          refetch();
        }
      }
    }
  });

  // Subscription for streaming message updates
  const { data: messageUpdateData } = useSubscription(ON_MESSAGE_UPDATE, {
    variables: { conversationId: conversation.id },
    onSubscriptionData: ({ subscriptionData, client }) => {
      // When we receive a message update via subscription
      const update = subscriptionData.data.onMessageUpdate;
      console.log('Subscription received message update:', update);
      
      try {
        // Get the current messages from the cache
        const currentData = client.readQuery({
          query: GET_MESSAGES,
          variables: { conversationId: conversation.id }
        });
        
        const getMessages = currentData?.getMessages || [];
        console.log('Current messages in cache:', getMessages);
        
        // Debug message IDs
        console.log('Looking for message with ID:', update.messageId);
        console.log('Message IDs in cache:', getMessages.map(msg => msg.id));
        
        // Try to find the message by ID first
        let messageIndex = getMessages.findIndex(msg => msg.id === update.messageId);
        let foundMessage = null;
        
        // If not found by ID, try to find the most recent assistant message or placeholder
        if (messageIndex < 0) {
          // First, look for placeholder messages (they start with "placeholder-")
          const placeholderIndex = getMessages.findIndex(msg => 
            msg.role === 'assistant' && 
            msg.id.startsWith('placeholder-') && 
            (msg.content === "..." || !msg.isComplete)
          );
          
          if (placeholderIndex >= 0) {
            messageIndex = placeholderIndex;
            foundMessage = 'placeholder';
          } else {
            // If no placeholder, try to find by content
            const contentIndex = getMessages.findIndex(msg => 
              msg.role === 'assistant' && 
              (msg.content === "..." || 
               (update.content && msg.content.startsWith(update.content.substring(0, 10))))
            );
            
            if (contentIndex >= 0) {
              messageIndex = contentIndex;
              foundMessage = 'by-content';
            } else {
              // Last resort: get the most recent assistant message
              const assistantMessages = getMessages.filter(msg => msg.role === 'assistant');
              if (assistantMessages.length > 0) {
                // Find the index in the original array
                const lastAssistantMsg = assistantMessages[assistantMessages.length - 1];
                messageIndex = getMessages.findIndex(msg => msg.id === lastAssistantMsg.id);
                foundMessage = 'last-assistant';
              }
            }
          }
        } else {
          foundMessage = 'by-id';
        }
        
        console.log(`Found message ${foundMessage ? 'using ' + foundMessage : 'not found'}, index:`, messageIndex);
        
        if (messageIndex >= 0) {
          // Create a new array with the updated message
          const updatedMessages = [...getMessages];
          
          // If we found a placeholder, update its ID to match the real message ID
          // This will help future updates find it by ID
          if (foundMessage === 'placeholder') {
            console.log(`Updating placeholder ID ${updatedMessages[messageIndex].id} to real message ID ${update.messageId}`);
          }
          
          // Create a completely new object to ensure React detects the change
          const originalMessage = updatedMessages[messageIndex];
          
          // Create a completely new message object
          const updatedMessage = {
            ...originalMessage,
            id: update.messageId, // Update the ID to match the real message ID
            content: update.content,
            isComplete: update.isComplete,
            __typename: originalMessage.__typename || 'Message', // Preserve __typename for Apollo cache
            _lastUpdated: Date.now() // Add a timestamp to force React to detect the change
          };
          
          console.log('UPDATED MESSAGE OBJECT:', updatedMessage);
          
          // Create a completely new array with the updated message
          let newMessages = [...getMessages];
          newMessages[messageIndex] = updatedMessage;
          
          // Remove any duplicate messages (this can happen if we have both placeholder and real message)
          const uniqueMessages = newMessages.filter((msg, idx, self) => 
            idx === self.findIndex(m => (
              // Consider messages with the same ID or where one is a placeholder for the other
              m.id === msg.id || 
              (msg.id.startsWith('placeholder-') && m.id === update.messageId) ||
              (m.id === update.messageId && msg.id.startsWith('placeholder-'))
            ))
          );
          
          console.log('Updating message in cache with ID:', updatedMessage.id);
          console.log('Total messages in updated cache:', uniqueMessages.length);
          
          // Update the cache with the unique messages
          client.writeQuery({
            query: GET_MESSAGES,
            variables: { conversationId: conversation.id },
            data: {
              getMessages: uniqueMessages
            }
          });
          
          // IMPORTANT: Update our local state directly with the updated messages
          // This ensures the UI will update regardless of cache issues
          console.log('Updating local state with new messages:', uniqueMessages);
          setMessages(uniqueMessages);
          
          // Force a re-render by updating the forceUpdate state
          setForceUpdate(prev => prev + 1);
          
          // Force a re-render by updating a state variable
          // This is a workaround for cases where Apollo cache updates don't trigger re-renders
          setIsSending(false);
        } else {
          // Message not found in cache, refetch
          console.warn('Message not found in cache, refetching...');
          refetch();
        }
      } catch (error) {
        console.error('Error updating message in cache:', error);
        // Fallback to refetch if cache update fails
        refetch();
      }
    }
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data, subscriptionData, messageUpdateData]);
  
  // Force re-render when messages change
  const [forceUpdate, setForceUpdate] = useState(0);
  useEffect(() => {
    // This will force a re-render of the component
    const timer = setTimeout(() => {
      setForceUpdate(prev => prev + 1);
    }, 100); // Small delay to ensure cache is updated
    
    return () => clearTimeout(timer);
  }, [messageUpdateData]);

  // Handle form submission to send a new message
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!messageInput.trim() || isSending) return;

    setIsSending(true);
    sendMessage({
      variables: {
        conversationId: conversation.id,
        content: messageInput
      }
    });
  };

  // Update messages state when data changes
  useEffect(() => {
    if (data?.getMessages) {
      setMessages(data.getMessages);
    }
  }, [data]);

  if (loading) return <div className="loading">Loading messages...</div>;
  if (error) return <div className="error">Error loading messages: {error.message}</div>;

  return (
    <div className="chat-interface" key={`chat-${forceUpdate}`}>
      <div className="chat-header">
        <h2>{conversation.title || 'Untitled Conversation'}</h2>
      </div>

      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="empty-chat">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          <div className="messages">
            {messages.map((message) => (
              <MessageBubble 
                key={`${message.id}-${message.content.length}-${message.isComplete ? 'complete' : 'incomplete'}`} 
                message={message} 
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <form className="message-input-form" onSubmit={handleSendMessage}>
        <input
          type="text"
          placeholder="Type your message..."
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          disabled={isSending}
        />
        <button type="submit" disabled={isSending || !messageInput.trim()}>
          {isSending ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
}

export default ChatInterface;
