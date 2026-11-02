import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { LIST_USER_DOCUMENTS, DELETE_USER_DOCUMENT } from '../graphql/operations';
import './DocumentLibrary.css';

function DocumentLibrary({ onSelectDocument }) {
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  
  // Query to fetch user documents
  const { loading, error, data, refetch } = useQuery(LIST_USER_DOCUMENTS, {
    fetchPolicy: 'cache-and-network',
  });
  
  // Mutation to delete a document
  const [deleteDocument] = useMutation(DELETE_USER_DOCUMENT, {
    onCompleted: () => {
      // Refetch the documents list after deletion
      refetch();
    },
    onError: (error) => {
      console.error('Error deleting document:', error);
      alert('Failed to delete document. Please try again.');
    }
  });
  
  // Handle document selection
  const handleDocumentSelect = (document) => {
    // Check if document is already selected
    if (selectedDocuments.some(doc => doc.id === document.id)) {
      // If already selected, remove it
      setSelectedDocuments(selectedDocuments.filter(doc => doc.id !== document.id));
    } else {
      // If not selected, add it
      setSelectedDocuments([...selectedDocuments, document]);
    }
    
    // Call the parent component's handler if provided
    if (onSelectDocument) {
      onSelectDocument(selectedDocuments);
    }
  };
  
  // Handle document deletion
  const handleDeleteDocument = (documentId, event) => {
    event.stopPropagation(); // Prevent triggering selection
    
    if (window.confirm('Are you sure you want to delete this document?')) {
      deleteDocument({
        variables: { id: documentId }
      });
      
      // Also remove from selected documents if it was selected
      if (selectedDocuments.some(doc => doc.id === documentId)) {
        setSelectedDocuments(selectedDocuments.filter(doc => doc.id !== documentId));
      }
    }
  };
  
  // Format file size for display
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
  };
  
  // Format document status for display
  const getStatusDisplay = (status) => {
    switch (status) {
      case 'PROCESSING':
        return <span className="status processing">Processing</span>;
      case 'PROCESSED':
        return <span className="status processed">Ready</span>;
      case 'FAILED':
        return <span className="status failed">Failed</span>;
      default:
        return <span className="status unknown">Unknown</span>;
    }
  };
  
  if (loading) return <div className="loading">Loading documents...</div>;
  if (error) return <div className="error">Error loading documents: {error.message}</div>;
  
  const documents = data?.listUserDocuments || [];
  
  return (
    <div className="document-library">
      <h3>Your Documents</h3>
      
      {documents.length === 0 ? (
        <div className="no-documents">
          <p>You haven't uploaded any documents yet.</p>
        </div>
      ) : (
        <div className="document-list">
          {documents.map(document => (
            <div 
              key={document.id} 
              className={`document-item ${selectedDocuments.some(doc => doc.id === document.id) ? 'selected' : ''}`}
              onClick={() => handleDocumentSelect(document)}
            >
              <div className="document-icon">
                {document.documentType.includes('pdf') ? '📄' : 
                 document.documentType.includes('word') ? '📝' : 
                 document.documentType.includes('excel') ? '📊' : '📑'}
              </div>
              <div className="document-details">
                <div className="document-name">{document.documentName}</div>
                <div className="document-meta">
                  {formatFileSize(document.size)} • {new Date(document.uploadTimestamp).toLocaleDateString()}
                </div>
                <div className="document-status">
                  {getStatusDisplay(document.status)}
                  {document.pageCount && <span className="page-count">{document.pageCount} pages</span>}
                </div>
              </div>
              <button 
                className="delete-button" 
                onClick={(e) => handleDeleteDocument(document.id, e)}
                title="Delete document"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default DocumentLibrary;
