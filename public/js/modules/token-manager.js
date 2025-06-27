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
        this.logger = logger;
        this.settings = settings;
        this.tokenCache = {
            accessToken: null,
            expiresAt: 0,
            tokenType: null
        };
        this.tokenExpiryBuffer = 5 * 60 * 1000; // 5 minutes buffer before token expiry
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

        // If no valid token, request a new one
        return this._requestNewToken();
    }

    /**
     * Check if the current token is still valid
     * @returns {boolean} True if token is valid, false otherwise
     * @private
     */
    _isTokenValid() {
        const now = Date.now();
        return this.tokenCache.accessToken && 
               this.tokenCache.expiresAt > (now + this.tokenExpiryBuffer);
    }

    /**
     * Request a new access token from PingOne
     * @returns {Promise<string>} The new access token
     * @private
     */
    async _requestNewToken() {
        const startTime = Date.now();
        const { apiClientId, apiSecret, environmentId } = this.settings;
        const requestId = `req_${Math.random().toString(36).substr(2, 9)}`;
        
        // Log the environment for debugging
        const envInfo = {
            requestId,
            hasClientId: !!apiClientId,
            clientIdPrefix: apiClientId ? `${apiClientId.substring(0, 4)}...` : 'none',
            hasSecret: !!apiSecret,
            hasEnvId: !!environmentId,
            envId: environmentId || 'none',
            timestamp: new Date().toISOString()
        };
        
        if (!apiClientId || !apiSecret || !environmentId) {
            const error = new Error('Missing required API credentials in settings');
            this.logger.error('Token request failed: Missing credentials', envInfo);
            throw error;
        }

        const tokenUrl = `https://auth.pingone.com/${environmentId}/as/token`;
        
        // Log token request details (without exposing full credentials)
        this.logger.debug('Preparing token request', {
            ...envInfo,
            tokenUrl: tokenUrl,
            requestMethod: 'POST',
            hasAuthHeader: true,
            hasContentType: true
        });

        let response;
        let responseData;
        const authString = btoa(`${apiClientId}:${apiSecret}`);
        
        try {
            // Make the request
            const fetchStart = Date.now();
            response = await fetch(tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${authString}`,
                    'Accept': 'application/json'
                },
                body: 'grant_type=client_credentials',
                credentials: 'omit' // Important for CORS
            });

            const responseTime = Date.now() - fetchStart;
            const totalTime = Date.now() - startTime;
            
            try {
                responseData = await response.json();
            } catch (e) {
                const text = await response.text().catch(() => 'Failed to read response text');
                this.logger.error('Failed to parse JSON response', {
                    ...envInfo,
                    status: response.status,
                    statusText: response.statusText,
                    responseText: text,
                    error: e.toString()
                });
                throw new Error(`Invalid JSON response: ${e.message}`);
            }
            
            // Log response details
            const logData = {
                ...envInfo,
                status: response.status,
                statusTime: `${responseTime}ms`,
                totalTime: `${totalTime}ms`,
                hasResponseData: !!responseData,
                hasAccessToken: !!(responseData && responseData.access_token)
            };
            
            if (!response.ok) {
                this.logger.error('Token request failed', {
                    ...logData,
                    error: responseData.error,
                    errorDescription: responseData.error_description,
                    responseHeaders: Object.fromEntries(response.headers.entries())
                });
                
                let errorMsg = responseData.error_description || 
                              responseData.error || 
                              `HTTP ${response.status} ${response.statusText}`;
                
                // Add more context to common errors
                if (response.status === 401) {
                    errorMsg = 'Authentication failed. Please check your API Client ID and Secret.';
                } else if (response.status === 403) {
                    errorMsg = 'Authorization failed. The provided credentials do not have sufficient permissions.';
                } else if (response.status === 404) {
                    errorMsg = 'Environment not found. Please check your Environment ID.';
                }
                
                throw new Error(errorMsg);
            }
            
            if (!responseData.access_token) {
                this.logger.error('No access token in response', {
                    ...logData,
                    responseData: responseData
                });
                throw new Error('No access token in response');
            }
            
            // Log successful token acquisition (without logging the actual token)
            this.logger.debug('Successfully obtained access token', {
                ...logData,
                tokenType: responseData.token_type,
                expiresIn: responseData.expires_in,
                scope: responseData.scope
            });
            
            // Cache the token and return it
            this._cacheToken(responseData);
            return responseData.access_token;
            
        } catch (error) {
            const errorInfo = {
                ...envInfo,
                error: error.toString(),
                errorName: error.name,
                errorMessage: error.message,
                errorStack: error.stack,
                isNetworkError: error instanceof TypeError && error.message.includes('fetch'),
                timestamp: new Date().toISOString()
            };
            
            // Log network errors with more details
            if (errorInfo.isNetworkError) {
                this.logger.error('Network error while requesting token', errorInfo);
                error.message = 'Network error. Please check your internet connection and CORS settings.';
            } else {
                this.logger.error('Failed to obtain access token', errorInfo);
            }
            
            // Re-throw with a more user-friendly message if needed
            if (error.message.includes('Failed to fetch')) {
                error.message = 'Failed to connect to PingOne. This might be due to network issues, CORS restrictions, or an invalid environment URL.';
            }
            
            throw error;
        }
    }

    /**
     * Cache the token and calculate expiry time
     * @param {Object} tokenData - Token data from PingOne
     * @private
     */
    _cacheToken(tokenData) {
        const now = Date.now();
        const expiresInMs = (tokenData.expires_in || 3600) * 1000; // Default to 1 hour if not provided
        const tokenLifetimeMs = Math.min(expiresInMs, 55 * 60 * 1000); // Cap at 55 minutes
        
        this.tokenCache = {
            accessToken: tokenData.access_token,
            tokenType: tokenData.token_type || 'Bearer',
            expiresAt: now + tokenLifetimeMs
        };

        this.logger.debug('Token cached', {
            tokenType: this.tokenCache.tokenType,
            expiresAt: new Date(this.tokenCache.expiresAt).toISOString(),
            lifetimeMinutes: Math.round(tokenLifetimeMs / 60000),
            tokenPreview: this.tokenCache.accessToken 
                ? `${this.tokenCache.accessToken.substring(0, 10)}...` 
                : 'empty'
        });
    }

    /**
     * Update the settings used for token requests
     * @param {Object} newSettings - New settings to use
     */
    updateSettings(newSettings) {
        if (!newSettings || typeof newSettings !== 'object') {
            this.logger.warn('Invalid settings provided to updateSettings');
            return;
        }
        
        // Only update if settings have actually changed
        const settingsChanged = Object.keys(newSettings).some(
            key => this.settings[key] !== newSettings[key]
        );
        
        if (settingsChanged) {
            this.logger.debug('Updating token manager settings');
            this.settings = { ...this.settings, ...newSettings };
            // Clear any cached token since settings changed
            this.clearToken();
        }
    }

    /**
     * Clear the cached token
     */
    clearToken() {
        this.tokenCache = {
            accessToken: null,
            expiresAt: 0,
            tokenType: null
        };
        this.logger.debug('Cleared cached token');
    }
}

module.exports = TokenManager;
