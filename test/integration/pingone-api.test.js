import fetch from 'node-fetch';
import { loadEnv } from '../helpers/loadEnv.js';
import { jest } from '@jest/globals';

// Load environment variables from .env file
loadEnv();

// PingOne API base URL based on region
const PINGONE_REGION = process.env.PINGONE_REGION || 'NorthAmerica';
const PINGONE_API_BASE = `https://api.${PINGONE_REGION}.pingone.com/v1`;

// Test configuration
const TEST_USER_PREFIX = 'testuser';
const TEST_POPULATION_ID = process.env.TEST_POPULATION_ID || process.env.PINGONE_POPULATION_ID;

// Helper function to generate a unique test email
function generateTestEmail() {
  return `${TEST_USER_PREFIX}-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
}

describe('PingOne API Integration Tests', () => {
  let accessToken;
  
  // Get access token before running tests
  beforeAll(async () => {
    try {
      const tokenUrl = `https://auth.${PINGONE_REGION}.pingone.com/${process.env.PINGONE_ENVIRONMENT_ID}/as/token`;
      
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${process.env.PINGONE_CLIENT_ID}:${process.env.PINGONE_CLIENT_SECRET}`).toString('base64')}`
        },
        body: 'grant_type=client_credentials'
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to get access token: ${error}`);
      }
      
      const data = await response.json();
      accessToken = data.access_token;
      
      if (!accessToken) {
        throw new Error('No access token received');
      }
      
      console.log('Successfully obtained access token');
    } catch (error) {
      console.error('Error in beforeAll:', error);
      throw error;
    }
  });
  
  describe('User Management', () => {
    let testUserId;
    const testUserEmail = generateTestEmail();
    
    // Test user data
    const testUser = {
      email: testUserEmail,
      name: {
        given: 'Test',
        family: 'User'
      },
      username: testUserEmail,
      password: 'P@ssw0rd!',
      population: {
        id: TEST_POPULATION_ID
      }
    };
    
    afterAll(async () => {
      // Clean up: Delete the test user if it was created
      if (testUserId) {
        try {
          const url = `${PINGONE_API_BASE}/environments/${process.env.PINGONE_ENVIRONMENT_ID}/users/${testUserId}`;
          await fetch(url, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });
          console.log(`Cleaned up test user: ${testUserEmail}`);
        } catch (error) {
          console.error('Error cleaning up test user:', error);
        }
      }
    });
    
    test('should create a new user', async () => {
      const url = `${PINGONE_API_BASE}/environments/${process.env.PINGONE_ENVIRONMENT_ID}/users`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(testUser)
      });
      
      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data).toHaveProperty('id');
      testUserId = data.id;
      
      console.log(`Created test user with ID: ${testUserId}`);
    });
    
    test('should get the created user', async () => {
      if (!testUserId) {
        throw new Error('No user ID available for testing');
      }
      
      const url = `${PINGONE_API_BASE}/environments/${process.env.PINGONE_ENVIRONMENT_ID}/users/${testUserId}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      expect(response.status).toBe(200);
      const user = await response.json();
      expect(user.id).toBe(testUserId);
      expect(user.email).toBe(testUserEmail);
    });
  });
  
  describe('User Import', () => {
    test('should import users with correct content type', async () => {
      const testUser = {
        email: generateTestEmail(),
        name: {
          given: 'Import',
          family: 'Test'
        },
        username: `import-${Date.now()}`,
        password: 'P@ssw0rd!',
        population: {
          id: TEST_POPULATION_ID
        }
      };
      
      const url = `${PINGONE_API_BASE}/environments/${process.env.PINGONE_ENVIRONMENT_ID}/users/import`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/vnd.pingone.import.users+json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          users: [testUser]
        })
      });
      
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result).toHaveProperty('id');
      
      // Clean up the imported user
      if (result && result.id) {
        try {
          const deleteUrl = `${PINGONE_API_BASE}/environments/${process.env.PINGONE_ENVIRONMENT_ID}/users/${result.id}`;
          await fetch(deleteUrl, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });
          console.log(`Cleaned up imported user: ${result.id}`);
        } catch (error) {
          console.error('Error cleaning up imported user:', error);
        }
      }
    });
  });
});
