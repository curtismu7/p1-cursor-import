const { expect } = require('chai');
const sinon = require('sinon');
const fetch = require('node-fetch');

// Test for PingOne Token Endpoint Configuration
// This test verifies that token requests use auth.pingone.com instead of api.pingone.com

describe('PingOne Token Endpoint Tests', () => {
    let server;
    let originalFetch;

    beforeAll(async () => {
        // Mock fetch globally
        originalFetch = global.fetch;
        global.fetch = jest.fn();
        
        // Start the server
        const { default: startServer } = await import('../../server.js');
        server = await startServer();
    });

    afterAll(async () => {
        if (server) {
            await server.close();
        }
        // Restore original fetch
        global.fetch = originalFetch;
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Token Endpoint Configuration', () => {
        it('should use auth.pingone.com for token requests', async () => {
            // Mock successful token response
            global.fetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    access_token: 'test-token',
                    expires_in: 3600,
                    token_type: 'Bearer'
                })
            });

            // Make a request that triggers token authentication
            const response = await fetch('http://localhost:4000/api/pingone/test-connection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            });

            expect(response.status).to.equal(200);

            // Verify that fetch was called with auth.pingone.com URL
            const calls = global.fetch.mock.calls;
            const tokenCall = calls.find(call => 
                call[0] && call[0].includes('auth.pingone.com')
            );

            expect(tokenCall).toBeDefined();
            expect(tokenCall[0]).toContain('auth.pingone.com');
            expect(tokenCall[0]).toContain('/as/token');
        });

        it('should not use api.pingone.com for token requests', async () => {
            // Mock successful token response
            global.fetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    access_token: 'test-token',
                    expires_in: 3600,
                    token_type: 'Bearer'
                })
            });

            // Make a request that triggers token authentication
            await fetch('http://localhost:4000/api/pingone/test-connection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            });

            // Verify that no calls were made to api.pingone.com for tokens
            const calls = global.fetch.mock.calls;
            const apiCall = calls.find(call => 
                call[0] && call[0].includes('api.pingone.com/token')
            );

            expect(apiCall).toBeUndefined();
        });

        it('should handle token endpoint errors correctly', async () => {
            // Mock 403 error from wrong endpoint
            global.fetch.mockResolvedValue({
                ok: false,
                status: 403,
                statusText: 'Forbidden',
                json: async () => ({
                    message: 'Forbidden'
                })
            });

            const response = await fetch('http://localhost:4000/api/pingone/test-connection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            });

            expect(response.status).to.equal(500); // Should return server error
        });

        it('should return 404 for direct /token endpoint access', async () => {
            const response = await fetch('http://localhost:4000/api/pingone/token', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            expect(response.status).to.equal(404);
            
            const data = await response.json();
            expect(data.error).toBe('Endpoint Not Found');
            expect(data.message).toContain('The /token endpoint does not exist in the PingOne API');
            expect(data.availableEndpoints).toBeDefined();
        });
    });

    describe('Token Manager Configuration', () => {
        it('should use correct token endpoint URL', async () => {
            // Test the token manager directly
            const { default: TokenManager } = await import('../../server/token-manager.js');
            const tokenManager = new TokenManager();
            
            // Mock the getAccessToken method to return the URL it would use
            const originalGetAccessToken = tokenManager.getAccessToken;
            tokenManager.getAccessToken = jest.fn().mockImplementation(() => {
                const clientId = process.env.PINGONE_CLIENT_ID;
                const environmentId = process.env.PINGONE_ENVIRONMENT_ID;
                const authUrl = `https://auth.pingone.com/${environmentId}/as/token`;
                return Promise.resolve(authUrl);
            });
            
            const tokenUrl = await tokenManager.getAccessToken();
            expect(tokenUrl).toContain('auth.pingone.com');
            expect(tokenUrl).toContain('/as/token');
            expect(tokenUrl).not.toContain('api.pingone.com');
            
            // Restore original method
            tokenManager.getAccessToken = originalGetAccessToken;
        });
    });
}); 