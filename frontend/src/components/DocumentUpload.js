import React, { useState, useRef } from 'react';
import { useMutation } from '@apollo/client';
import { GET_DOCUMENT_UPLOAD_URL } from '../graphql/operations';
import './DocumentUpload.css';

function DocumentUpload({ onUploadComplete }) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  
  // Mutation to get a presigned URL for document upload
  const [getUploadUrl] = useMutation(GET_DOCUMENT_UPLOAD_URL, {
    onError: (error) => {
      console.error('Error getting upload URL:', error);
      setError('Failed to get upload URL. Please try again.');
      setIsUploading(false);
    }
  });
  
  // Supported file types
  const supportedFileTypes = [
    'text/plain', 
    'text/markdown', 
    'text/html',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv'
  ];
  
  // Handle file selection
  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    // Check file type
    if (!supportedFileTypes.includes(file.type)) {
      setError('Unsupported file type. Please upload a supported document type.');
      return;
    }
    
    // Check file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      setError('File is too large. Maximum file size is 50MB.');
      return;
    }
    
    setIsUploading(true);
    setUploadProgress(0);
    setError(null);
    
    try {
      // Get presigned URL from backend
      const { data } = await getUploadUrl({
        variables: {
          fileName: file.name,
          contentType: file.type
        }
      });
      
      if (!data || !data.getDocumentUploadUrl) {
        throw new Error('Failed to get upload URL');
      }
      
      const { uploadUrl, documentId } = data.getDocumentUploadUrl;
      
      // Upload file directly to S3 using the presigned URL
      await uploadFileToS3(file, uploadUrl);
      
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // Call the callback if provided
      if (onUploadComplete) {
        onUploadComplete(documentId);
      }
      
      setIsUploading(false);
      setUploadProgress(100);
      
      // Reset progress after a delay
      setTimeout(() => {
        setUploadProgress(0);
      }, 3000);
      
    } catch (error) {
      console.error('Error uploading file:', error);
      setError('Failed to upload file. Please try again.');
      setIsUploading(false);
    }
  };
  
  // Upload file to S3 using presigned URL
  const uploadFileToS3 = (file, presignedUrl) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percentComplete);
        }
      });
      
      // Handle successful upload
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.response);
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });
      
      // Handle upload error
      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed'));
      });
      
      // Handle upload abort
      xhr.addEventListener('abort', () => {
        reject(new Error('Upload aborted'));
      });
      
      // Open connection and send the file
      xhr.open('PUT', presignedUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);
    });
  };
  
  // Handle upload button click
  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  return (
    <div className="document-upload">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
        accept=".txt,.md,.html,.pdf,.doc,.docx,.xls,.xlsx,.csv"
      />
      
      <button 
        className="upload-button" 
        onClick={handleUploadClick}
        disabled={isUploading}
      >
        {isUploading ? 'Uploading...' : 'Upload Document'}
      </button>
      
      {uploadProgress > 0 && (
        <div className="upload-progress-container">
          <div 
            className="upload-progress-bar" 
            style={{ width: `${uploadProgress}%` }}
          ></div>
          <div className="upload-progress-text">
            {uploadProgress < 100 ? `${uploadProgress}%` : 'Processing...'}
          </div>
        </div>
      )}
      
      {error && (
        <div className="upload-error">
          {error}
        </div>
      )}
      
      <div className="upload-info">
        <p>Supported formats: TXT, MD, HTML, PDF, DOC, DOCX, XLS, XLSX, CSV</p>
        <p>Maximum file size: 50MB</p>
      </div>
    </div>
  );
}

export default DocumentUpload;
