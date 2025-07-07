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
        this.localAPI = localAPI; // Store localAPI for reuse
        this.accessToken = null; // Initialize accessToken
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
            let timeLeftMsg = '';
            if (typeof localStorage !== 'undefined') {
                const expiry = localStorage.getItem('pingone_token_expiry');
                if (expiry) {
                    const expiryTime = parseInt(expiry, 10);
                    const now = Date.now();
                    const msLeft = expiryTime - now;
                    if (msLeft > 0) {
                        const min = Math.floor(msLeft / 60000);
                        const sec = Math.floor((msLeft % 60000) / 1000);
                        timeLeftMsg = ` (expires in ${min}m ${sec}s)`;
                    }
                }
            }
            const msg = `✅ Using cached PingOne Worker token${timeLeftMsg}`;
            if (typeof window !== 'undefined' && window.app && window.app.uiManager) {
                window.app.uiManager.updateConnectionStatus('connected', msg);
                window.app.uiManager.showNotification(msg, 'success');
            }
            this.accessToken = cachedToken; // Cache the token
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
                        
                        // Update status bar with new token info
                        let timeLeftMsg = '';
                        const min = Math.floor(data.expires_in / 60);
                        const sec = data.expires_in % 60;
                        timeLeftMsg = ` (expires in ${min}m ${sec}s)`;
                        
                        const msg = `✅ New PingOne Worker token obtained${timeLeftMsg}`;
                        if (window.app && window.app.uiManager) {
                            window.app.uiManager.updateConnectionStatus('connected', msg);
                            window.app.uiManager.showNotification(msg, 'success');
                        }
                    } catch (storageError) {
                        console.warn('Failed to store token in localStorage:', storageError);
                        // Continue without storing the token
                    }
                }
            } catch (error) {
                console.warn('Error accessing localStorage:', error);
                // Continue without storing the token
            }
            
            this.accessToken = data.access_token; // Cache the token
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
        const startTime = Date.now();

        // Get access token for all requests
        if (!this.accessToken) {
            await this.getAccessToken();
        }

        // Prepare headers
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${this.accessToken}`
        };

        // Log the request with minimal details to avoid rate limiting
        const requestLog = {
            type: 'api_request',
            method,
            url,
            timestamp: new Date().toISOString(),
            source: 'pingone-client'
        };
        this.logger.debug('🔄 PingOne API Request:', requestLog);

        // Retry logic
        let lastError = null;
        for (let attempt = 1; attempt <= (options.retries || 3); attempt++) {
            try {
                const response = await this.localAPI.request(method, url, data, options);
                
                // Log successful response with minimal details
                const responseLog = {
                    type: 'api_response',
                    status: 200,
                    method,
                    duration: Date.now() - startTime,
                    attempt: attempt,
                    source: 'pingone-client'
                };
                this.logger.debug('✅ PingOne API Response:', responseLog);
                
                return response;
            } catch (error) {
                lastError = error;
                this.logger.error(`PingOne API Error (attempt ${attempt}/${options.retries || 3}):`, error);

                // Get the friendly error message if available
                const friendlyMessage = error.friendlyMessage || error.message;
                const isRateLimit = error.status === 429 || error.message.includes('429');
                const isBadRequest = error.status === 400;

                // Calculate baseDelay and delay here, before using them
                const baseDelay = isRateLimit ? (options.retryDelay || 1000) * 2 : (options.retryDelay || 1000);
                const delay = baseDelay * Math.pow(2, attempt - 1);

                // Show appropriate UI messages based on error type
                if (window.app && window.app.uiManager) {
                    if (isRateLimit) {
                        if (attempt < (options.retries || 3)) {
                            // Use enhanced rate limit warning with retry information
                            window.app.uiManager.showRateLimitWarning(friendlyMessage, {
                                isRetrying: true,
                                retryAttempt: attempt,
                                maxRetries: options.retries || 3,
                                retryDelay: delay
                            });
                        } else {
                            window.app.uiManager.showError(friendlyMessage);
                        }
                    } else if (isBadRequest) {
                        window.app.uiManager.showError(friendlyMessage);
                    } else if (attempt === (options.retries || 3)) {
                        window.app.uiManager.showError(friendlyMessage);
                    }
                }

                // If this is the last attempt, throw with friendly message
                if (attempt === (options.retries || 3)) {
                    throw error;
                }

                // Only retry for rate limits (429) and server errors (5xx)
                const shouldRetry = isRateLimit || error.status >= 500 || !error.status;
                if (!shouldRetry) {
                    // Don't retry for client errors (4xx except 429), throw immediately
                    throw error;
                }

                // Use the delay calculated above
                this.logger.info(`Retrying request in ${delay}ms... (attempt ${attempt + 1}/${options.retries || 3})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        // If all retries fail, throw the last error
        throw lastError;
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
        const { onProgress, retryAttempts = 3, delayBetweenRetries = 1000, importOptions = {} } = options;
        const results = [];
        const totalUsers = users.length;
        let successCount = 0;
        let failedCount = 0;
        let skippedCount = 0;
        let retryCount = 0;

        // Validate input
        if (!users || !Array.isArray(users) || users.length === 0) {
            throw new Error('No users provided for import');
        }

        if (!settings.environmentId) {
            throw new Error('Environment ID not configured');
        }

        // Handle population selection based on import options
        const { selectedPopulationId, useCsvPopulationId, useDefaultPopulation } = importOptions;
        
        // Determine the fallback population ID
        let fallbackPopulationId = null;
        
        // Priority 1: Selected population from dropdown
        if (selectedPopulationId) {
            fallbackPopulationId = selectedPopulationId;
        }
        // Priority 2: Default population from settings
        else if (useDefaultPopulation && settings.populationId) {
            fallbackPopulationId = settings.populationId;
        }
        // Priority 3: Fetch populations from PingOne and use first one
        else {
            try {
                const populationsResp = await this.getPopulations();
                let populations = populationsResp && populationsResp._embedded && populationsResp._embedded.populations ? populationsResp._embedded.populations : [];
                if (populations.length > 0) {
                    // Use the first population as default (or find one marked as default if available)
                    fallbackPopulationId = populations[0].id;
                    // Optionally, look for a population marked as default
                    const defaultPop = populations.find(p => p.default === true);
                    if (defaultPop) fallbackPopulationId = defaultPop.id;
                } else {
                    // No populations exist, prompt the user and return
                    if (window.app && window.app.uiManager) {
                        window.app.uiManager.showNotification('No populations found in PingOne. Please create a population and try again.', 'error');
                        window.app.showView('import');
                    }
                    return {
                        total: totalUsers,
                        success: 0,
                        failed: 0,
                        skipped: 0,
                        results: [],
                        error: 'No populations found in PingOne.'
                    };
                }
            } catch (err) {
                this.logger.error('Failed to fetch populations from PingOne:', err);
                if (window.app && window.app.uiManager) {
                    window.app.uiManager.showNotification('Failed to fetch populations from PingOne. Please check your connection and try again.', 'error');
                    window.app.showView('import');
                }
                return {
                    total: totalUsers,
                    success: 0,
                    failed: 0,
                    skipped: 0,
                    results: [],
                    error: 'Failed to fetch populations from PingOne.'
                };
            }
        }
        
        this.logger.info('Population selection for import', {
            useCsvPopulationId,
            selectedPopulationId,
            useDefaultPopulation,
            fallbackPopulationId,
            settingsPopulationId: settings.populationId
        });
        
        // Process users in batches with improved error handling
        const batchSize = 10; // Increased from 5 to 10 for better throughput
        
        for (let i = 0; i < totalUsers; i += batchSize) {
            // Process current batch
            const batch = users.slice(i, i + batchSize);
            
            // Process users sequentially within each batch to avoid overwhelming the API
            for (let batchIndex = 0; batchIndex < batch.length; batchIndex++) {
                const currentIndex = i + batchIndex;
                const currentUser = users[currentIndex];
                
                try {
                    // Call progress callback before processing each user
                    if (onProgress) {
                        onProgress(currentIndex, totalUsers, currentUser, {
                            success: successCount,
                            failed: failedCount,
                            skipped: skippedCount,
                            retries: retryCount
                        });
                    }
                    
                    // Validate user data before creating
                    const validationError = this.validateUserForImport(currentUser);
                    if (validationError) {
                        this.logger.warn(`User validation failed for ${currentUser.email || currentUser.username}: ${validationError}`, 'warn');
                        skippedCount++;
                        return {
                            success: false,
                            user: currentUser,
                            error: validationError,
                            skipped: true
                        };
                    }
                    
                    // Determine population ID for this user
                    let userPopulationId = fallbackPopulationId;
                    
                    if (useCsvPopulationId && currentUser.populationId) {
                        // Use population ID from CSV if available
                        userPopulationId = currentUser.populationId;
                        this.logger.info(`Using CSV population ID for user ${currentUser.email || currentUser.username}: ${userPopulationId}`);
                    } else if (fallbackPopulationId) {
                        // Use fallback population ID
                        this.logger.info(`Using fallback population ID for user ${currentUser.email || currentUser.username}: ${fallbackPopulationId}`);
                    } else {
                        throw new Error('No population ID available for user');
                    }
                    
                    const userData = {
                        name: {
                            given: currentUser.firstName || '',
                            family: currentUser.lastName || ''
                        },
                        email: currentUser.email,
                        username: currentUser.username || currentUser.email,
                        population: {
                            id: userPopulationId
                        },
                        enabled: currentUser.enabled !== false
                    };

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

                    // Make the API request with retry logic
                    let result;
                    let lastError;
                    
                    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
                        try {
                            result = await this.request('POST', endpoint, userData);
                            
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
                            lastError = error;
                            
                            // Check if this is a retryable error
                            if (this.isRetryableError(error) && attempt < retryAttempts) {
                                this.logger.warn(`Attempt ${attempt} failed for user ${currentUser.email || currentUser.username}, retrying in ${delayBetweenRetries}ms...`, 'warn');
                                retryCount++;
                                await new Promise(resolve => setTimeout(resolve, delayBetweenRetries));
                                continue;
                            }
                            
                            // If we've exhausted retries or it's not retryable, break
                            break;
                        }
                    }
                    
                    // If we get here, all attempts failed
                    this.logger.error(`All ${retryAttempts} attempts failed for user ${currentUser.email || currentUser.username}: ${lastError.message}`, 'error');
                    failedCount++;
                    
                    if (options.continueOnError) {
                        return { 
                            success: false, 
                            user: currentUser, 
                            error: lastError.message,
                            skipped: false
                        };
                    }
                    throw lastError;
                    
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
                
                // Add small delay between individual user operations to prevent rate limiting
                if (batchIndex < batch.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay between users
                }
            }
            
            // Add delay between batches to avoid rate limiting
            if (i + batchSize < totalUsers) {
                await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay between batches
            }
            
            // Call progress callback after batch completes
            if (onProgress) {
                const processedCount = Math.min(i + batch.length, totalUsers);
                onProgress(processedCount, totalUsers, null, {
                    success: successCount,
                    failed: failedCount,
                    skipped: skippedCount,
                    retries: retryCount
                });
            }
        }

        return {
            total: totalUsers,
            success: successCount,
            failed: failedCount,
            skipped: skippedCount,
            retries: retryCount,
            results
        };
    }

    /**
     * Validate user data for import
     * @param {Object} user - User object to validate
     * @returns {string|null} Error message or null if valid
     * @private
     */
    validateUserForImport(user) {
        // Check required fields
        if (!user.username) {
            return 'User must have a username';
        }
        
        // Validate email format if provided
        if (user.email && !this.isValidEmail(user.email)) {
            return 'Invalid email format';
        }
        
        // Validate username format if provided
        if (user.username && !this.isValidUsername(user.username)) {
            return 'Invalid username format (no spaces or special characters)';
        }
        
        // Validate enabled field if provided
        if (user.enabled !== undefined && typeof user.enabled !== 'boolean') {
            return 'Enabled field must be true or false';
        }
        
        return null;
    }

    /**
     * Check if email is valid
     * @param {string} email - Email to validate
     * @returns {boolean} True if valid
     * @private
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Check if username is valid
     * @param {string} username - Username to validate
     * @returns {boolean} True if valid
     * @private
     */
    isValidUsername(username) {
        // Username should not contain spaces or special characters
        const usernameRegex = /^[a-zA-Z0-9._-]+$/;
        return usernameRegex.test(username);
    }

    /**
     * Check if an error is retryable
     * @param {Error} error - Error to check
     * @returns {boolean} True if retryable
     * @private
     */
    isRetryableError(error) {
        // Retry on rate limits, network errors, and server errors
        const retryableStatuses = [429, 500, 502, 503, 504];
        const retryableMessages = ['rate limit', 'timeout', 'network', 'connection'];
        
        if (error.response?.status && retryableStatuses.includes(error.response.status)) {
            return true;
        }
        
        if (error.message) {
            const lowerMessage = error.message.toLowerCase();
            return retryableMessages.some(msg => lowerMessage.includes(msg));
        }
        
        return false;
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

    /**
     * Delete users from PingOne based on CSV input (safe duplicate of deleteUsers)
     * @param {Array<Object>} users - Array of user objects to delete (must have username or email)
     * @param {Object} options - Delete options
     * @returns {Promise<Object>} Delete results
     */
    async deleteUsersFromCsv(users, options = {}) {
        const { onProgress, batchSize = 10, delayBetweenBatches = 1000 } = options;
        const results = {
            total: users.length,
            success: 0,
            failed: 0,
            skipped: 0,
            details: []
        };

        // Process users in batches to avoid overwhelming the API
        for (let i = 0; i < users.length; i += batchSize) {
            const batch = users.slice(i, i + batchSize);
            
            // Process users sequentially within each batch to avoid overwhelming the API
            for (let batchIndex = 0; batchIndex < batch.length; batchIndex++) {
                const user = batch[batchIndex];
                const userIndex = i + batchIndex;
                const current = userIndex + 1;
                
                try {
                    // Minimal logging for user lookup
                    this.logger.info(`[DELETE] Processing user ${current}/${users.length}: ${user.username || user.email || 'Unknown'}`);
                    
                    // Find user by userId, username, or email with enhanced fallback
                    let existingUser = null;
                    let lookupMethod = null;
                    
                    // First, try to find user by userId if provided (direct lookup)
                    if (user.userId || user.id) {
                        const userId = user.userId || user.id;
                        try {
                            const response = await this.request('GET', `/environments/${this.getSettings().environmentId}/users/${userId}`);
                            existingUser = response;
                            lookupMethod = 'userId';
                            this.logger.info(`[DELETE] Found user by ID: "${userId}"`);
                        } catch (error) {
                            this.logger.debug(`[DELETE] User ID lookup failed for "${userId}": ${error.message}`);
                        }
                    }
                    
                    // If no user found by ID, try username (if provided)
                    if (!existingUser && user.username) {
                        try {
                            const response = await this.request('GET', `/environments/${this.getSettings().environmentId}/users?filter=username eq "${encodeURIComponent(user.username)}"`);
                            
                            if (response._embedded && response._embedded.users && response._embedded.users.length > 0) {
                                existingUser = response._embedded.users[0];
                                lookupMethod = 'username';
                                this.logger.info(`[DELETE] Found user by username: "${user.username}"`);
                            } else {
                                this.logger.debug(`[DELETE] No user found by username: "${user.username}"`);
                            }
                        } catch (error) {
                            this.logger.debug(`[DELETE] Username lookup failed for "${user.username}": ${error.message}`);
                        }
                    }
                    
                    // If no user found by ID or username, try email (if provided)
                    // NOTE: If username was found, we skip email lookup to avoid conflicts
                    if (!existingUser && user.email) {
                        try {
                            const response = await this.request('GET', `/environments/${this.getSettings().environmentId}/users?filter=email eq "${encodeURIComponent(user.email)}"`);
                            
                            if (response._embedded && response._embedded.users && response._embedded.users.length > 0) {
                                const emailUser = response._embedded.users[0];
                                existingUser = emailUser;
                                lookupMethod = 'email';
                                this.logger.info(`[DELETE] Found user by email: "${user.email}"`);
                            } else {
                                this.logger.debug(`[DELETE] No user found by email: "${user.email}"`);
                            }
                        } catch (error) {
                            this.logger.debug(`[DELETE] Email lookup failed for "${user.email}": ${error.message}`);
                        }
                    }
                    
                    if (!existingUser) {
                        results.failed++;
                        results.details.push({
                            user,
                            status: 'failed',
                            reason: 'User not found in PingOne'
                        });
                        this.logger.warn(`[DELETE] User not found: ${user.username || user.email || 'Unknown'}`);
                        continue;
                    }
                    
                    // Log the user we're about to delete
                    this.logger.info(`[DELETE] Deleting user found by ${lookupMethod}: ${existingUser.username || existingUser.email}`);
                    
                    // Delete the user
                    await this.request('DELETE', `/environments/${this.getSettings().environmentId}/users/${existingUser.id}`);
                    
                    // Only increment success if the DELETE request succeeds
                    results.success++;
                    results.details.push({
                        user,
                        status: 'success',
                        pingOneId: existingUser.id,
                        lookupMethod: lookupMethod
                    });
                    
                    this.logger.info(`[DELETE] Successfully deleted user: ${existingUser.username || existingUser.email}`);
                    
                } catch (error) {
                    // Check if this is a 404 error (user not found)
                    if (error.status === 404 || error.message.includes('404') || error.message.includes('not found')) {
                        results.skipped++;
                        results.details.push({
                            user,
                            status: 'skipped',
                            reason: 'User not found (404)'
                        });
                        
                        this.logger.warn(`[DELETE] User '${user.username || user.email}' not found in PingOne (404). Skipping.`);
                    } else if (error.status === 429) {
                        // Rate limit error - retry this user later
                        results.failed++;
                        results.details.push({
                            user,
                            status: 'failed',
                            error: 'Rate limited - will retry automatically'
                        });
                        
                        this.logger.warn(`[DELETE] Rate limited while processing user '${user.username || user.email}'. Will retry.`);
                        throw error; // Re-throw to trigger retry logic
                    } else {
                        results.failed++;
                        results.details.push({
                            user,
                            status: 'failed',
                            error: error.message
                        });
                        
                        this.logger.error(`[DELETE] Failed to delete user '${user.username || user.email}': ${error.message}`);
                    }
                }
                
                // Update progress for each user
                if (onProgress) {
                    onProgress({
                        current,
                        total: users.length,
                        success: results.success,
                        failed: results.failed,
                        skipped: results.skipped
                    });
                }
                
                // Add small delay between individual user operations to prevent rate limiting
                if (batchIndex < batch.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay between users
                }
            }
            
            // Add delay between batches to avoid rate limiting
            if (i + batchSize < users.length && delayBetweenBatches > 0) {
                await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
            }
            
            // Log batch completion
            this.logger.info(`[DELETE] Completed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(users.length / batchSize)}`);
        }
        
        return results;
    }

    /**
     * Delete a single user by ID
     * @param {string} userId - User ID to delete
     * @returns {Promise<void>}
     */
    async deleteUser(userId) {
        if (!userId) {
            throw new Error('User ID is required for deletion');
        }

        try {
            this.logger.info(`[DELETE] Deleting user with ID: ${userId}`);
            await this.request('DELETE', `/environments/${this.getSettings().environmentId}/users/${userId}`);
            this.logger.info(`[DELETE] Successfully deleted user: ${userId}`);
        } catch (error) {
            this.logger.error(`[DELETE] Failed to delete user ${userId}: ${error.message}`);
            throw error;
        }
    }

    async modifyUsersFromCsv(users, options = {}) {
        const { onProgress, batchSize = 10, delayBetweenBatches = 1000, createIfNotExists = false, updateUserStatus = false, defaultPopulationId = '', defaultEnabled = true, generatePasswords = true } = options;
        const results = {
            total: users.length,
            modified: 0,
            created: 0,
            failed: 0,
            skipped: 0,
            noChanges: 0,
            details: []
        };

        // Process users in batches to avoid overwhelming the API
        for (let i = 0; i < users.length; i += batchSize) {
            const batch = users.slice(i, i + batchSize);
            const batchPromises = batch.map(async (user, batchIndex) => {
                const userIndex = i + batchIndex;
                const current = userIndex + 1;
                
                try {
                    // Enhanced logging for user lookup
                    this.logger.info(`[MODIFY] Processing user ${current}/${users.length}:`, {
                        userId: user.userId || user.id || 'NOT_PROVIDED',
                        username: user.username || 'NOT_PROVIDED',
                        email: user.email || 'NOT_PROVIDED',
                        rawUserData: user
                    });
                    
                    // Find user by userId, username, or email with enhanced fallback
                    let existingUser = null;
                    let lookupMethod = null;
                    
                    // First, try to find user by userId if provided (direct lookup)
                    if (user.userId || user.id) {
                        const userId = user.userId || user.id;
                        try {
                            this.logger.debug(`[MODIFY] Looking up user by ID: "${userId}"`);
                            const response = await this.request('GET', `/environments/${this.getSettings().environmentId}/users/${userId}`);
                            existingUser = response;
                            lookupMethod = 'userId';
                            this.logger.info(`[MODIFY] Found user by ID: "${userId}" -> ID: ${existingUser.id}`);
                        } catch (error) {
                            this.logger.debug(`[MODIFY] Error looking up user by ID "${userId}":`, error.message);
                        }
                    }
                    
                    // If no user found by ID, try username (if provided)
                    if (!existingUser && user.username) {
                        try {
                            this.logger.debug(`[MODIFY] Looking up user by username: "${user.username}"`);
                            const response = await this.request('GET', `/environments/${this.getSettings().environmentId}/users?filter=username eq "${encodeURIComponent(user.username)}"`);
                            
                            if (response._embedded && response._embedded.users && response._embedded.users.length > 0) {
                                existingUser = response._embedded.users[0];
                                lookupMethod = 'username';
                                this.logger.info(`[MODIFY] Found user by username: "${user.username}" -> ID: ${existingUser.id}`);
                            } else {
                                this.logger.debug(`[MODIFY] No user found by username: "${user.username}"`);
                            }
                        } catch (error) {
                            this.logger.debug(`[MODIFY] Error looking up user by username "${user.username}":`, error.message);
                        }
                    }
                    
                    // If no user found by ID or username, try email (if provided)
                    if (!existingUser && user.email) {
                        try {
                            this.logger.debug(`[MODIFY] Looking up user by email: "${user.email}"`);
                            const response = await this.request('GET', `/environments/${this.getSettings().environmentId}/users?filter=email eq "${encodeURIComponent(user.email)}"`);
                            
                            if (response._embedded && response._embedded.users && response._embedded.users.length > 0) {
                                const emailUser = response._embedded.users[0];
                                
                                // If we already found a user by username, check if it's the same user
                                if (existingUser) {
                                    if (existingUser.id === emailUser.id) {
                                        this.logger.info(`[MODIFY] Email lookup confirmed same user: "${user.email}" -> ID: ${emailUser.id}`);
                                    } else {
                                        this.logger.warn(`[MODIFY] Found different users by username and email! Username: "${user.username}" -> ID: ${existingUser.id}, Email: "${user.email}" -> ID: ${emailUser.id}`);
                                        // Use the email user as it might be more reliable
                                        existingUser = emailUser;
                                        lookupMethod = 'email';
                                    }
                                } else {
                                    existingUser = emailUser;
                                    lookupMethod = 'email';
                                    this.logger.info(`[MODIFY] Found user by email: "${user.email}" -> ID: ${existingUser.id}`);
                                }
                            } else {
                                this.logger.debug(`[MODIFY] No user found by email: "${user.email}"`);
                            }
                        } catch (error) {
                            this.logger.debug(`[MODIFY] Error looking up user by email "${user.email}":`, error.message);
                        }
                    }
                    
                    // If user not found and createIfNotExists is enabled, create the user
                    if (!existingUser && createIfNotExists) {
                        try {
                            this.logger.info(`[MODIFY] User not found, creating new user: ${user.username || user.email}`);
                            
                            // Prepare user data for creation
                            const userData = {
                                name: {
                                    given: user.firstName || user.givenName || '',
                                    family: user.lastName || user.familyName || ''
                                },
                                email: user.email,
                                username: user.username || user.email,
                                population: {
                                    id: user.populationId || defaultPopulationId || this.getSettings().populationId
                                },
                                enabled: user.enabled !== undefined ? user.enabled : defaultEnabled
                            };

                            // Add password if generatePasswords is enabled
                            if (generatePasswords) {
                                userData.password = {
                                    value: this.generateTemporaryPassword()
                                };
                            }

                            // Create the user
                            const createdUser = await this.request('POST', `/environments/${this.getSettings().environmentId}/users`, userData);
                            
                            results.created++;
                            results.details.push({
                                user,
                                status: 'created',
                                pingOneId: createdUser.id,
                                reason: 'User created because createIfNotExists was enabled'
                            });
                            
                            this.logger.info(`[MODIFY] Successfully created user: ${createdUser.username || createdUser.email} (ID: ${createdUser.id})`);
                            
                            // Update progress
                            if (onProgress) {
                                onProgress({
                                    current,
                                    total: users.length,
                                    modified: results.modified,
                                    created: results.created,
                                    failed: results.failed,
                                    skipped: results.skipped,
                                    noChanges: results.noChanges
                                });
                            }
                            
                            return;
                        } catch (error) {
                            this.logger.error(`[MODIFY] Failed to create user ${user.username || user.email}:`, error.message);
                            results.failed++;
                            results.details.push({
                                user,
                                status: 'failed',
                                error: `Failed to create user: ${error.message}`,
                                reason: 'User creation failed'
                            });
                            return;
                        }
                    }
                    
                    // If user not found and createIfNotExists is disabled, skip the user
                    if (!existingUser) {
                        results.skipped++;
                        results.details.push({
                            user,
                            status: 'skipped',
                            reason: 'User not found and createIfNotExists is disabled'
                        });
                        this.logger.warn(`[MODIFY] User not found: ${user.username || user.email}. Skipping (createIfNotExists: ${createIfNotExists})`);
                        return;
                    }
                    
                    // Log the user we're about to modify
                    this.logger.info(`[MODIFY] Modifying user found by ${lookupMethod}:`, {
                        username: existingUser.username,
                        email: existingUser.email,
                        id: existingUser.id,
                        originalLookup: { username: user.username, email: user.email }
                    });
                    
                    // Compare CSV data with existing user data
                    const changes = {};
                    let hasChanges = false;
                    
                    // Map CSV fields to PingOne API fields
                    const fieldMappings = {
                        firstName: 'name.given',
                        lastName: 'name.family',
                        givenName: 'name.given',
                        familyName: 'name.family',
                        email: 'email',
                        phoneNumber: 'phoneNumber',
                        title: 'title',
                        department: 'department'
                    };
                    
                    // Add enabled field to mappings if updateUserStatus is enabled
                    if (updateUserStatus) {
                        fieldMappings.enabled = 'enabled';
                    }
                    
                    // Check each field for changes with proper mapping
                    for (const [csvField, apiField] of Object.entries(fieldMappings)) {
                        if (user[csvField] !== undefined) {
                            // Handle nested name fields
                            if (apiField.startsWith('name.')) {
                                const nameField = apiField.split('.')[1]; // 'given' or 'family'
                                if (!changes.name) {
                                    changes.name = { ...existingUser.name };
                                }
                                if (user[csvField] !== existingUser.name?.[nameField]) {
                                    changes.name[nameField] = user[csvField];
                                    hasChanges = true;
                                    this.logger.debug(`[MODIFY] Name field "${nameField}" will be changed from "${existingUser.name?.[nameField]}" to "${user[csvField]}"`);
                                }
                            } else {
                                // Handle regular fields
                                if (user[csvField] !== existingUser[apiField]) {
                                    changes[apiField] = user[csvField];
                                    hasChanges = true;
                                    this.logger.debug(`[MODIFY] Field "${apiField}" will be changed from "${existingUser[apiField]}" to "${user[csvField]}"`);
                                }
                            }
                        }
                    }
                    
                    // Check for enabled status updates if updateUserStatus is enabled
                    if (updateUserStatus && user.enabled !== undefined && user.enabled !== existingUser.enabled) {
                        // Convert string values to boolean if needed
                        let newEnabledValue = user.enabled;
                        if (typeof newEnabledValue === 'string') {
                            newEnabledValue = newEnabledValue.toLowerCase() === 'true' || newEnabledValue === '1';
                        }
                        
                        if (newEnabledValue !== existingUser.enabled) {
                            changes.enabled = newEnabledValue;
                            hasChanges = true;
                            this.logger.debug(`[MODIFY] Enabled status will be changed from "${existingUser.enabled}" to "${newEnabledValue}"`);
                        }
                    } else if (!updateUserStatus && user.enabled !== undefined && user.enabled !== existingUser.enabled) {
                        // Show warning only if updateUserStatus is not enabled
                        this.logger.warn(`[MODIFY] Cannot modify 'enabled' status for user ${existingUser.username} - updateUserStatus option is disabled`);
                        if (window.app && window.app.uiManager) {
                            window.app.uiManager.showWarning(`Cannot modify 'enabled' status for user ${existingUser.username} - updateUserStatus option is disabled`);
                        }
                    }
                    
                    // For PingOne API, we need to include required fields in the update
                    // Always include username and email as they are required
                    if (hasChanges) {
                        changes.username = existingUser.username;
                        changes.email = existingUser.email;
                        this.logger.debug(`[MODIFY] Including required fields: username=${existingUser.username}, email=${existingUser.email}`);
                    }
                    
                    if (!hasChanges) {
                        results.noChanges++;
                        results.details.push({
                            user,
                            status: 'no_changes',
                            pingOneId: existingUser.id,
                            lookupMethod: lookupMethod
                        });
                        this.logger.info(`[MODIFY] No changes needed for user: ${existingUser.username || existingUser.email} (ID: ${existingUser.id})`);
                        return;
                    }
                    
                    this.logger.info(`[MODIFY] Applying changes to user:`, {
                        userId: existingUser.id,
                        changes: changes
                    });
                    
                    // Update the user with changes
                    await this.request('PUT', `/environments/${this.getSettings().environmentId}/users/${existingUser.id}`, changes);
                    
                    results.modified++;
                    results.details.push({
                        user,
                        status: 'modified',
                        pingOneId: existingUser.id,
                        changes,
                        lookupMethod: lookupMethod
                    });
                    
                    this.logger.info(`[MODIFY] Successfully modified user: ${existingUser.username || existingUser.email} (ID: ${existingUser.id}) with changes:`, changes);
                    
                } catch (error) {
                    // Get friendly error message if available
                    const friendlyMessage = error.friendlyMessage || error.message;
                    
                    // Check if this is a 404 error (user not found)
                    if (error.status === 404 || error.message.includes('404') || error.message.includes('not found')) {
                        results.skipped++;
                        results.details.push({
                            user,
                            status: 'skipped',
                            reason: 'User not found (404)'
                        });
                        
                        this.logger.warn(`[MODIFY] User '${user.username || user.email}' not found in PingOne (404). Skipping this user.`);
                    } else {
                        results.failed++;
                        
                        // Provide more context for different error types
                        let errorReason = friendlyMessage;
                        if (error.status === 400) {
                            errorReason = `Data validation failed: ${friendlyMessage}`;
                        } else if (error.status === 429) {
                            errorReason = `Rate limited: ${friendlyMessage}`;
                        } else if (error.status === 403) {
                            errorReason = `Permission denied: ${friendlyMessage}`;
                        }
                        
                        results.details.push({
                            user,
                            status: 'failed',
                            error: errorReason,
                            statusCode: error.status
                        });
                        
                        this.logger.error(`[MODIFY] Failed to modify user '${user.username || user.email}': ${errorReason}`);
                        
                        // Show user-friendly error in UI for specific error types
                        if (window.app && window.app.uiManager && (error.status === 400 || error.status === 403)) {
                            window.app.uiManager.showWarning(`User '${user.username || user.email}': ${friendlyMessage}`);
                        }
                    }
                }
                
                // Update progress for each user
                if (onProgress) {
                    onProgress({
                        current,
                        total: users.length,
                        modified: results.modified,
                        failed: results.failed,
                        skipped: results.skipped,
                        noChanges: results.noChanges
                    });
                }
            });
            
            // Wait for current batch to complete
            await Promise.all(batchPromises);
            
            // Add delay between batches to avoid rate limiting
            if (i + batchSize < users.length && delayBetweenBatches > 0) {
                await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
            }
            
            // Log batch completion
            this.logger.info(`[MODIFY] Completed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(users.length / batchSize)}`);
        }
        
        return results;
    }

    /**
     * Fetch all users in a specific population (paginated)
     * @param {string} populationId - The population ID
     * @returns {Promise<Array>} Array of user objects
     */
    async getAllUsersInPopulation(populationId) {
        const settings = this.getSettings();
        const users = [];
        let page = 1;
        const pageSize = 100;
        let total = 0;
        let fetched = 0;
        do {
            // Use the general users endpoint with population filter instead of the non-existent populations/users endpoint
            const resp = await this.request('GET', `/environments/${settings.environmentId}/users?limit=${pageSize}&page=${page}&population.id=${populationId}`);
            if (resp._embedded && resp._embedded.users) {
                users.push(...resp._embedded.users);
                fetched = resp._embedded.users.length;
                total = resp.page && resp.page.totalElements ? resp.page.totalElements : users.length;
            } else {
                break;
            }
            page++;
        } while (users.length < total && fetched > 0);
        
        return users;
    }

    /**
     * Fetch all users in a specific population using the correct API endpoint
     * @param {string} populationId - The population ID
     * @returns {Promise<Array>} Array of user objects
     */
    async getUsersByPopulation(populationId) {
        const settings = this.getSettings();
        const users = [];
        let page = 1;
        const pageSize = 100;
        let total = 0;
        let fetched = 0;
        
        do {
            // Use the general users endpoint with population filter
            const resp = await this.request('GET', `/environments/${settings.environmentId}/users?limit=${pageSize}&page=${page}&population.id=${populationId}`);
            if (resp._embedded && resp._embedded.users) {
                users.push(...resp._embedded.users);
                fetched = resp._embedded.users.length;
                total = resp.page && resp.page.totalElements ? resp.page.totalElements : users.length;
            } else {
                break;
            }
            page++;
        } while (users.length < total && fetched > 0);
        
        return users;
    }

    /**
     * Fetch all users in the environment (paginated)
     * @returns {Promise<Array>} Array of user objects
     */
    async getAllUsersInEnvironment() {
        const settings = this.getSettings();
        const users = [];
        let page = 1;
        const pageSize = 100;
        let total = 0;
        let fetched = 0;
        do {
            const resp = await this.request('GET', `/environments/${settings.environmentId}/users?limit=${pageSize}&page=${page}`);
            if (resp._embedded && resp._embedded.users) {
                users.push(...resp._embedded.users);
                fetched = resp._embedded.users.length;
                total = resp.page && resp.page.totalElements ? resp.page.totalElements : users.length;
            } else {
                break;
            }
            page++;
        } while (users.length < total && fetched > 0);
        return users;
    }
}
