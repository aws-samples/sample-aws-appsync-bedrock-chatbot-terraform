import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import MessageBubble from './MessageBubble';

// This component handles rendering messages and updating them efficiently
// without causing the entire list to re-render and reset scroll position
const MessageList = forwardRef(({ messages, onScroll }, ref) => {
  // Use a ref to store the message map for efficient updates
  const messageMapRef = useRef(new Map());
  // Use state only for forcing re-renders when needed
  const [updateCounter, setUpdateCounter] = useState(0);
  // Ref for the container element
  const containerRef = useRef(null);
  
  // Track if we should auto-scroll
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  
  // Function to check if user has manually scrolled up
  const checkShouldAutoScroll = () => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    // If we're within 30px of the bottom, we should auto-scroll
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 30;
    
    if (shouldAutoScroll !== isNearBottom) {
      setShouldAutoScroll(isNearBottom);
      
      console.log("Scroll position check:", {
        scrollHeight: container.scrollHeight,
        scrollTop: container.scrollTop,
        clientHeight: container.clientHeight,
        distanceFromBottom: container.scrollHeight - container.scrollTop - container.clientHeight,
        shouldAutoScroll: isNearBottom,
        timestamp: new Date().toISOString()
      });
      
      // Notify parent component about scroll state change
      if (onScroll) {
        onScroll(isNearBottom);
      }
    }
  };
  
  // Scroll to bottom function that respects user scroll position
  const scrollToBottom = () => {
    if (!shouldAutoScroll || !containerRef.current) return;
    
    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(() => {
      if (containerRef.current) {
        const prevScrollTop = containerRef.current.scrollTop;
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
        
        console.log("MessageList scrolled to bottom", {
          scrollHeight: containerRef.current.scrollHeight,
          prevScrollTop,
          newScrollTop: containerRef.current.scrollTop,
          shouldAutoScroll,
          timestamp: new Date().toISOString()
        });
      }
    });
  };
  
  // Update the message map when messages change
  useEffect(() => {
    // Create a new map to track current messages
    const newMap = new Map();
    
    // Add all messages to the map
    messages.forEach(message => {
      // Skip undefined messages or messages without IDs
      if (!message || !message.id) {
        console.log('Skipping undefined message or message without ID in MessageList');
        return;
      }
      newMap.set(message.id, message);
    });
    
    // Update the ref
    messageMapRef.current = newMap;
    
    // Force a re-render only if the message IDs have changed
    // This prevents unnecessary re-renders when only content changes
    const currentIds = Array.from(messageMapRef.current.keys()).join(',');
    const newIds = messages.filter(m => m && m.id).map(m => m.id).join(',');
    
    if (currentIds !== newIds) {
      console.log("Message IDs changed, forcing re-render");
      setUpdateCounter(prev => prev + 1);
    }
    
    // Scroll to bottom after messages are updated
    scrollToBottom();
  }, [messages]);
  
  // Add scroll event listener
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      console.log("Adding scroll event listener to MessageList container");
      container.addEventListener('scroll', checkShouldAutoScroll);
      
      // Set initial auto-scroll state
      checkShouldAutoScroll();
      
      return () => {
        console.log("Removing scroll event listener from MessageList container");
        container.removeEventListener('scroll', checkShouldAutoScroll);
      };
    }
  }, []);
  
  // Enable auto-scroll function for external use
  const enableAutoScroll = () => {
    setShouldAutoScroll(true);
    scrollToBottom();
  };
  
  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    scrollToBottom,
    enableAutoScroll,
    checkShouldAutoScroll
  }));
  
  // Filter out any undefined messages or messages without IDs
  const validMessages = messages.filter(msg => msg && msg.id);
  
  // Log any invalid messages that were filtered out
  if (validMessages.length < messages.length) {
    console.warn('MessageList filtered out invalid messages:', 
      messages.length - validMessages.length, 
      'messages were undefined or missing IDs');
  }
  
  return (
    <div 
      className="messages-container" 
      ref={containerRef}
      key={`message-list-${updateCounter}`}
    >
      {validMessages.length === 0 ? (
        <div className="empty-chat">
          <p>No messages yet. Start the conversation!</p>
        </div>
      ) : (
        <div className="messages">
          {validMessages.map((message) => (
            <MessageBubble 
              key={`${message.id}-${message.content?.length || 0}-${message.isComplete ? 'complete' : 'incomplete'}`} 
              message={message} 
            />
          ))}
        </div>
      )}
    </div>
  );
});

export default React.memo(MessageList);
