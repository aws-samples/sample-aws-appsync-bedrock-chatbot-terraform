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
                        message.id.startsWith('placeholder-');
  
  // Log for debugging
  console.log('MessageBubble rendering:', {
    id: message.id,
    content: message.content,
    contentLength: message.content ? message.content.length : 0,
    isComplete: message.isComplete
  });

  // Don't render placeholder messages if they should be hidden
  if (isPlaceholder) {
    console.log('Skipping render of placeholder message:', message.id);
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
  // Only re-render if content or completion status changes
  const contentChanged = prevProps.message.content !== nextProps.message.content;
  const completeChanged = prevProps.message.isComplete !== nextProps.message.isComplete;
  
  if (contentChanged || completeChanged) {
    console.log('MessageBubble will re-render:', {
      prevContent: prevProps.message.content,
      nextContent: nextProps.message.content,
      contentChanged,
      completeChanged
    });
    return false; // Return false to re-render
  }
  
  return true; // Return true to prevent re-render
});
