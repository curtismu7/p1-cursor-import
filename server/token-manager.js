// File: server/token-manager.js
// Description: PingOne API token management for server-side authentication
// 
// This module handles authentication with PingOne APIs by managing access tokens.
// It provides token caching, automatic refresh, rate limiting, and credential
// management from both environment variables and settings files.
// 
// Key Features:
// - Token caching with automatic refresh before expiry
// - Rate limiting to prevent API abuse
// - Support for encrypted API secrets
// - Fallback credential sources (env vars, settings file)
// - Queue management for concurrent token requests

import fetch from 'node-fetch';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Token Manager Class
 * 
 * Manages PingOne API authentication tokens with caching, automatic refresh,
 * and rate limiting. Handles credential retrieval from multiple sources
 * and provides a unified interface for token access.
 * 
 * @param {Object} logger - Logger instance for debugging and error reporting
 */
class TokenManager {
    constructor(logger) {
        // Initialize logger with fallback to console methods
        this.logger = logger || {
            debug: console.debug.bind(console),
            info: console.log.bind(console),
            warn: console.warn.bind(console),
            error: console.error.bind(console)
        };
        
        // Token state management
        this.token = null;
        this.tokenExpiry = null;
        this.isRefreshing = false;
        this.refreshQueue = [];
        
        // Rate limiting configuration
        // Prevents API abuse by limiting token requests to 20 per second
        this.lastTokenRequest = 0;
        this.minRequestInterval = 50; // Minimum 50ms between token requests (20/sec)
    }

    /**
     * Read application settings from the settings.json file
     * 
     * Loads configuration data including API credentials from the data/settings.json
     * file. This provides a fallback source for credentials when environment
     * variables are not available.
     * 
     * @private
     * @returns {Promise<Object|null>} Settings object or null if file cannot be read
     */
    async readSettingsFromFile() {
        try {
            // Use process.cwd() for a consistent, project-root-relative path
            const settingsPath = path.join(process.cwd(), 'data', 'settings.json');
            const data = await fs.readFile(settingsPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            this.logger.warn('Failed to read settings from file:', error.message);
            return null;
        }
    }

    /**
     * Get API credentials from multiple sources
     * 
     * Retrieves PingOne API credentials from environment variables first,
     * then falls back to the settings file. Supports both encrypted and
     * plain text API secrets, with automatic decryption when needed.
     * 
     * @private
     * @returns {Promise<Object|null>} Credentials object or null if not available
     */
    async getCredentials() {
        // Helper function to get a setting by multiple possible keys
        // Handles different naming conventions (camelCase, kebab-case)
        const getSetting = (obj, ...keys) => {
            for (const key of keys) {
                if (obj && typeof obj === 'object' && obj[key]) return obj[key];
            }
            return undefined;
        };

        // First try environment variables (preferred source)
        let clientId = process.env.PINGONE_CLIENT_ID;
        let clientSecret = process.env.PINGONE_CLIENT_SECRET;
        let environmentId = process.env.PINGONE_ENVIRONMENT_ID;
        let region = process.env.PINGONE_REGION || 'NorthAmerica';

        // Check if environment variables are actually set (not just empty strings)
        const hasEnvVars = clientId && clientSecret && environmentId;
        
        if (!hasEnvVars) {
            this.logger.info('Environment variables missing or incomplete, reading from settings file');
            const settings = await this.readSettingsFromFile();
            
            if (settings) {
                this.logger.debug('Settings loaded from file:', Object.keys(settings));
                
                // Debug: Check what we're actually getting
                this.logger.debug('Raw settings:', {
                    'api-client-id': settings['api-client-id'],
                    'environment-id': settings['environment-id'],
                    'api-secret': settings['api-secret'],
                    'apiClientId': settings.apiClientId,
                    'environmentId': settings.environmentId,
                    'apiSecret': settings.apiSecret
                });
                
                // Accept both camelCase and kebab-case
                clientId = clientId || getSetting(settings, 'apiClientId', 'api-client-id');
                environmentId = environmentId || getSetting(settings, 'environmentId', 'environment-id');
                region = region || getSetting(settings, 'region') || 'NorthAmerica';

                // Prefer plain api-secret if both exist
                let apiSecret = getSetting(settings, 'api-secret', 'apiSecret');
                
                this.logger.debug('API secret selected:', apiSecret ? (apiSecret.startsWith('enc:') ? '[ENCRYPTED]' : '[PLAIN]') : 'not found');
                if (!clientSecret && apiSecret) {
                    if (apiSecret.startsWith('enc:')) {
                        // This is an encrypted value, try to decrypt it
                        try {
                            clientSecret = await this.decryptApiSecret(apiSecret);
                            if (clientSecret) {
                                this.logger.info('Successfully decrypted API secret from settings file');
                            } else {
                                this.logger.error('Failed to decrypt API secret - please re-enter it in settings');
                                return null;
                            }
                        } catch (error) {
                            this.logger.error('Failed to decrypt API secret:', error.message);
                            this.logger.error('Please re-enter the API secret in the settings to fix this issue');
                            return null;
                        }
                    } else {
                        // This is an unencrypted value - use it directly
                        clientSecret = apiSecret;
                        this.logger.info('Using plain text API secret from settings file');
                    }
                }
                
                this.logger.debug('Final credentials check:', {
                    clientId: clientId ? '***' + clientId.slice(-4) : 'missing',
                    environmentId: environmentId ? '***' + environmentId.slice(-4) : 'missing',
                    clientSecret: clientSecret ? '***' + clientSecret.slice(-4) : 'missing',
                    region: region
                });
            }
        }


        // Final check: all required credentials must be present
        if (!clientId || !clientSecret || !environmentId) {
            this.logger.error('Missing PingOne credentials: clientId, clientSecret, or environmentId');
            return null;
        }

        return { clientId, clientSecret, environmentId, region };
    }

    /**
     * Decrypt API secret using a simple approach
     * @private
     */
    async decryptApiSecret(encryptedValue) {
        try {
            // Remove the 'enc:' prefix
            const encryptedData = encryptedValue.substring(4);
            
            // For now, we'll use a simple base64 decode as a fallback
            // This assumes the frontend is using a simple encryption method
            const decoded = Buffer.from(encryptedData, 'base64').toString('utf8');
            
            // If the decoded value looks like a valid API secret (contains valid characters)
            if (decoded && decoded.length > 0 && !decoded.includes('')) {
                return decoded;
            }
            
            // If base64 decode didn't work, the value might be encrypted with a different method
            this.logger.warn('API secret appears to be encrypted with a method not supported by server');
            return null;
        } catch (error) {
            this.logger.error('Failed to decrypt API secret:', error.message);
            return null;
        }
    }

    /**
     * Check if we can make a token request (rate limiting)
     * @private
     */
    canMakeTokenRequest() {
        const now = Date.now();
        if (now - this.lastTokenRequest < this.minRequestInterval) {
            // Instead of throwing, just return false and let the caller handle it
            return false;
        }
        this.lastTokenRequest = now;
        return true;
    }

    /**
     * Get an access token from PingOne
     * @param {Object} customSettings - Optional custom settings to use instead of environment variables
     * @returns {Promise<string>} Access token
     */
    async getAccessToken(customSettings = null) {
        // Return cached token if it's still valid (with 2 minute buffer) and no custom settings
        if (!customSettings) {
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
        }

        // Rate limiting check for new token requests - MORE FORGIVING
        if (!this.canMakeTokenRequest()) {
            this.logger.warn('Token request rate limited, using cached token if available');
            if (this.token) {
                return this.token;
            }
            // Instead of throwing, wait a bit and try again
            await new Promise(resolve => setTimeout(resolve, 100));
            return this.getAccessToken(customSettings);
        }

        // Get credentials from settings file or environment variables
        let credentials;
        if (customSettings) {
            credentials = {
                clientId: customSettings.apiClientId,
                clientSecret: customSettings.apiSecret,
                environmentId: customSettings.environmentId,
                region: customSettings.region || 'NorthAmerica'
            };
        } else {
            credentials = await this.getCredentials();
        }

        if (!credentials) {
            throw new Error('PingOne API credentials are not properly configured. Please check your settings.');
        }

        const { clientId, clientSecret, environmentId, region } = credentials;

        if (!clientId || !clientSecret || !environmentId) {
            throw new Error('PingOne API credentials are not properly configured');
        }

        // Always use the global auth endpoint for token requests
        const authUrl = `https://auth.pingone.com/${environmentId}/as/token`;
        
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
                let friendlyMessage = '';
                
                try {
                    const errorJson = JSON.parse(errorText);
                    errorDetails = JSON.stringify(errorJson, null, 2);
                } catch (e) {
                    // If we can't parse as JSON, use the text as is
                }
                
                // Create friendly error messages based on status code
                if (response.status === 400) {
                    friendlyMessage = '🔍 Invalid Request: The PingOne Environment ID appears to be incorrect or malformed. Please verify your Environment ID.';
                } else if (response.status === 401) {
                    friendlyMessage = '🔑 Authentication Failed: Your PingOne Client ID or Client Secret is incorrect. Please check your credentials in the settings.';
                } else if (response.status === 403) {
                    friendlyMessage = '🚫 Access Denied: Your PingOne application may not have the required permissions. Please check your application configuration.';
                } else if (response.status === 404) {
                    friendlyMessage = '🔍 Environment Not Found: The PingOne Environment ID appears to be incorrect. Please verify your Environment ID.';
                } else if (response.status === 429) {
                    friendlyMessage = '⏰ Rate Limited: Too many authentication requests. Please wait a moment before trying again.';
                } else if (response.status >= 500) {
                    friendlyMessage = '🔧 Server Error: PingOne authentication service is experiencing issues. Please try again later.';
                } else {
                    friendlyMessage = `🔐 Authentication Error: Failed to authenticate with PingOne (${response.status})`;
                }
                
                console.error('Error response:', {
                    status: response.status,
                    statusText: response.statusText,
                    headers: Object.fromEntries(response.headers.entries()),
                    body: errorDetails
                });
                
                throw new Error(friendlyMessage);
            }

            const data = await response.json();
            
            // Cache the token with expiry time (expire at 55 minutes instead of 60)
            const expiresInMs = (data.expires_in || 3600) * 1000; // Default to 1 hour if not specified
            const tokenLifetimeMs = Math.min(expiresInMs, 55 * 60 * 1000); // Cap at 55 minutes
            this.token = data.access_token;
            this.tokenExpiry = Date.now() + tokenLifetimeMs;
            
            const actualExpiresInMinutes = Math.floor(tokenLifetimeMs / 1000 / 60);
            this.logger.info(`New token obtained, expires in ${actualExpiresInMinutes} minutes (capped at 55 minutes)`);
            
            if (actualExpiresInMinutes < 10) {
                this.logger.warn(`Token has short expiration time: ${actualExpiresInMinutes} minutes`);
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
     * Get token information including expiry details
     * @returns {Object|null} Token info object or null if no token
     */
    getTokenInfo() {
        if (!this.token || !this.tokenExpiry) {
            return null;
        }
        
        const now = Date.now();
        const expiresIn = Math.max(0, this.tokenExpiry - now);
        
        return {
            accessToken: this.token,
            expiresIn: Math.floor(expiresIn / 1000), // Convert to seconds
            tokenType: 'Bearer',
            expiresAt: this.tokenExpiry,
            lastRefresh: this.lastTokenRequest,
            isValid: expiresIn > (2 * 60 * 1000) // Valid if more than 2 minutes left
        };
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