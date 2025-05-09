import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useSubscription, useApolloClient } from '@apollo/client';
import { GET_MESSAGES, SEND_MESSAGE, ON_NEW_MESSAGE, ON_MESSAGE_UPDATE } from '../graphql/operations';
import MessageList from './MessageList';
import './ChatInterface.css';

function ChatInterface({ conversation }) {
  const [messageInput, setMessageInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  // Add direct state management for messages
  const [messages, setMessages] = useState([]);
  const messagesEndRef = useRef(null);
  const client = useApolloClient();
  
  // Store the current conversation ID in a ref to detect changes
  const previousConversationIdRef = useRef(conversation?.id);
  
  // Clear messages when conversation changes
  useEffect(() => {
    // Check if conversation ID has changed
    if (previousConversationIdRef.current !== conversation.id) {
      console.log('Conversation changed from', previousConversationIdRef.current, 'to', conversation.id);
      console.log('Clearing messages state for new conversation');
      
      // Clear the messages state
      setMessages([]);
      
      // Update the ref with the new conversation ID
      previousConversationIdRef.current = conversation.id;
    }
  }, [conversation.id]);

  // Query to fetch messages for the current conversation
  const { loading, error, data, refetch } = useQuery(GET_MESSAGES, {
    variables: { conversationId: conversation.id },
    fetchPolicy: 'cache-and-network', // Use cache but also fetch from network
  });

  // Mutation to send a new message
  const [sendMessage] = useMutation(SEND_MESSAGE, {
    onCompleted: (data) => {
      // We've already cleared the input field and added a temporary user message
      // Just need to update the sending state
      setIsSending(false);
      
      // Log the sent message
      console.log('Message sent successfully:', data.sendMessage);
      
      // We're keeping the temporary user message, no need to replace it
      
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
          
          // We don't need to update the cache with the user message
          // since we've already added it to the state in handleSendMessage
          // This update callback is mainly for the server to acknowledge the message
          
          // Log the server response for debugging
          const messages = Array.isArray(data.sendMessage) ? data.sendMessage : [data.sendMessage];
          console.log('Server acknowledged messages:', messages);
          
          // We're keeping our temporary user messages, no need to update the cache
        } catch (error) {
          console.error('Error in update callback:', error);
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
              
              // Force scroll to bottom when a new message is added
              setTimeout(forceScrollToBottom, 50);
              
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
      console.log('Subscription received message update:', update, {
        timestamp: new Date().toISOString(),
        contentLength: update.content ? update.content.length : 0,
        isComplete: update.isComplete
      });
      
      try {
        // Get the current messages from the cache
        const currentData = client.readQuery({
          query: GET_MESSAGES,
          variables: { conversationId: conversation.id }
        });
        
        const getMessages = currentData?.getMessages || [];
        console.log('Current messages in cache:', getMessages, {
          count: getMessages.length,
          containerScrollHeight: document.querySelector('.messages-container')?.scrollHeight,
          containerScrollTop: document.querySelector('.messages-container')?.scrollTop,
          timestamp: new Date().toISOString()
        });
        
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
          
          console.log('UPDATED MESSAGE OBJECT:', updatedMessage, {
            contentLength: updatedMessage.content ? updatedMessage.content.length : 0,
            contentPreview: updatedMessage.content ? updatedMessage.content.substring(0, 50) + '...' : '',
            timestamp: new Date().toISOString()
          });
          
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
            
            console.log('Merged messages:', mergedMessages, {
              count: mergedMessages.length,
              lastMessage: mergedMessages.length > 0 ? {
                id: mergedMessages[mergedMessages.length - 1].id,
                role: mergedMessages[mergedMessages.length - 1].role,
                contentLength: mergedMessages[mergedMessages.length - 1].content ? mergedMessages[mergedMessages.length - 1].content.length : 0
              } : null,
              timestamp: new Date().toISOString()
            });
            
            // Force scroll to bottom after message update
            setTimeout(() => {
              console.log("Forcing scroll after message update");
              forceScrollToBottom();
            }, 50);
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

  
  // Track if we should auto-scroll (user hasn't manually scrolled up)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  
  // Function to check if user has manually scrolled up
  const checkShouldAutoScroll = () => {
    const container = document.querySelector('.messages-container');
    if (container) {
      // If we're within 30px of the bottom, we should auto-scroll
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 30;
      setShouldAutoScroll(isNearBottom);
      
      console.log("Scroll position check:", {
        scrollHeight: container.scrollHeight,
        scrollTop: container.scrollTop,
        clientHeight: container.clientHeight,
        distanceFromBottom: container.scrollHeight - container.scrollTop - container.clientHeight,
        shouldAutoScroll: isNearBottom,
        timestamp: new Date().toISOString()
      });
    }
  };
  
  // Scroll to bottom when messages change
  useEffect(() => {
    // Use direct DOM manipulation with a small delay to ensure DOM has updated
    setTimeout(forceScrollToBottom, 50);
  }, [data, subscriptionData, messageUpdateData, messages]);
  
  // Force re-render when messages change
  const [forceUpdate, setForceUpdate] = useState(0);
  useEffect(() => {
    // This will force a re-render of the component
    const timer = setTimeout(() => {
      setForceUpdate(prev => prev + 1);
      
      // Add an additional scroll check after the re-render
      console.log("Force update triggered, checking scroll position");
      const container = document.querySelector('.messages-container');
      if (container) {
        console.log("Container scroll metrics:", {
          scrollHeight: container.scrollHeight,
          clientHeight: container.clientHeight,
          scrollTop: container.scrollTop,
          bottomPosition: container.scrollHeight - container.clientHeight - container.scrollTop,
          timestamp: new Date().toISOString()
        });
      }
      
      // Try to scroll again after the update using direct DOM manipulation
      console.log("Attempting scroll after force update");
      forceScrollToBottom();
    }, 100); // Small delay to ensure cache is updated
    
    return () => clearTimeout(timer);
  }, [messageUpdateData]);
  
  // Use the MessageList's scrollToBottom method
  const forceScrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollToBottom();
    }
  };
  

  // Handle form submission to send a new message
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!messageInput.trim() || isSending) return;

    setIsSending(true);
    
    // Create a temporary user message to display immediately
    const tempUserMessage = {
      id: `temp-user-${Date.now()}`,
      conversationId: conversation.id,
      content: messageInput,
      role: 'user',
      timestamp: new Date().toISOString(),
      isComplete: true
    };
    
    // Add the user message to the state immediately
    console.log('Adding temporary user message to local state:', tempUserMessage);
    setMessages(prevMessages => {
      // Create a map of message IDs to messages for easy lookup
      const messageMap = new Map();
      
      // First add all existing messages to the map
      prevMessages.forEach(msg => {
        messageMap.set(msg.id, msg);
      });
      
      // Then add the new user message
      messageMap.set(tempUserMessage.id, tempUserMessage);
      
      // Convert back to array and sort by timestamp
      const mergedMessages = Array.from(messageMap.values())
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      return mergedMessages;
    });
    
    // Store the message input before clearing it
    const sentMessageContent = messageInput;
    
    // Clear the input field immediately for better UX
    setMessageInput('');
    
    // Then send the message to the server
    sendMessage({
      variables: {
        conversationId: conversation.id,
        content: sentMessageContent
      }
    });
  };

  // Update messages state when data changes - improved to merge with existing messages
  useEffect(() => {
    if (data?.getMessages) {
      // Enhanced logging to debug message display issues
      console.log('Received messages from query:', {
        count: data.getMessages.length,
        messages: data.getMessages.map(msg => ({
          id: msg.id,
          role: msg.role,
          contentPreview: msg.content ? (msg.content.length > 20 ? msg.content.substring(0, 20) + '...' : msg.content) : null,
          timestamp: msg.timestamp,
          isComplete: msg.isComplete
        }))
      });
      
      // Merge with existing messages instead of replacing
      setMessages(prevMessages => {
        // Create a map of message IDs to messages for easy lookup
        const messageMap = new Map();
        
        // First add all existing messages to the map
        prevMessages.forEach(msg => {
          messageMap.set(msg.id, msg);
        });
        
        // Then add or update with messages from the query
        data.getMessages.forEach(msg => {
          // Only update if the message doesn't exist or if it's more complete
          if (!messageMap.has(msg.id) || 
              (messageMap.get(msg.id).isComplete === false && msg.isComplete === true)) {
            messageMap.set(msg.id, msg);
          }
        });
        
        // Convert back to array and sort by timestamp
        const mergedMessages = Array.from(messageMap.values())
          .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        console.log('Merged messages after query update:', {
          count: mergedMessages.length,
          byRole: {
            user: mergedMessages.filter(msg => msg.role === 'user').length,
            assistant: mergedMessages.filter(msg => msg.role === 'assistant').length
          },
          placeholders: mergedMessages.filter(msg => msg.id.startsWith('placeholder-')).length
        });
        
        return mergedMessages;
      });
    }
  }, [data]);
  
  // Debug effect to monitor message content changes and log all messages
  useEffect(() => {
    if (messages.length > 0) {
      const assistantMessages = messages.filter(msg => msg.role === 'assistant');
      if (assistantMessages.length > 0) {
        const lastAssistantMsg = assistantMessages[assistantMessages.length - 1];
        console.log("Last assistant message content changed:", {
          id: lastAssistantMsg.id,
          contentLength: lastAssistantMsg.content ? lastAssistantMsg.content.length : 0,
          isComplete: lastAssistantMsg.isComplete,
          timestamp: new Date().toISOString()
        });
      }
      
      // Log all messages for debugging
      console.log("Current messages in state:", {
        count: messages.length,
        byRole: {
          user: messages.filter(msg => msg.role === 'user').length,
          assistant: messages.filter(msg => msg.role === 'assistant').length
        },
        messages: messages.map(msg => ({
          id: msg.id,
          role: msg.role,
          contentPreview: msg.content ? (msg.content.length > 20 ? msg.content.substring(0, 20) + '...' : msg.content) : null,
          timestamp: msg.timestamp,
          isComplete: msg.isComplete
        }))
      });
    }
  }, [messages.map(msg => msg.role === 'assistant' ? msg.content : null).join('|')]);
  
  // Add scroll event listener to detect manual scrolling
  useEffect(() => {
    const container = document.querySelector('.messages-container');
    if (container) {
      console.log("Adding scroll event listener to messages container");
      container.addEventListener('scroll', checkShouldAutoScroll);
      
      // Set initial auto-scroll state
      checkShouldAutoScroll();
      
      // Clean up the event listener when the component unmounts
      return () => {
        console.log("Removing scroll event listener from messages container");
        container.removeEventListener('scroll', checkShouldAutoScroll);
      };
    }
  }, []);
  
  // Improved cleanup effect to remove only empty placeholder messages
  useEffect(() => {
    // Only run this cleanup if we have messages
    if (messages.length === 0) return;
    
    // Check if we have any empty placeholder messages
    const emptyPlaceholders = messages.filter(msg => 
      msg.id.startsWith('placeholder-') && 
      msg.content === "..." &&
      msg.role === 'assistant'
    );
    
    // Check if we have any complete assistant messages that were created after the placeholders
    if (emptyPlaceholders.length > 0) {
      const completeMessages = messages.filter(msg => 
        msg.role === 'assistant' && 
        !msg.id.startsWith('placeholder-') && 
        msg.isComplete === true
      );
      
      // Only remove placeholders if we have complete messages that came after them
      if (completeMessages.length > 0) {
        console.log('Found complete messages that can replace placeholders:', 
          completeMessages.length, 'complete messages,', emptyPlaceholders.length, 'placeholders');
        
        // For each placeholder, check if there's a newer complete message
        const placeholdersToRemove = emptyPlaceholders.filter(placeholder => {
          const placeholderTime = new Date(placeholder.timestamp).getTime();
          
          // Check if there's a complete message that was created after this placeholder
          return completeMessages.some(complete => {
            const completeTime = new Date(complete.timestamp).getTime();
            return completeTime > placeholderTime;
          });
        });
        
        if (placeholdersToRemove.length > 0) {
          console.log('Removing', placeholdersToRemove.length, 'placeholder messages that have been replaced');
          
          // Create a new array without the placeholders to remove
          const cleanedMessages = messages.filter(msg => 
            !placeholdersToRemove.some(placeholder => placeholder.id === msg.id)
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
      {/* Replace the messages container with our new MessageList component */}
      <MessageList 
        messages={messages}
        onScroll={(isNearBottom) => setShouldAutoScroll(isNearBottom)}
        ref={messagesEndRef}
      />

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
