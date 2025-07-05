import fetch from 'node-fetch';

class TokenManager {
    constructor(logger) {
        this.logger = logger || {
            debug: console.debug.bind(console),
            info: console.log.bind(console),
            warn: console.warn.bind(console),
            error: console.error.bind(console)
        };
        this.token = null;
        this.tokenExpiry = null;
        this.isRefreshing = false;
        this.refreshQueue = [];
    }

    /**
     * Get an access token from PingOne
     * @returns {Promise<string>} Access token
     */
    async getAccessToken() {
        // Return cached token if it's still valid (with 2 minute buffer)
        const bufferTime = 2 * 60 * 1000; // 2 minutes in milliseconds
        const now = Date.now();
        
        // If we have a valid token, return it
        if (this.token && this.tokenExpiry && (this.tokenExpiry - bufferTime) > now) {
            const timeLeft = Math.ceil((this.tokenExpiry - now - bufferTime) / 1000 / 60);
            if (timeLeft <= 5) { // Only log if token is about to expire soon
                this.logger.debug(`Using cached token (expires in ${timeLeft} minutes)`);
            }
            return this.token;
        }
        
        // If we're already refreshing, queue this request
        if (this.isRefreshing) {
            this.logger.debug('Token refresh in progress, queuing request');
            return new Promise((resolve, reject) => {
                this.refreshQueue.push({ resolve, reject });
            });
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
            
            // Cache the token with expiry time (subtract 5 minutes as buffer)
            const expiresInMs = (data.expires_in || 3600) * 1000; // Default to 1 hour if not specified
            this.token = data.access_token;
            this.tokenExpiry = Date.now() + expiresInMs;
            
            const expiresInMinutes = Math.floor(expiresInMs / 1000 / 60);
            this.logger.info(`New token obtained, expires in ${expiresInMinutes} minutes`);
            
            if (expiresInMinutes < 10) {
                this.logger.warn(`Token has short expiration time: ${expiresInMinutes} minutes`);
            }
            
            // Process any queued requests
            this.processQueue(null, this.token);
            
            return this.token;
            
        } catch (error) {
            // Process any queued requests with the error
            this.processQueue(error);
            
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
     * Process any queued token requests
     * @private
     */
    processQueue(error, token = null) {
        // Reset the refreshing flag
        this.isRefreshing = false;
        
        // Process all queued requests
        while (this.refreshQueue.length > 0) {
            const { resolve, reject } = this.refreshQueue.shift();
            if (error) {
                reject(error);
            } else {
                resolve(token);
            }
        }
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

export default TokenManager;
