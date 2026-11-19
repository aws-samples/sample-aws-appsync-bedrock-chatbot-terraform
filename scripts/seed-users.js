const AWS = require('aws-sdk');
const bcrypt = require('bcryptjs');

// Configure AWS SDK
AWS.config.update({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamodb = new AWS.DynamoDB.DocumentClient();

// Get table name from environment variable or use default
const USERS_TABLE = process.env.USERS_TABLE_NAME || 'appsync-genai-chatbot-users';

const MIN_PASSWORD_LENGTH = 12;

// The login endpoint is public, so the sample never ships fixed passwords.
// Passwords come only from these environment variables and are never logged.
const users = [
  {
    username: 'demo',
    email: 'demo@example.com',
    password: process.env.DEMO_USER_PASSWORD,
    roles: ['user']
  },
  {
    username: 'admin',
    email: 'admin@example.com',
    password: process.env.ADMIN_USER_PASSWORD,
    roles: ['admin', 'user']
  }
];

/**
 * Fail before writing anything if a password is missing or too short.
 */
function validatePasswords() {
  const invalid = users.filter(u => !u.password || u.password.length < MIN_PASSWORD_LENGTH);
  if (invalid.length > 0) {
    throw new Error(
      `Missing or too short password for user(s): ${invalid.map(u => u.username).join(', ')}. ` +
      `Set DEMO_USER_PASSWORD and ADMIN_USER_PASSWORD (at least ${MIN_PASSWORD_LENGTH} characters each).`
    );
  }
}

/**
 * Seed users into DynamoDB
 */
async function seedUsers() {
  validatePasswords();
  console.log(`Seeding ${users.length} users to table: ${USERS_TABLE}`);
  
  for (const user of users) {
    // Hash the password
    const passwordHash = await bcrypt.hash(user.password, 10);
    
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
      console.log(`Created user: ${user.username}`);
    } catch (error) {
      if (error.code === 'ConditionalCheckFailedException') {
        console.log(`User ${user.username} already exists, skipping`);
      } else {
        console.error(`Error creating user ${user.username}:`, error.code || error.name);
      }
    }
  }
  
  console.log('User seeding complete');
}

// Run the seed function if this script is executed directly
if (require.main === module) {
  seedUsers().catch(error => {
    console.error('Error seeding users:', error.message);
    process.exit(1);
  });
}

// Export for use in other scripts
module.exports = { seedUsers };
