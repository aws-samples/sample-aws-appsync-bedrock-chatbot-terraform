const AWS = require('aws-sdk');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Configure AWS SDK
AWS.config.update({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamodb = new AWS.DynamoDB.DocumentClient();

// Get table name from environment variable or use default
const USERS_TABLE = process.env.USERS_TABLE_NAME || 'appsync-genai-chatbot-users';

// Demo users to create
const users = [
  {
    username: 'demo',
    email: 'demo@example.com',
    password: 'password123',
    roles: ['user']
  },
  {
    username: 'admin',
    email: 'admin@example.com',
    password: 'admin123',
    roles: ['admin', 'user']
  }
];

/**
 * Seed users into DynamoDB
 */
async function seedUsers() {
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
