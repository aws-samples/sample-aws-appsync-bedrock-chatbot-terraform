import React from 'react';
import './MessageBubble.css';

// Simple pure component that renders exactly what it receives
function MessageBubble({ message }) {
  // Format timestamp for display
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Determine if the message is from the user or the AI assistant
  const isUserMessage = message.role === 'user';

  // Check if the message is still being generated (streaming)
  const isGenerating = message.role === 'assistant' && message.isComplete === false;
  
  // Check if this is a placeholder message (just "...")
  const isPlaceholder = message.role === 'assistant' && 
                        message.content === "..." && 
                        message.id && message.id.startsWith('placeholder-');
  
  // Log for debugging
  console.log('MessageBubble rendering:', {
    id: message.id || 'undefined-id',
    content: message.content || 'undefined-content',
    contentLength: message.content ? message.content.length : 0,
    isComplete: message.isComplete
  });

  // Don't render placeholder messages if they should be hidden
  if (isPlaceholder) {
    console.log('Skipping render of placeholder message:', message.id || 'undefined-id');
    return null;
  }
  
  // Safety check for undefined message properties
  if (!message || !message.content) {
    console.log('Skipping render of invalid message:', message);
    return null;
  }

  return (
    <div 
      className={`message-bubble ${isUserMessage ? 'user-message' : 'assistant-message'}`}
      data-message-id={message.id}
      data-content-length={message.content ? message.content.length : 0}
      data-is-placeholder={isPlaceholder ? 'true' : 'false'}
    >
      <div className="message-content">
        {message.content}
        {isGenerating && (
          <span className="typing-indicator">
            <span className="dot"></span>
            <span className="dot"></span>
            <span className="dot"></span>
          </span>
        )}
      </div>
      <div className="message-timestamp">
        {formatTimestamp(message.timestamp)}
      </div>
    </div>
  );
}

// Use React.memo to prevent unnecessary re-renders
export default React.memo(MessageBubble, (prevProps, nextProps) => {
  // Safety check for undefined messages
  if (!prevProps.message || !nextProps.message) {
    console.log('MessageBubble comparison received undefined message');
    return false; // Re-render to be safe
  }
  
  // Only re-render if content or completion status changes
  const prevContent = prevProps.message.content || '';
  const nextContent = nextProps.message.content || '';
  const contentChanged = prevContent !== nextContent;
  
  const prevComplete = prevProps.message.isComplete;
  const nextComplete = nextProps.message.isComplete;
  const completeChanged = prevComplete !== nextComplete;
  
  if (contentChanged || completeChanged) {
    console.log('MessageBubble will re-render:', {
      prevContent,
      nextContent,
      contentChanged,
      completeChanged
    });
    return false; // Return false to re-render
  }
  
  return true; // Return true to prevent re-render
});
