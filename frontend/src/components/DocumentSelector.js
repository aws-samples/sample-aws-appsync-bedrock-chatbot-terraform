import React, { useState } from 'react';
import { useMutation } from '@apollo/client';
import { ASK_DOCUMENT_QUESTION } from '../graphql/operations';
import DocumentLibrary from './DocumentLibrary';
import DocumentUpload from './DocumentUpload';
import './DocumentSelector.css';

function DocumentSelector({ conversationId, onQuestionSubmit }) {
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [question, setQuestion] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDocumentPanel, setShowDocumentPanel] = useState(false);
  
  // Mutation to ask a question about documents
  const [askDocumentQuestion] = useMutation(ASK_DOCUMENT_QUESTION, {
    onCompleted: (data) => {
      setIsSubmitting(false);
      setQuestion('');
      
      // Close the document panel after submitting
      setShowDocumentPanel(false);
      
      // Call the parent component's handler if provided
      if (onQuestionSubmit) {
        onQuestionSubmit(data.askDocumentQuestion);
      }
    },
    onError: (error) => {
      console.error('Error asking document question:', error);
      alert('Failed to submit question. Please try again.');
      setIsSubmitting(false);
    }
  });
  
  // Handle document selection
  const handleDocumentSelect = (documents) => {
    setSelectedDocuments(documents);
  };
  
  // Handle upload completion
  const handleUploadComplete = (documentId) => {
    // Refresh the document library
    // This will be handled by the Apollo cache update
  };
  
  // Handle question submission
  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!question.trim() || selectedDocuments.length === 0 || isSubmitting) {
      return;
    }
    
    setIsSubmitting(true);
    
    // Extract document IDs
    const documentIds = selectedDocuments.map(doc => doc.id);
    
    // Submit the question
    askDocumentQuestion({
      variables: {
        documentIds,
        question
      }
    });
  };
  
  // Toggle document panel visibility
  const toggleDocumentPanel = () => {
    setShowDocumentPanel(!showDocumentPanel);
  };
  
  return (
    <div className="document-selector">
      <button 
        className={`document-toggle-button ${showDocumentPanel ? 'active' : ''} ${selectedDocuments.length > 0 ? 'has-selected' : ''}`}
        onClick={toggleDocumentPanel}
        title={showDocumentPanel ? 'Hide documents' : 'Show documents'}
      >
        {showDocumentPanel ? 'Hide Documents' : 'Documents'}
        {selectedDocuments.length > 0 && (
          <span className="selected-count">{selectedDocuments.length}</span>
        )}
      </button>
      
      {showDocumentPanel && (
        <div className="document-panel">
          <DocumentUpload onUploadComplete={handleUploadComplete} />
          <DocumentLibrary onSelectDocument={handleDocumentSelect} />
          
          <div className="document-question-form">
            <form onSubmit={handleSubmit}>
              <input
                type="text"
                placeholder={`Ask a question about ${selectedDocuments.length > 0 ? 'selected documents' : 'your documents'}`}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                disabled={selectedDocuments.length === 0 || isSubmitting}
              />
              <button 
                type="submit" 
                disabled={!question.trim() || selectedDocuments.length === 0 || isSubmitting}
              >
                {isSubmitting ? 'Asking...' : 'Ask'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default DocumentSelector;
