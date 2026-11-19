const AWS = require('aws-sdk');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Configure AWS SDK
AWS.config.update({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamodb = new AWS.DynamoDB.DocumentClient();

// Get table name from environment variable or use default
const USERS_TABLE = process.env.USERS_TABLE_NAME || 'appsync-genai-chatbot-users';

const MIN_PASSWORD_LENGTH = 12;

/**
 * Resolve a user's password. The login endpoint is public, so the sample never
 * ships a fixed password: use the given environment variable, or generate a
 * random password and print it once.
 */
function resolvePassword(envVar) {
  const fromEnv = process.env[envVar];
  if (fromEnv) {
    if (fromEnv.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`${envVar} must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    return { password: fromEnv, generated: false };
  }
  return { password: crypto.randomBytes(18).toString('base64url'), generated: true };
}

// Demo users to create
const users = [
  {
    username: 'demo',
    email: 'demo@example.com',
    passwordEnvVar: 'DEMO_USER_PASSWORD',
    roles: ['user']
  },
  {
    username: 'admin',
    email: 'admin@example.com',
    passwordEnvVar: 'ADMIN_USER_PASSWORD',
    roles: ['admin', 'user']
  }
];

/**
 * Seed users into DynamoDB
 */
async function seedUsers() {
  console.log(`Seeding ${users.length} users to table: ${USERS_TABLE}`);
  
  for (const user of users) {
    // Resolve and hash the password
    const { password, generated } = resolvePassword(user.passwordEnvVar);
    const passwordHash = await bcrypt.hash(password, 10);
    
    const now = new Date().toISOString();
    
    const params = {
      TableName: USERS_TABLE,
      Item: {
        username: user.username,
        email: user.email,
        passwordHash: passwordHash,
        roles: user.roles,
        createdAt: now,
        lastLogin: now
      },
      // Don't overwrite if username exists
      ConditionExpression: 'attribute_not_exists(username)'
    };
    
    try {
      await dynamodb.put(params).promise();
      if (generated) {
        // Printed once to the operator's terminal; it is not stored anywhere else.
        console.log(`Created user: ${user.username} (generated password: ${password})`);
      } else {
        console.log(`Created user: ${user.username} (password from ${user.passwordEnvVar})`);
      }
    } catch (error) {
      if (error.code === 'ConditionalCheckFailedException') {
        console.log(`User ${user.username} already exists, skipping`);
      } else {
        console.error(`Error creating user ${user.username}:`, error);
      }
    }
  }
  
  console.log('User seeding complete');
}

// Run the seed function if this script is executed directly
if (require.main === module) {
  seedUsers().catch(error => {
    console.error('Error seeding users:', error);
    process.exit(1);
  });
}

// Export for use in other scripts
module.exports = { seedUsers };
