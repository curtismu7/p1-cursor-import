/**
 * PingOne API Client
 * Handles all API calls to the PingOne API through the local proxy
 */

import { localAPI } from './local-api.js';

export class PingOneClient {
    /**
     * Create a new PingOneClient instance
     * @param {Object} logger - Logger instance
     * @param {Object} settingsManager - Settings manager instance
     */
    constructor(logger, settingsManager) {
        this.logger = logger || console;
        this.settingsManager = settingsManager;
        this.basePath = '/api/pingone';
    }

    /**
     * Get current settings from settings manager
     * @returns {Object} Current settings
     */
    getSettings() {
        return this.settingsManager.getSettings();
    }

    /**
     * Get the worker token from localStorage if available and not expired
     * @returns {string|null} Cached token or null if not available or expired
     */
    getCachedToken() {
        try {
            // Check if localStorage is available
            if (typeof localStorage === 'undefined' || typeof window === 'undefined') {
                return null;
            }
            
            // Check if localStorage is accessible (it might be disabled in private browsing)
            const testKey = 'pingone_test_key';
            try {
                localStorage.setItem(testKey, testKey);
                localStorage.removeItem(testKey);
            } catch (e) {
                console.warn('localStorage is not available:', e.message);
                return null;
            }
            
            const token = localStorage.getItem('pingone_worker_token');
            const expiry = localStorage.getItem('pingone_token_expiry');
            
            if (!token || !expiry) {
                return null;
            }
            
            const expiryTime = parseInt(expiry, 10);
            
            // Check if expiryTime is a valid number
            if (isNaN(expiryTime)) {
                console.warn('Invalid token expiry time');
                return null;
            }
            
            const now = Date.now();
            
            // If token is expired or will expire in the next 5 minutes, return null
            if (now >= expiryTime - (5 * 60 * 1000)) {
                return null;
            }
            
            return token;
        } catch (error) {
            console.error('Error accessing token cache:', error);
            return null;
        }
    }
    
    /**
     * Get an access token, using cached one if available and valid
     * @returns {Promise<string>} Access token
     */
    async getAccessToken() {
        // Check for cached token first
        const cachedToken = this.getCachedToken();
        if (cachedToken) {
            return cachedToken;
        }
        
        // If no cached token or it's expired, get a new one from the server
        try {
            const response = await fetch('/api/pingone/get-token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Failed to get access token: ${response.status} - ${error}`);
            }
            
            const data = await response.json();
            
            // Cache the new token
            try {
                if (typeof localStorage !== 'undefined' && typeof window !== 'undefined') {
                    const expiryTime = Date.now() + (data.expires_in * 1000);
                    try {
                        localStorage.setItem('pingone_worker_token', data.access_token);
                        localStorage.setItem('pingone_token_expiry', expiryTime.toString());
                    } catch (storageError) {
                        console.warn('Failed to store token in localStorage:', storageError);
                        // Continue without storing the token
                    }
                }
            } catch (error) {
                console.warn('Error accessing localStorage:', error);
                // Continue without storing the token
            }
            
            return data.access_token;
            
        } catch (error) {
            this.logger.error('Error getting access token:', error);
            throw error;
        }
    }
    
    /**
     * Make an authenticated API request to PingOne
     * @param {string} method - HTTP method (GET, POST, PUT, DELETE, etc.)
     * @param {string} endpoint - API endpoint (without base URL)
     * @param {Object} [data] - Request body (for POST/PUT/PATCH)
     * @param {Object} [options] - Additional options
     * @returns {Promise<Object>} Response data
     */
    async request(method, endpoint, data = null, options = {}) {
        const settings = this.getSettings();
        const url = `${this.basePath}${endpoint}`;
        
        // Get access token for all requests
        const accessToken = await this.getAccessToken();
        
        // Prepare headers
        const headers = {
            'Accept': 'application/json',
            'X-PingOne-Environment-Id': settings.environmentId,
            'X-PingOne-Region': settings.region,
            ...options.headers
        };
        
        // Add authorization header
        headers['Authorization'] = `Bearer ${accessToken}`;

        // Set content type if not already set
        if (method !== 'GET' && method !== 'HEAD' && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        // Log the request
        this.logger.debug('PingOne API Request:', {
            method,
            url,
            headers: { ...headers, 'Authorization': headers.Authorization ? '***REDACTED***' : 'Not set' },
            data
        });

        try {
            const response = await localAPI.request(
                method, 
                url, 
                data, 
                { ...options, headers }
            );

            // Log successful response
            this.logger.debug('PingOne API Response:', {
                status: 200, // Assuming success since localAPI throws on error
                url,
                data: response
            });

            return response;
        } catch (error) {
            this.logger.error('PingOne API Error:', error);
            throw error;
        }
    }


    /**
     * Get all populations from PingOne
     * @returns {Promise<Array>} Array of population objects
     */
    async getPopulations() {
        const settings = this.getSettings();
        return this.request('GET', `/environments/${settings.environmentId}/populations`);
    }

    /**
     * Test the connection to PingOne API
     * @returns {Promise<boolean>} True if connection is successful, false otherwise
     */
    async testConnection() {
        try {
            const settings = this.getSettings();
            // Try to get the populations endpoint as a way to test the connection
            await this.request('GET', `/environments/${settings.environmentId}/populations?limit=1`);
            return true;
        } catch (error) {
            this.logger.error('PingOne connection test failed:', error);
            return false;
        }
    }

    /**
     * Import users into PingOne
     * @param {Array<Object>} users - Array of user objects to import
     * @param {Object} options - Import options
     * @returns {Promise<Object>} Import results
     */
    async importUsers(users, options = {}) {
        const settings = this.getSettings();
        const endpoint = `/environments/${settings.environmentId}/users`;
        const { onProgress } = options;
        const results = [];
        const totalUsers = users.length;
        let successCount = 0;
        let failedCount = 0;
        let skippedCount = 0;
        
        // Process users in batches
        const batchSize = 5; // Adjust based on API rate limits
        
        for (let i = 0; i < totalUsers; i += batchSize) {
            // Process current batch
            const batch = users.slice(i, i + batchSize);
            const batchPromises = batch.map(async (user, batchIndex) => {
                const currentIndex = i + batchIndex;
                const currentUser = users[currentIndex];
                
                try {
                    // Call progress callback before processing each user
                    if (onProgress) {
                        onProgress(currentIndex, totalUsers, currentUser);
                    }
                    
                    const userData = {
                        name: {
                            given: currentUser.firstName || '',
                            family: currentUser.lastName || ''
                        },
                        email: currentUser.email,
                        username: currentUser.username || currentUser.email,
                        population: {
                            id: currentUser.populationId || settings.populationId
                        },
                        enabled: currentUser.enabled !== false
                    };

                    // Validate population ID - if CSV has invalid population ID, use settings
                    if (currentUser.populationId && currentUser.populationId !== settings.populationId) {
                        this.logger.warn(`User ${currentUser.email || currentUser.username} has invalid population ID '${currentUser.populationId}', using settings population ID '${settings.populationId}'`, 'warn');
                        userData.population.id = settings.populationId;
                        
                        // Show warning in UI if UI manager is available
                        if (window.uiManager && typeof window.uiManager.showPopulationWarning === 'function') {
                            window.uiManager.showPopulationWarning(currentUser.populationId, settings.populationId);
                        }
                    }

                    // Add password only if provided, otherwise let PingOne generate one
                    if (currentUser.password) {
                        userData.password = {
                            value: currentUser.password
                        };
                    }

                    // Add any additional user properties
                    if (currentUser.additionalProperties) {
                        Object.assign(userData, currentUser.additionalProperties);
                    }

                    // Make the API request
                    const result = await this.request('POST', endpoint, userData);
                    // Check for backend warning (uniqueness violation)
                    if (result && result.warning === true && /already exists/i.test(result.message)) {
                        this.logger.warn(`User ${currentUser.email || currentUser.username} already exists, skipping`, 'warn');
                        skippedCount++;
                        // Call progress callback for skipped user
                        if (onProgress) {
                            onProgress(currentIndex + 1, totalUsers, currentUser, {
                                success: successCount,
                                failed: failedCount,
                                skipped: skippedCount
                            });
                        }
                        return {
                            success: false,
                            user: currentUser,
                            error: 'User already exists',
                            skipped: true
                        };
                    }
                    successCount++;
                    return { success: true, user: currentUser, result };
                } catch (error) {
                    this.logger.error('Error importing user:', error);
                    failedCount++;
                    
                    if (options.continueOnError) {
                        // Old logic for 409 Conflict (should not be needed now, but keep for safety)
                        const isSkipped = error.response?.status === 409;
                        if (isSkipped) {
                            this.logger.warn(`User ${currentUser.email} already exists, skipping`, 'warn');
                            skippedCount++;
                            // Call progress callback for skipped user
                            if (onProgress) {
                                onProgress(currentIndex + 1, totalUsers, currentUser, {
                                    success: successCount,
                                    failed: failedCount,
                                    skipped: skippedCount
                                });
                            }
                            return { 
                                success: false, 
                                user: currentUser, 
                                error: 'User already exists',
                                skipped: true
                            };
                        }
                        return { 
                            success: false, 
                            user: currentUser, 
                            error: error.message,
                            skipped: false
                        };
                    }
                    throw error;
                }
            });
            
            // Wait for the current batch to complete
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
            
            // Do NOT update skippedCount or adjust successCount here (already handled per user)
            // Call progress callback after batch completes
            if (onProgress) {
                const processedCount = Math.min(i + batch.length, totalUsers);
                onProgress(processedCount, totalUsers, null, {
                    success: successCount,
                    failed: failedCount,
                    skipped: skippedCount
                });
            }
        }

        return {
            total: totalUsers,
            success: successCount,
            failed: failedCount,
            skipped: skippedCount,
            results
        };
    }

    /**
     * Generate a secure random password
     * @returns {string} A random password
     * @private
     */
    generateTemporaryPassword() {
        const length = 16;
        const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]\\:;?><,./-=';
        let password = 'Aa1!';
        
        // Fill the rest randomly
        for (let i = 0; i < length - 4; i++) {
            const randomIndex = Math.floor(Math.random() * charset.length);
            password += charset[randomIndex];
        }
        
        // Shuffle the password to make it more random
        return password.split('').sort(() => Math.random() - 0.5).join('');
    }
}
