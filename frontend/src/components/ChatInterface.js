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
      
      // Get the current messages from state
      const currentMessages = [...messages];
      
      // Add the user message to our local state directly
      // This ensures the user message appears immediately
      const userMessage = Array.isArray(data.sendMessage) ? data.sendMessage[0] : data.sendMessage;
      
      // Add the user message to our local state directly using the functional state update
      // This ensures we're working with the latest state
      console.log('Adding user message to local state:', userMessage);
      setMessages(prevMessages => {
        // Check if the message already exists in our state
        const messageExists = prevMessages.some(msg => msg.id === userMessage.id);
        if (!messageExists) {
          // Create a map of message IDs to messages for easy lookup
          const messageMap = new Map();
          
          // First add all existing messages to the map
          prevMessages.forEach(msg => {
            messageMap.set(msg.id, msg);
          });
          
          // Then add the new user message
          messageMap.set(userMessage.id, userMessage);
          
          // Convert back to array and sort by timestamp
          const mergedMessages = Array.from(messageMap.values())
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
          
          console.log('Merged messages with new user message:', mergedMessages);
          return mergedMessages;
        }
        return prevMessages;
      });
      
      // Create a placeholder assistant message with a timestamp
      const now = Date.now();
      const placeholderMessage = {
        id: `placeholder-${now}`,
        conversationId: conversation.id,
        content: "...",
        role: 'assistant',
        timestamp: new Date().toISOString(),
        isComplete: false,
        createdAt: now // Add a timestamp to track when this placeholder was created
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
          
          // Update our local state directly, preserving existing messages
          console.log('Updating local state with placeholder message');
          setMessages(prevMessages => {
            // Create a map of message IDs to messages for easy lookup
            const messageMap = new Map();
            
            // First add all existing messages to the map
            prevMessages.forEach(msg => {
              messageMap.set(msg.id, msg);
            });
            
            // Then add the placeholder message
            messageMap.set(placeholderMessage.id, placeholderMessage);
            
            // Convert back to array and sort by timestamp
            const mergedMessages = Array.from(messageMap.values())
              .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            
            console.log('Merged messages with placeholder:', mergedMessages);
            return mergedMessages;
          });
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
            
            // Update our local state directly, preserving existing messages
            console.log('Updating local state with new assistant message');
            setMessages(prevMessages => {
              // Create a map of message IDs to messages for easy lookup
              const messageMap = new Map();
              
              // First add all existing messages to the map
              prevMessages.forEach(msg => {
                messageMap.set(msg.id, msg);
              });
              
              // Then add the new message
              messageMap.set(newMessage.id, newMessage);
              
              // Convert back to array and sort by timestamp
              const mergedMessages = Array.from(messageMap.values())
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
              
              console.log('Merged messages with new assistant message:', mergedMessages);
              return mergedMessages;
            });
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
          // First, look for recent placeholder messages (they start with "placeholder-")
          // Only consider placeholders created in the last 10 seconds
          const now = Date.now();
          const recentPlaceholderIndex = getMessages.findIndex(msg => 
            msg.role === 'assistant' && 
            msg.id.startsWith('placeholder-') && 
            (msg.content === "..." || !msg.isComplete) &&
            // Only update placeholders created in the last 10 seconds
            (msg.createdAt && (now - msg.createdAt < 10000))
          );
          
          if (recentPlaceholderIndex >= 0) {
            messageIndex = recentPlaceholderIndex;
            foundMessage = 'recent-placeholder';
          } else {
            // If no recent placeholder, check if this is a new message that needs its own bubble
            // If the message ID doesn't match any existing message and there's no recent placeholder,
            // we should create a new message instead of updating an existing one
            const messageExists = getMessages.some(msg => msg.id === update.messageId);
            
            if (!messageExists && update.content && update.content !== "...") {
              // This is a new message that needs its own bubble
              console.log('Creating new message bubble for:', update);
              
              // Create a new message object
              const newMessage = {
                id: update.messageId,
                conversationId: conversation.id,
                content: update.content,
                role: 'assistant',
                timestamp: update.timestamp || new Date().toISOString(),
                isComplete: update.isComplete,
                __typename: 'Message'
              };
              
              // Add the new message to the cache
              const updatedMessages = [...getMessages, newMessage];
              
              // Update the cache
              client.writeQuery({
                query: GET_MESSAGES,
                variables: { conversationId: conversation.id },
                data: {
                  getMessages: updatedMessages
                }
              });
              
              // Update our local state directly, preserving existing messages
              console.log('Adding new message to local state:', newMessage);
              setMessages(prevMessages => {
                // Create a map of message IDs to messages for easy lookup
                const messageMap = new Map();
                
                // First add all existing messages to the map
                prevMessages.forEach(msg => {
                  messageMap.set(msg.id, msg);
                });
                
                // Then add the new message
                messageMap.set(newMessage.id, newMessage);
                
                // Convert back to array and sort by timestamp
                const mergedMessages = Array.from(messageMap.values())
                  .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                
                console.log('Merged messages with new message bubble:', mergedMessages);
                return mergedMessages;
              });
              
              // Skip the rest of the update logic
              return;
            }
          }
          
          // If no recent placeholder or new message, try to find by content
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
        } else {
          foundMessage = 'by-id';
        }
        
        console.log(`Found message ${foundMessage ? 'using ' + foundMessage : 'not found'}, index:`, messageIndex);
        
        if (messageIndex >= 0) {
          // Create a new array with the updated message
          const updatedMessages = [...getMessages];
          
          // If we found a placeholder, update its ID to match the real message ID
          // This will help future updates find it by ID
          if (foundMessage === 'placeholder' || foundMessage === 'recent-placeholder') {
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
          
          // Remove any duplicate messages and placeholders when we have a complete message
          const uniqueMessages = newMessages.filter((msg, idx, self) => {
            // If this is a placeholder and we have a complete message with the same content or from the same update, remove it
            if (msg.id.startsWith('placeholder-')) {
              // Check if we have a complete message that should replace this placeholder
              const hasCompleteMessage = self.some(m => 
                !m.id.startsWith('placeholder-') && 
                m.role === 'assistant' && 
                (m.id === update.messageId || 
                 (update.isComplete && m.content.includes(msg.content.replace('...', ''))))
              );
              
              if (hasCompleteMessage) {
                console.log('Removing placeholder message as we have a complete message:', msg.id);
                return false; // Remove this placeholder
              }
            }
            
            // Keep unique messages based on ID
            return idx === self.findIndex(m => m.id === msg.id);
          });
          
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
          // But we need to be careful to preserve all existing messages
          
          // Get the current state directly to ensure we have the latest
          setMessages(prevMessages => {
            console.log('Previous messages in state:', prevMessages);
            
            // Create a map of message IDs to messages for easy lookup
            const messageMap = new Map();
            
            // First add all existing messages to the map
            prevMessages.forEach(msg => {
              // Skip placeholders that are being replaced
              if (msg.id.startsWith('placeholder-') && 
                  uniqueMessages.some(m => m.role === 'assistant' && m.isComplete)) {
                console.log('Skipping placeholder in state merge:', msg.id);
                return;
              }
              messageMap.set(msg.id, msg);
            });
            
            // Then add or update with messages from the update
            uniqueMessages.forEach(msg => {
              messageMap.set(msg.id, msg);
            });
            
            // Convert back to array and sort by timestamp
            const mergedMessages = Array.from(messageMap.values())
              .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            
            console.log('Merged messages:', mergedMessages);
            return mergedMessages;
          });
          
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
  
  // Cleanup effect to remove placeholder messages when we have complete messages
  useEffect(() => {
    // Only run this cleanup if we have messages
    if (messages.length === 0) return;
    
    // Check if we have any placeholder messages
    const hasPlaceholders = messages.some(msg => 
      msg.id.startsWith('placeholder-') && msg.content === "..."
    );
    
    // Check if we have any complete assistant messages
    const hasCompleteMessages = messages.some(msg => 
      msg.role === 'assistant' && !msg.id.startsWith('placeholder-') && msg.isComplete
    );
    
    // If we have both placeholders and complete messages, clean up the placeholders
    if (hasPlaceholders && hasCompleteMessages) {
      console.log('Cleaning up placeholder messages');
      
      // Filter out placeholder messages
      const cleanedMessages = messages.filter(msg => 
        // Keep all non-placeholder messages
        !msg.id.startsWith('placeholder-') || 
        // Or keep placeholders that aren't just "..."
        (msg.id.startsWith('placeholder-') && msg.content !== "...")
      );
      
      // Update our state with the cleaned messages
      if (cleanedMessages.length !== messages.length) {
        console.log('Removed placeholder messages:', messages.length - cleanedMessages.length);
        setMessages(cleanedMessages);
        
        // Also update the cache
        try {
          client.writeQuery({
            query: GET_MESSAGES,
            variables: { conversationId: conversation.id },
            data: {
              getMessages: cleanedMessages
            }
          });
        } catch (error) {
          console.error('Error updating cache with cleaned messages:', error);
        }
      }
    }
  }, [messages, conversation.id, client]);

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
