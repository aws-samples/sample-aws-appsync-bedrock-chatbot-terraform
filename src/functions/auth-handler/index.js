const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const AWS = require('aws-sdk');

// Initialize AWS SDK clients
const dynamodb = new AWS.DynamoDB.DocumentClient();
const secretsManager = new AWS.SecretsManager();

// Environment variables
const USERS_TABLE = process.env.USERS_TABLE_NAME;
const JWT_SECRET_ARN = process.env.JWT_SECRET_ARN;

// Cache for JWT secret
let cachedJwtSecret = null;

/**
 * Main handler function that handles both login requests and token validation
 */
exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  // Determine if this is an API Gateway event (login request) or AppSync authorizer event
  if (event.requestContext && event.requestContext.http) {
    // This is an API Gateway event (login request)
    return handleLogin(event);
  } else {
    // This is an AppSync authorizer event
    return handleAuthorization(event);
  }
};

/**
 * Get JWT secret from Secrets Manager
 */
async function getJwtSecret() {
  if (cachedJwtSecret) {
    return cachedJwtSecret;
  }
  
  try {
    const data = await secretsManager.getSecretValue({ SecretId: JWT_SECRET_ARN }).promise();
    const secretData = JSON.parse(data.SecretString);
    cachedJwtSecret = secretData.jwtSecret;
    return cachedJwtSecret;
  } catch (error) {
    console.error('Error retrieving JWT secret:', error);
    throw error;
  }
}

/**
 * Handle login requests from API Gateway
 */
async function handleLogin(event) {
  try {
    // Parse request body
    const body = JSON.parse(event.body);
    const { username, password } = body;
    
    if (!username || !password) {
      return formatResponse(400, { message: 'Username and password are required' });
    }
    
    // Get user from DynamoDB
    const params = {
      TableName: USERS_TABLE,
      Key: { username }
    };
    
    const result = await dynamodb.get(params).promise();
    const user = result.Item;
    
    // Check if user exists
    if (!user) {
      return formatResponse(401, { message: 'Invalid credentials' });
    }
    
    // Verify password with bcrypt
    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      return formatResponse(401, { message: 'Invalid credentials' });
    }
    
    // Update last login time
    await dynamodb.update({
      TableName: USERS_TABLE,
      Key: { username },
      UpdateExpression: 'SET lastLogin = :now',
      ExpressionAttributeValues: {
        ':now': new Date().toISOString()
      }
    }).promise();
    
    // Get JWT secret
    const jwtSecret = await getJwtSecret();
    
    // Generate token (valid for 24 hours)
    const token = jwt.sign(
      { 
        sub: username,
        username: username,
        email: user.email,
        roles: user.roles || ['user']
      },
      jwtSecret,
      { expiresIn: '24h' }
    );
    
    // Return success response with token
    return formatResponse(200, {
      token,
      username,
      roles: user.roles,
      expiresIn: 86400 // 24 hours in seconds
    });
  } catch (error) {
    console.error('Login error:', error);
    return formatResponse(500, { message: 'Internal server error' });
  }
}

/**
 * Handle AppSync authorization
 */
async function handleAuthorization(event) {
  try {
    // Log the incoming authorization event (excluding sensitive data)
    console.log('Authorization event received:', {
      hasAuthHeader: !!event.authorizationToken,
      requestContext: event.requestContext ? {
        apiId: event.requestContext.apiId,
        accountId: event.requestContext.accountId,
        requestId: event.requestContext.requestId,
        operationName: event.requestContext.operationName
      } : 'none'
    });
    
    // Extract token from Authorization header
    const authHeader = event.authorizationToken;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn('Invalid or missing authorization header');
      return { isAuthorized: false };
    }
    
    const token = authHeader.split(' ')[1];
    console.log('JWT token received (first 10 chars):', token.substring(0, 10) + '...');
    
    // Get JWT secret
    const jwtSecret = await getJwtSecret();
    
    // Verify the token
    const decoded = jwt.verify(token, jwtSecret);
    
    // Log decoded token information (excluding sensitive parts)
    console.log('Token validation successful:', {
      sub: decoded.sub,
      username: decoded.username,
      emailDomain: decoded.email ? decoded.email.split('@')[1] : 'none',
      roles: decoded.roles || [],
      issuedAt: new Date(decoded.iat * 1000).toISOString(),
      expiresAt: new Date(decoded.exp * 1000).toISOString()
    });
    
    // Check if token is expired
    const currentTime = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < currentTime) {
      console.warn('Token is expired:', {
        expiry: new Date(decoded.exp * 1000).toISOString(),
        currentTime: new Date(currentTime * 1000).toISOString()
      });
      return { isAuthorized: false };
    }
    
    // Create resolver context
    const resolverContext = {
      userId: decoded.sub,
      username: decoded.username,
      email: decoded.email,
      roles: JSON.stringify(decoded.roles || [])
    };
    
    // Log the resolver context being returned
    console.log('Returning resolver context:', resolverContext);
    
    // Return allow policy with user context
    // Note: resolverContext must be a map of string to string
    return {
      isAuthorized: true,
      resolverContext
    };
  } catch (error) {
    console.error('Authorization error:', error);
    console.error('Authorization error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    return { isAuthorized: false };
  }
}

/**
 * Format HTTP response for API Gateway
 */
function formatResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*', // For development - restrict in production
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    },
    body: JSON.stringify(body)
  };
}
