const fetch = require('node-fetch');

class TokenManager {
    constructor(logger) {
        this.logger = logger;
        this.token = null;
        this.tokenExpiry = null;
    }

    /**
     * Get an access token from PingOne
     * @returns {Promise<string>} Access token
     */
    async getAccessToken() {
        // Return cached token if it's still valid
        if (this.token && this.tokenExpiry > Date.now() + 60000) {
            return this.token;
        }

        const clientId = process.env.PINGONE_CLIENT_ID;
        const clientSecret = process.env.PINGONE_CLIENT_SECRET;
        const environmentId = process.env.PINGONE_ENVIRONMENT_ID;
        const region = process.env.PINGONE_REGION || 'NorthAmerica';

        if (!clientId || !clientSecret || !environmentId) {
            throw new Error('PingOne API credentials are not properly configured');
        }

        const authUrl = `https://auth.pingone.${this.getRegionDomain(region)}/${environmentId}/as/token`;
        
        console.log('Authentication URL:', authUrl);
        console.log('Client ID:', clientId ? '***' + clientId.slice(-4) : 'Not set');
        console.log('Environment ID:', environmentId);
        console.log('Region:', region);

        try {
            // Create Basic Auth header
            const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
            
            const response = await fetch(authUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json',
                    'Authorization': `Basic ${credentials}`
                },
                body: new URLSearchParams({
                    grant_type: 'client_credentials'
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                let errorDetails = errorText;
                try {
                    const errorJson = JSON.parse(errorText);
                    errorDetails = JSON.stringify(errorJson, null, 2);
                } catch (e) {
                    // If we can't parse as JSON, use the text as is
                }
                console.error('Error response:', {
                    status: response.status,
                    statusText: response.statusText,
                    headers: Object.fromEntries(response.headers.entries()),
                    body: errorDetails
                });
                throw new Error(`Failed to get access token: ${response.status} - ${errorDetails}`);
            }

            const data = await response.json();
            
            // Cache the token
            this.token = data.access_token;
            this.tokenExpiry = Date.now() + (data.expires_in * 1000);
            
            this.logger.info('Successfully obtained new access token');
            return this.token;
            
        } catch (error) {
            this.logger.error(`Error getting access token: ${error.message}`);
            throw error;
        }
    }

    /**
     * Clear the current token (force a new one to be fetched on next request)
     */
    clearToken() {
        this.token = null;
        this.tokenExpiry = null;
    }

    /**
     * Get the domain for a given region
     * @param {string} region - The region code (e.g., 'NorthAmerica')
     * @returns {string} The domain for the region
     */
    getRegionDomain(region) {
        const domains = {
            'NorthAmerica': 'com',
            'Canada': 'ca',
            'Europe': 'eu',
            'Asia': 'asia',
            'Australia': 'com.au'
        };

        return domains[region] || 'com';
    }
}

// CommonJS export
module.exports = { TokenManager };
