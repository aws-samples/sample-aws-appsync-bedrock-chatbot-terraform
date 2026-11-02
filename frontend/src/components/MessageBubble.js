import React, { useState } from 'react';
import './MessageBubble.css';

// Enhanced component that renders messages with citation support
function MessageBubble({ message }) {
  const [showCitationDetails, setShowCitationDetails] = useState(null);
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

  // Parse message content for citations
  const renderMessageWithCitations = (content) => {
    if (!content) return null;
    
    // Regular expression to find citations in the format [doc:id:page]
    const citationRegex = /\[doc:([a-zA-Z0-9-]+)(?::(\d+))?\]/g;
    
    // Split the content by citations
    const parts = [];
    let lastIndex = 0;
    let match;
    
    // Find all citations and split the content
    while ((match = citationRegex.exec(content)) !== null) {
      // Add the text before the citation
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: content.substring(lastIndex, match.index)
        });
      }
      
      // Add the citation
      parts.push({
        type: 'citation',
        documentId: match[1],
        page: match[2] || null,
        original: match[0]
      });
      
      lastIndex = match.index + match[0].length;
    }
    
    // Add the remaining text after the last citation
    if (lastIndex < content.length) {
      parts.push({
        type: 'text',
        content: content.substring(lastIndex)
      });
    }
    
    // If no citations were found, return the original content
    if (parts.length === 0) {
      return content;
    }
    
    // Render the parts
    return parts.map((part, index) => {
      if (part.type === 'text') {
        return <span key={index}>{part.content}</span>;
      } else if (part.type === 'citation') {
        return (
          <span 
            key={index} 
            className="citation"
            onClick={() => setShowCitationDetails(part)}
            title="Click to view source"
          >
            [{part.page ? `${part.page}` : 'ref'}]
          </span>
        );
      }
      return null;
    });
  };
  
  // Handle closing the citation details
  const handleCloseCitationDetails = () => {
    setShowCitationDetails(null);
  };

  return (
    <div 
      className={`message-bubble ${isUserMessage ? 'user-message' : 'assistant-message'}`}
      data-message-id={message.id}
      data-content-length={message.content ? message.content.length : 0}
      data-is-placeholder={isPlaceholder ? 'true' : 'false'}
    >
      <div className="message-content">
        {renderMessageWithCitations(message.content)}
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
      
      {/* Citation details popup */}
      {showCitationDetails && (
        <div className="citation-details">
          <div className="citation-details-header">
            <h4>Source Document</h4>
            <button className="close-button" onClick={handleCloseCitationDetails}>×</button>
          </div>
          <div className="citation-details-content">
            <p><strong>Document ID:</strong> {showCitationDetails.documentId}</p>
            {showCitationDetails.page && (
              <p><strong>Page:</strong> {showCitationDetails.page}</p>
            )}
            <p className="citation-note">
              This citation references content from your uploaded document.
            </p>
          </div>
        </div>
      )}
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
