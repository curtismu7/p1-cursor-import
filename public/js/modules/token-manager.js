/**
 * TokenManager - Handles OAuth 2.0 token acquisition and caching
 */
class TokenManager {
    /**
     * Create a new TokenManager instance
     * @param {Object} logger - Logger instance for logging messages
     * @param {Object} settings - Settings object containing API credentials
     */
    constructor(logger, settings) {
        this.logger = logger || console;
        this.settings = settings || {};
        this.tokenCache = {
            accessToken: null,
            expiresAt: 0,
            tokenType: 'Bearer',
            lastRefresh: 0
        };
        this.tokenExpiryBuffer = 5 * 60 * 1000; // 5 minutes buffer before token expiry
        this.isRefreshing = false;
        this.refreshQueue = [];
        
        // Bind methods
        this.getAccessToken = this.getAccessToken.bind(this);
        this._requestNewToken = this._requestNewToken.bind(this);
        this._isTokenValid = this._isTokenValid.bind(this);
    }

    /**
     * Get a valid access token, either from cache or by requesting a new one
     * @returns {Promise<string>} The access token
     */
    async getAccessToken() {
        // Check if we have a valid cached token
        if (this._isTokenValid()) {
            this.logger.debug('Using cached access token');
            return this.tokenCache.accessToken;
        }

        // If a refresh is already in progress, queue this request
        if (this.isRefreshing) {
            return new Promise((resolve) => {
                this.refreshQueue.push(resolve);
            });
        }

        // Otherwise, request a new token
        try {
            this.isRefreshing = true;
            const token = await this._requestNewToken();
            
            // Resolve all queued requests
            while (this.refreshQueue.length > 0) {
                const resolve = this.refreshQueue.shift();
                resolve(token);
            }
            
            return token;
        } catch (error) {
            // Clear token cache on error
            this.tokenCache = {
                accessToken: null,
                expiresAt: 0,
                tokenType: 'Bearer',
                lastRefresh: 0
            };
            
            // Reject all queued requests
            while (this.refreshQueue.length > 0) {
                const resolve = this.refreshQueue.shift();
                resolve(Promise.reject(error));
            }
            
            throw error;
        } finally {
            this.isRefreshing = false;
        }
    }

    /**
     * Get token information including expiry details
     * @returns {Object|null} Token info object or null if no token
     */
    getTokenInfo() {
        if (!this.tokenCache.accessToken) {
            return null;
        }
        
        const now = Date.now();
        const expiresIn = Math.max(0, this.tokenCache.expiresAt - now);
        
        return {
            accessToken: this.tokenCache.accessToken,
            expiresIn: Math.floor(expiresIn / 1000), // Convert to seconds
            tokenType: this.tokenCache.tokenType,
            expiresAt: this.tokenCache.expiresAt,
            lastRefresh: this.tokenCache.lastRefresh,
            isValid: this._isTokenValid()
        };
    }

    /**
     * Check if the current token is still valid
     * @returns {boolean} True if token is valid, false otherwise
     * @private
     */
    _isTokenValid() {
        const now = Date.now();
        return this.tokenCache.accessToken && 
               this.tokenCache.expiresAt > (now + this.tokenExpiryBuffer) &&
               // Ensure token isn't too old (max 1 hour)
               (now - this.tokenCache.lastRefresh) < (60 * 60 * 1000);
    }

    /**
     * Get the auth domain for a given region
     * @private
     */
    _getAuthDomain(region) {
        const authDomainMap = {
            'NorthAmerica': 'auth.pingone.com',
            'Europe': 'auth.eu.pingone.com',
            'Canada': 'auth.ca.pingone.com',
            'Asia': 'auth.apsoutheast.pingone.com',
            'Australia': 'auth.aus.pingone.com',
            'US': 'auth.pingone.com',
            'EU': 'auth.eu.pingone.com',
            'AP': 'auth.apsoutheast.pingone.com'
        };
        return authDomainMap[region] || 'auth.pingone.com';
    }

    /**
     * Request a new access token from PingOne
     * @returns {Promise<string>} The new access token
     * @private
     */
    async _requestNewToken() {
        const { apiClientId, apiSecret, environmentId, region = 'NorthAmerica' } = this.settings;
        const requestId = `req_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();
        
        // Validate required settings
        if (!apiClientId || !apiSecret || !environmentId) {
            const error = new Error('Missing required API credentials in settings');
            this.logger.error('Token request failed: Missing credentials', {
                requestId,
                hasClientId: !!apiClientId,
                hasSecret: !!apiSecret,
                hasEnvId: !!environmentId
            });
            throw error;
        }

        // Prepare request
        const authDomain = this._getAuthDomain(region);
        const tokenUrl = `https://${authDomain}/${environmentId}/as/token`;
        const credentials = btoa(`${apiClientId}:${apiSecret}`);
        
        try {
            this.logger.debug('Requesting new access token from PingOne...', {
                requestId,
                authDomain,
                environmentId,
                region
            });
            
            const response = await fetch(tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${credentials}`
                },
                body: 'grant_type=client_credentials',
                credentials: 'omit'
            });

            const responseTime = Date.now() - startTime;
            let responseData;
            
            try {
                responseData = await response.json();
            } catch (e) {
                const text = await response.text().catch(() => 'Failed to read response text');
                throw new Error(`Invalid JSON response: ${e.message}. Response: ${text}`);
            }
            
            if (!response.ok) {
                const errorMsg = responseData.error_description || 
                               responseData.error || 
                               `HTTP ${response.status} ${response.statusText}`;
                
                this.logger.error('Token request failed', {
                    requestId,
                    status: response.status,
                    error: responseData.error,
                    errorDescription: responseData.error_description,
                    responseTime: `${responseTime}ms`,
                    url: tokenUrl
                });
                
                throw new Error(errorMsg);
            }
            
            if (!responseData.access_token) {
                throw new Error('No access token in response');
            }
            
            // Update token cache
            const expiresInMs = (responseData.expires_in || 3600) * 1000;
            this.tokenCache = {
                accessToken: responseData.access_token,
                expiresAt: Date.now() + expiresInMs,
                tokenType: responseData.token_type || 'Bearer',
                lastRefresh: Date.now()
            };
            
            this.logger.info('Successfully obtained new access token', {
                requestId,
                tokenType: this.tokenCache.tokenType,
                expiresIn: Math.floor(expiresInMs / 1000) + 's',
                responseTime: `${responseTime}ms`
            });
            
            return this.tokenCache.accessToken;
            
        } catch (error) {
            this.logger.error('Error getting access token', {
                requestId,
                error: error.toString(),
                message: error.message,
                url: tokenUrl,
                responseTime: `${Date.now() - startTime}ms`
            });
            
            // Clear token cache on error
            this.tokenCache = {
                accessToken: null,
                expiresAt: 0,
                tokenType: 'Bearer',
                lastRefresh: 0
            };
            
            throw error;
        }
    }
    
    /**
     * Update settings and clear token cache if credentials changed
     * @param {Object} newSettings - New settings object
     */
    updateSettings(newSettings) {
        const credentialsChanged = 
            newSettings.apiClientId !== this.settings.apiClientId ||
            newSettings.apiSecret !== this.settings.apiSecret ||
            newSettings.environmentId !== this.settings.environmentId ||
            newSettings.region !== this.settings.region;
        
        this.settings = { ...this.settings, ...newSettings };
        
        if (credentialsChanged) {
            this.logger.debug('API credentials changed, clearing token cache');
            this.tokenCache = {
                accessToken: null,
                expiresAt: 0,
                tokenType: 'Bearer',
                lastRefresh: 0
            };
        }
    }
}

export default TokenManager;
