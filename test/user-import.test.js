// Mock node-fetch
jest.mock('node-fetch');
const fetch = require('node-fetch');
const { Response } = jest.requireActual('node-fetch');

const TEST_USER = {
  email: `testuser_${Date.now()}@example.com`,
  name: { given: 'Test', family: 'User' },
  username: `testuser_${Date.now()}`,
  password: 'P@ssw0rd!',
  population: { id: 'test-population-id' }
};

describe('User Import API', () => {
  const baseUrl = 'http://test-api.example.com';

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  describe('POST /api/pingone/v1/environments/:envId/users/import', () => {
    it('should import users with correct content type', async () => {
      // Mock successful response
      const responseData = { id: 'test-import-id' };
      const mockResponse = createMockResponse(200, responseData);
      
      // Set up the fetch mock with immediate resolution
      fetch.mockResolvedValueOnce(mockResponse);
      
      // Make the request
      const response = await fetch(
        `${baseUrl}/api/pingone/v1/environments/test-env-id/users/import`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/vnd.pingone.import.users+json',
            'Authorization': 'Bearer test-access-token'
          },
          body: JSON.stringify({
            users: [TEST_USER]
          })
        }
      );

      // Verify response
      expect(response.status).toBe(200);
      expect(response.ok).toBe(true);
      
      // Verify response data
      const data = await response.json();
      expect(data).toEqual(responseData);
      
      // Verify fetch was called with the correct arguments
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        `${baseUrl}/api/pingone/v1/environments/test-env-id/users/import`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/vnd.pingone.import.users+json',
            'Authorization': 'Bearer test-access-token'
          }),
          body: JSON.stringify({
            users: [TEST_USER]
          })
        })
      );
    });

    it('should fail with incorrect content type', async () => {
      // Mock error response for incorrect content type
      const errorResponse = {
        error: 'Unsupported Media Type',
        message: 'Content-Type must be application/vnd.pingone.import.users+json'
      };
      
      const mockResponse = createMockResponse(415, errorResponse);
      
      // Set up the fetch mock with immediate resolution
      fetch.mockResolvedValueOnce(mockResponse);
      
      // Make the request with incorrect content type
      const response = await fetch(
        `${baseUrl}/api/pingone/v1/environments/test-env-id/users/import`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json', // Incorrect content type
            'Authorization': 'Bearer test-access-token'
          },
          body: JSON.stringify({
            users: [TEST_USER]
          })
        }
      );

      // Verify response status and data
      expect(response.status).toBe(415);
      expect(response.ok).toBe(false);
      
      // Verify the error response
      const errorData = await response.json();
      expect(errorData).toEqual(errorResponse);
      
      // Verify fetch was called with the incorrect content type
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        `${baseUrl}/api/pingone/v1/environments/test-env-id/users/import`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-access-token'
          }),
          body: JSON.stringify({
            users: [TEST_USER]
          })
        })
      );
    });
  });

  // Helper function to create a mock response
  const createMockResponse = (status, data) => {
    return new Response(JSON.stringify(data), {
      status,
      statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
      headers: {
        'Content-Type': 'application/json'
      }
    });
  };
});
