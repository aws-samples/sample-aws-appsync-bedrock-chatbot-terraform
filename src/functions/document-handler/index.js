const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { BedrockAgentClient, IngestKnowledgeBaseDocumentsCommand, RetrieveCommand } = require('@aws-sdk/client-bedrock-agent');
const { v4: uuidv4 } = require('uuid');

// Initialize AWS clients
const s3Client = new S3Client();
const dynamoClient = new DynamoDBClient();
const ddbDocClient = DynamoDBDocumentClient.from(dynamoClient);
const bedrockClient = new BedrockAgentClient();

// Environment variables
const DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;
const USER_DOCUMENTS_BUCKET = process.env.USER_DOCUMENTS_BUCKET;
const KNOWLEDGE_BASE_ID = process.env.KNOWLEDGE_BASE_ID;
const KNOWLEDGE_BASE_DATA_SOURCE_ID = process.env.KNOWLEDGE_BASE_DATA_SOURCE_ID;

/**
 * Main handler for document processing
 */
exports.handler = async (event) => {
  console.log('Event received:', JSON.stringify(event, null, 2));
  
  try {
    // Handle S3 events for document uploads
    if (event.Records && Array.isArray(event.Records)) {
      return await handleS3Events(event.Records);
    }
    
    // Handle direct invocations for document operations
    if (event.action) {
      const { action, arguments: args, identity } = event;
      
      switch (action) {
        case 'processDocument':
          return await processDocument(args.documentId, args.userId);
        case 'checkDocumentStatus':
          return await checkDocumentStatus(args.documentId, args.userId);
        default:
          throw new Error(`Unsupported action: ${action}`);
      }
    }
    
    return {
      statusCode: 400,
      body: 'Invalid event format'
    };
  } catch (error) {
    console.error('Error processing document:', error);
    return {
      statusCode: 500,
      body: `Error processing document: ${error.message}`
    };
  }
};

/**
 * Handle S3 events for document uploads
 */
async function handleS3Events(records) {
  const results = [];
  
  for (const record of records) {
    try {
      // Check if this is an S3 event
      if (record.eventSource !== 'aws:s3' || !record.s3) {
        console.log('Skipping non-S3 event:', record.eventSource);
        continue;
      }
      
      // Extract S3 details
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
      const size = record.s3.object.size;
      
      console.log(`Processing S3 event for ${key} in bucket ${bucket}`);
      
      // Extract user ID and document ID from the key
      // Expected format: user-documents/{userId}/{documentId}/original.{ext}
      const keyParts = key.split('/');
      if (keyParts.length < 4 || keyParts[0] !== 'user-documents') {
        console.warn(`Invalid key format: ${key}`);
        continue;
      }
      
      const userId = keyParts[1];
      const documentId = keyParts[2];
      
      console.log(`Extracted userId: ${userId}, documentId: ${documentId}`);
      
      // Update document metadata with size
      await updateDocumentMetadata(documentId, userId, {
        size: size
      });
      
      // Process the document
      const result = await processDocument(documentId, userId);
      results.push(result);
    } catch (error) {
      console.error('Error processing S3 event:', error);
      results.push({
        error: error.message
      });
    }
  }
  
  return {
    statusCode: 200,
    body: `Processed ${results.length} records`,
    results
  };
}

/**
 * Process a document and ingest it into the Knowledge Base
 */
async function processDocument(documentId, userId) {
  console.log(`Processing document ${documentId} for user ${userId}`);
  
  try {
    // Get document metadata
    const documentMetadata = await getDocumentMetadata(documentId, userId);
    if (!documentMetadata) {
      throw new Error(`Document ${documentId} not found for user ${userId}`);
    }
    
    // Check if document is already processed
    if (documentMetadata.status === 'PROCESSED') {
      console.log(`Document ${documentId} is already processed`);
      return {
        documentId,
        status: 'PROCESSED',
        message: 'Document already processed'
      };
    }
    
    // Update status to PROCESSING
    await updateDocumentMetadata(documentId, userId, {
      status: 'PROCESSING',
      updatedAt: new Date().toISOString()
    });
    
    // Get the S3 object
    const s3Key = documentMetadata.s3Path;
    const command = new GetObjectCommand({
      Bucket: USER_DOCUMENTS_BUCKET,
      Key: s3Key
    });
    const s3Object = await s3Client.send(command);
    
    // Start ingestion job in Bedrock Knowledge Base
    const ingestionJobId = await startIngestionJob(documentId, userId, s3Key, documentMetadata);
    
    // Update document metadata with ingestion job ID
    await updateDocumentMetadata(documentId, userId, {
      ingestionJobId,
      updatedAt: new Date().toISOString()
    });
    
    return {
      documentId,
      status: 'PROCESSING',
      ingestionJobId,
      message: 'Document processing started'
    };
  } catch (error) {
    console.error(`Error processing document ${documentId}:`, error);
    
    // Update document status to FAILED
    try {
      await updateDocumentMetadata(documentId, userId, {
        status: 'FAILED',
        updatedAt: new Date().toISOString()
      });
    } catch (updateError) {
      console.error(`Error updating document status to FAILED:`, updateError);
    }
    
    throw error;
  }
}

/**
 * Ingest a document into Bedrock Knowledge Base
 */
async function startIngestionJob(documentId, userId, s3Key, documentMetadata) {
  if (!KNOWLEDGE_BASE_ID) {
    throw new Error('Knowledge Base ID not provided');
  }
  
  if (!KNOWLEDGE_BASE_DATA_SOURCE_ID) {
    throw new Error('Knowledge Base Data Source ID not provided');
  }
  
  console.log(`Ingesting document ${documentId} into Knowledge Base ${KNOWLEDGE_BASE_ID} with Data Source ${KNOWLEDGE_BASE_DATA_SOURCE_ID}`);
  
  // Get AWS account ID from environment and ensure it's a 12-digit number
  const AWS_ACCOUNT_ID = process.env.AWS_ACCOUNT_ID || '';
  
  // Validate AWS account ID format (should be a 12-digit number)
  if (!AWS_ACCOUNT_ID || !/^\d{12}$/.test(AWS_ACCOUNT_ID)) {
    console.warn(`Invalid AWS account ID format: ${AWS_ACCOUNT_ID}. Should be a 12-digit number.`);
  }
  
  try {
    // Create a metadata JSON file and upload it to S3
    // Extract the full filename with extension
    const s3KeyParts = s3Key.split('/');
    const fullFilename = s3KeyParts[s3KeyParts.length - 1];
    
    // Important: The metadata file must be named exactly as <FILENAME>.metadata.json
    // where <FILENAME> is the exact name of the document file (including extension)
    const metadataKey = `${s3Key.substring(0, s3Key.lastIndexOf('/'))}/${fullFilename}.metadata.json`;
    
    console.log(`Document filename: ${fullFilename}, Metadata key: ${metadataKey}`);
    
    // Create metadata content according to the simplified format
    const metadataContent = {
      metadataAttributes: {
        documentId: documentId,
        userId: userId,
        documentName: documentMetadata.documentName || 'Unknown',
        createdAt: new Date().toISOString(),
        contentType: fullFilename.split('.').pop().toLowerCase(),
        source: "user-upload"
      }
    };
    
    console.log('Metadata content:', JSON.stringify(metadataContent, null, 2));
    
    // Upload metadata file to S3
    console.log(`Uploading metadata file to S3: ${metadataKey}`);
    await s3Client.send(new PutObjectCommand({
      Bucket: USER_DOCUMENTS_BUCKET,
      Key: metadataKey,
      Body: JSON.stringify(metadataContent),
      ContentType: 'application/json'
    }));
    
    // Prepare the request for direct ingestion
    const ingestParams = {
      knowledgeBaseId: KNOWLEDGE_BASE_ID,
      dataSourceId: KNOWLEDGE_BASE_DATA_SOURCE_ID,
      documents: [
        {
          content: {
            dataSourceType: "S3",
            s3: {
              s3Location: {
                uri: `s3://${USER_DOCUMENTS_BUCKET}/${s3Key}`,
                bucketOwnerAccountId: AWS_ACCOUNT_ID
              }
            }
          },
          metadata: {
            type: "S3_LOCATION",
            s3Location: {
              uri: `s3://${USER_DOCUMENTS_BUCKET}/${metadataKey}`,
              bucketOwnerAccountId: AWS_ACCOUNT_ID
            }
          },
          documentId: documentId
        }
      ]
    };
    
    console.log('Ingesting document with params:', JSON.stringify(ingestParams, null, 2));
    
    try {
      const command = new IngestKnowledgeBaseDocumentsCommand(ingestParams);
      const response = await bedrockClient.send(command);
      console.log('Document ingestion started. Response:', JSON.stringify(response, null, 2));
      
      // Log the document and metadata locations for debugging
      console.log('Document location:', `s3://${USER_DOCUMENTS_BUCKET}/${s3Key}`);
      console.log('Metadata location:', `s3://${USER_DOCUMENTS_BUCKET}/${metadataKey}`);
      
      // If response contains ingestionJobId, use that instead of documentId
      if (response.ingestionJobId) {
        console.log(`Using ingestion job ID from response: ${response.ingestionJobId}`);
        return response.ingestionJobId;
      }
    } catch (ingestError) {
      console.error('Error during document ingestion:', ingestError);
      console.error('Error details:', JSON.stringify(ingestError, null, 2));
      
      // Check for specific error types
      if (ingestError.name === 'ValidationException') {
        console.error('Validation error - check metadata file format and naming');
      } else if (ingestError.name === 'AccessDeniedException') {
        console.error('Access denied - check IAM permissions');
      }
      
      throw ingestError;
    }
    
    // Return the document ID as the job ID for tracking
    return documentId;
  } catch (error) {
    console.error('Error ingesting document:', error);
    throw error;
  }
}

/**
 * Check the status of a document processing job
 */
async function checkDocumentStatus(documentId, userId) {
  console.log(`Checking status for document ${documentId} for user ${userId}`);
  
  // Get document metadata
  const documentMetadata = await getDocumentMetadata(documentId, userId);
  if (!documentMetadata) {
    throw new Error(`Document ${documentId} not found for user ${userId}`);
  }
  
  // If document is already processed or failed, return current status
  if (documentMetadata.status === 'PROCESSED' || documentMetadata.status === 'FAILED') {
    return {
      documentId,
      status: documentMetadata.status,
      message: `Document is ${documentMetadata.status.toLowerCase()}`
    };
  }
  
  // If document has an ingestion job ID, check the job status
  if (documentMetadata.ingestionJobId) {
    try {
      const ingestionJobStatus = await checkIngestionJobStatus(documentMetadata.ingestionJobId);
      
      // Update document status based on ingestion job status
      if (ingestionJobStatus === 'COMPLETE') {
        await updateDocumentMetadata(documentId, userId, {
          status: 'PROCESSED',
          updatedAt: new Date().toISOString()
        });
        
        return {
          documentId,
          status: 'PROCESSED',
          message: 'Document processing completed'
        };
      } else if (ingestionJobStatus === 'FAILED') {
        await updateDocumentMetadata(documentId, userId, {
          status: 'FAILED',
          updatedAt: new Date().toISOString()
        });
        
        return {
          documentId,
          status: 'FAILED',
          message: 'Document processing failed'
        };
      } else {
        // Still processing
        return {
          documentId,
          status: 'PROCESSING',
          message: `Document processing in progress (${ingestionJobStatus})`
        };
      }
    } catch (error) {
      console.error(`Error checking ingestion job status:`, error);
      
      // Return current status
      return {
        documentId,
        status: documentMetadata.status,
        message: `Document status check failed: ${error.message}`
      };
    }
  }
  
  // No ingestion job ID, document is still in initial processing
  return {
    documentId,
    status: documentMetadata.status,
    message: 'Document is in initial processing'
  };
}

/**
 * Check the status of a document in the Knowledge Base
 * Note: Since we're using direct ingestion, we don't have an ingestion job ID to check
 * Instead, we'll check if the document exists in the Knowledge Base
 */
async function checkIngestionJobStatus(documentId) {
  if (!KNOWLEDGE_BASE_ID) {
    throw new Error('Knowledge Base ID not provided');
  }
  
  console.log(`Checking document status for ${documentId}`);
  
  try {
    // For direct ingestion, we can try to retrieve the document to see if it exists
    const params = {
      knowledgeBaseId: KNOWLEDGE_BASE_ID,
      retrievalQuery: {
        text: "dummy query to check if document exists"
      },
      retrievalConfiguration: {
        vectorSearchConfiguration: {
          filter: {
            andAll: [
              {
                equals: {
                  key: "metadataAttributes.documentId",
                  value: documentId
                }
              }
            ]
          }
        }
      }
    };
    
    // Try to retrieve the document
    const command = new RetrieveCommand(params);
    const response = await bedrockClient.send(command);
    
    // If we get a response with results, the document is processed
    if (response.retrievalResults && response.retrievalResults.length > 0) {
      console.log('Document found in Knowledge Base');
      return 'COMPLETE';
    } else {
      console.log('Document not found in Knowledge Base yet, still processing');
      return 'PROCESSING';
    }
  } catch (error) {
    console.error('Error checking document status:', error);
    
    // If there's an error, assume the document processing failed
    return 'FAILED';
  }
}

/**
 * Get document metadata from DynamoDB
 */
async function getDocumentMetadata(documentId, userId) {
  const params = {
    TableName: DYNAMODB_TABLE_NAME,
    Key: { 
      PK: `USER#${userId}`,
      SK: `DOC#${documentId}`
    }
  };
  
  const command = new GetCommand(params);
  const result = await ddbDocClient.send(command);
  return result.Item;
}

/**
 * Update document metadata in DynamoDB
 */
async function updateDocumentMetadata(documentId, userId, updates) {
  console.log(`Updating document ${documentId} metadata:`, updates);
  
  // Build update expression and attribute values/names
  let updateExpression = 'SET ';
  const expressionAttributeValues = {};
  const expressionAttributeNames = {};
  
  Object.entries(updates).forEach(([key, value], index) => {
    const attrName = `#${key}`;
    const attrValue = `:${key}`;
    updateExpression += `${index > 0 ? ', ' : ''}${attrName} = ${attrValue}`;
    expressionAttributeValues[attrValue] = value;
    expressionAttributeNames[attrName] = key;
  });
  
  const params = {
    TableName: DYNAMODB_TABLE_NAME,
    Key: { 
      PK: `USER#${userId}`,
      SK: `DOC#${documentId}`
    },
    UpdateExpression: updateExpression,
    ExpressionAttributeValues: expressionAttributeValues,
    ExpressionAttributeNames: expressionAttributeNames
  };
  
  const command = new UpdateCommand(params);
  await ddbDocClient.send(command);
  console.log(`Document ${documentId} metadata updated successfully`);
}
