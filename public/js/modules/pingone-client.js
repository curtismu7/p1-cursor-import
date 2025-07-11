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
     * Get the remaining time for the current cached token
     * @returns {Object|null} Object with timeRemaining (seconds) and formatted time, or null if no valid token
     */
    getCurrentTokenTimeRemaining() {
        try {
            const token = this.getCachedToken();
            if (!token) {
                return null;
            }
            
            const expiry = localStorage.getItem('pingone_token_expiry');
            if (!expiry) {
                return null;
            }
            
            const expiryTime = parseInt(expiry, 10);
            if (isNaN(expiryTime)) {
                return null;
            }
            
            const now = Date.now();
            const timeRemainingSeconds = Math.max(0, Math.floor((expiryTime - now) / 1000));
            
            // Format the time remaining
            const hours = Math.floor(timeRemainingSeconds / 3600);
            const minutes = Math.floor((timeRemainingSeconds % 3600) / 60);
            const seconds = timeRemainingSeconds % 60;
            
            let formattedTime = '';
            if (hours > 0) {
                formattedTime = `${hours}h ${minutes}m ${seconds}s`;
            } else if (minutes > 0) {
                formattedTime = `${minutes}m ${seconds}s`;
            } else {
                formattedTime = `${seconds}s`;
            }
            
            return {
                timeRemaining: timeRemainingSeconds,
                formattedTime: formattedTime,
                isExpired: timeRemainingSeconds <= 0
            };
        } catch (error) {
            console.error('Error getting token time remaining:', error);
            return null;
        }
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
        console.log('[DEBUG] getAccessToken called');
        // Check for cached token first
        const cachedToken = this.getCachedToken();
        if (cachedToken) {
            console.log('[DEBUG] Using cached token:', cachedToken.substring(0, 8) + '...');
            return cachedToken;
        }
        try {
            console.log('[DEBUG] Fetching token from /api/pingone/get-token');
            const response = await fetch('/api/pingone/get-token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
            console.log('[DEBUG] Fetch response:', response);
            if (!response.ok) {
                let errorMsg = `Failed to get access token: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMsg += errorData.message ? ` - ${errorData.message}` : '';
                } catch (e) {
                    // Ignore JSON parse errors
                }
                console.error('[DEBUG] Fetch error:', errorMsg);
                if (window.app && window.app.uiManager) {
                    window.app.uiManager.showNotification('❌ ' + errorMsg, 'error');
                }
                throw new Error(errorMsg);
            }
            const data = await response.json();
            console.log('[DEBUG] Data received from server:', data);
            if (!data.access_token) {
                console.warn('[TOKEN] No access_token in server response:', data);
                if (window.app && window.app.uiManager) {
                    window.app.uiManager.showNotification('⚠️ No token received from server. Please check your PingOne credentials and try again.', 'warning');
                }
                return null;
            }
            let tokenSaved = false;
            try {
                if (typeof localStorage !== 'undefined' && typeof window !== 'undefined') {
                    const expiryTime = Date.now() + (data.expires_in * 1000);
                    try {
                        localStorage.setItem('pingone_worker_token', data.access_token);
                        localStorage.setItem('pingone_token_expiry', expiryTime.toString());
                        tokenSaved = true;
                        console.log('[DEBUG] Token saved to localStorage:', {
                            token: data.access_token ? data.access_token.substring(0, 8) + '...' : null,
                            expiry: expiryTime,
                            expires_in: data.expires_in
                        });
                        console.log('[DEBUG] localStorage now:', {
                            pingone_worker_token: localStorage.getItem('pingone_worker_token'),
                            pingone_token_expiry: localStorage.getItem('pingone_token_expiry')
                        });
                        if (this.logger && this.logger.info) {
                            this.logger.info('[TOKEN] Saved to localStorage', {
                                token: data.access_token ? data.access_token.substring(0, 8) + '...' : null,
                                expiry: expiryTime,
                                expires_in: data.expires_in
                            });
                        }
                    } catch (storageError) {
                        console.warn('Failed to store token in localStorage:', storageError);
                        if (this.logger && this.logger.error) {
                            this.logger.error('[TOKEN] Failed to store token in localStorage', storageError);
                        }
                        if (window.app && window.app.uiManager) {
                            window.app.uiManager.showNotification('❌ Failed to save token in your browser. Please check your browser settings or try another browser.', 'error');
                        }
                    }
                }
            } catch (error) {
                console.warn('Error accessing localStorage:', error);
                if (this.logger && this.logger.error) {
                    this.logger.error('[TOKEN] Error accessing localStorage', error);
                }
                if (window.app && window.app.uiManager) {
                    window.app.uiManager.showNotification('❌ Error accessing browser storage. Token may not be saved.', 'error');
                }
            }
            this.accessToken = data.access_token; // Cache the token
            if (tokenSaved) {
                // Calculate time remaining with better formatting
                let timeLeftMsg = '';
                if (data.expires_in) {
                    const hours = Math.floor(data.expires_in / 3600);
                    const minutes = Math.floor((data.expires_in % 3600) / 60);
                    const seconds = data.expires_in % 60;
                    
                    if (hours > 0) {
                        timeLeftMsg = ` (expires in ${hours}h ${minutes}m ${seconds}s)`;
                    } else if (minutes > 0) {
                        timeLeftMsg = ` (expires in ${minutes}m ${seconds}s)`;
                    } else {
                        timeLeftMsg = ` (expires in ${seconds}s)`;
                    }
                }
                
                const msg = `✅ New token acquired. Time left on token: ${timeLeftMsg.replace(/^ \(expires in |\)$/g, '')}`;
                
                if (window.app && window.app.uiManager) {
                    window.app.uiManager.updateConnectionStatus('connected', msg);
                    window.app.uiManager.showNotification(msg, 'success');
                    
                    // Also log to console if DEBUG_MODE is enabled
                    if (window.DEBUG_MODE) {
                        console.log('Token acquisition successful:', {
                            tokenLength: data.access_token ? data.access_token.length : 0,
                            expiresIn: data.expires_in,
                            timeLeft: timeLeftMsg.replace(/^ \(expires in |\)$/g, ''),
                            expiryTime: expiryTime
                        });
                    }
                }
            }
            return data.access_token;
        } catch (error) {
            console.error('[DEBUG] Error in getAccessToken:', error);
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

        // Abort support
        if (options.signal && options.signal.aborted) {
            throw new DOMException('Request aborted', 'AbortError');
        }
        let abortListener;
        if (options.signal) {
            abortListener = () => { throw new DOMException('Request aborted', 'AbortError'); };
            options.signal.addEventListener('abort', abortListener);
        }

        // Retry logic
        let lastError = null;
        for (let attempt = 1; attempt <= (options.retries || 3); attempt++) {
            try {
                console.log(`[REQUEST] Making API request (attempt ${attempt}): ${method} ${url}`);
                // Pass signal to localAPI.request if supported
                const response = await this.localAPI.request(method, url, data, { ...options, headers, signal: options.signal });
                console.log(`[REQUEST] API request completed (attempt ${attempt}):`, response);
                
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
                
                if (options.signal && abortListener) {
                    options.signal.removeEventListener('abort', abortListener);
                }
                return response;
            } catch (error) {
                if (options.signal && options.signal.aborted) {
                    if (abortListener) options.signal.removeEventListener('abort', abortListener);
                    throw new DOMException('Request aborted', 'AbortError');
                }
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
                    if (options.signal && abortListener) options.signal.removeEventListener('abort', abortListener);
                    throw error;
                }

                // Only retry for rate limits (429) and server errors (5xx)
                const shouldRetry = isRateLimit || error.status >= 500 || !error.status;
                if (!shouldRetry) {
                    // Don't retry for client errors (4xx except 429), throw immediately
                    if (options.signal && abortListener) options.signal.removeEventListener('abort', abortListener);
                    throw error;
                }

                // Use the delay calculated above
                this.logger.info(`Retrying request in ${delay}ms... (attempt ${attempt + 1}/${options.retries || 3})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        if (options.signal && abortListener) options.signal.removeEventListener('abort', abortListener);
        throw lastError;
    }


    /**
     * Get all populations from PingOne
     * @returns {Promise<Array>} Array of population objects
     */
    async getPopulations() {
        const settings = this.getSettings();
        const response = await this.request('GET', `/environments/${settings.environmentId}/populations`);
        
        // Handle different response formats
        if (typeof response === 'string') {
            try {
                return JSON.parse(response);
            } catch (error) {
                this.logger.error('Failed to parse populations response:', error);
                return [];
            }
        } else if (Array.isArray(response)) {
            return response;
        } else if (response && typeof response === 'object') {
            // If response is an object, it might be wrapped
            if (Array.isArray(response.data)) {
                return response.data;
            } else if (Array.isArray(response.populations)) {
                return response.populations;
            }
        }
        
        this.logger.warn('Unexpected populations response format:', response);
        return [];
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
        console.log('[IMPORT] importUsers method called');
        const settings = this.getSettings();
        const endpoint = `/environments/${settings.environmentId}/users`;
        const { onProgress, retryAttempts = 3, delayBetweenRetries = 1000, importOptions = {}, abortController } = options;
        const results = [];
        const totalUsers = users.length;
        let successCount = 0;
        let failedCount = 0;
        let skippedCount = 0;
        let retryCount = 0;
        
        console.log('[IMPORT] Initial setup completed');
        this.logger.debug('[IMPORT] Starting import of users', { totalUsers });

        // Validate input
        console.log('[IMPORT] Validating input...');
        if (!users || !Array.isArray(users) || users.length === 0) {
            throw new Error('No users provided for import');
        }

        if (!settings.environmentId) {
            throw new Error('Environment ID not configured');
        }
        console.log('[IMPORT] Input validation completed');

        // Handle population selection based on import options
        console.log('[IMPORT] Handling population selection...');
        const { selectedPopulationId, useCsvPopulationId, useDefaultPopulation } = importOptions;
        
        // Determine the fallback population ID
        let fallbackPopulationId = null;
        
        // Priority 1: Selected population from dropdown
        if (selectedPopulationId) {
            fallbackPopulationId = selectedPopulationId;
            console.log('[IMPORT] Using selected population from dropdown:', fallbackPopulationId);
        }
        // Priority 2: Default population from settings
        else if (useDefaultPopulation && settings.populationId) {
            fallbackPopulationId = settings.populationId;
            console.log('[IMPORT] Using default population from settings:', fallbackPopulationId);
        }
        // Priority 3: Check if CSV has population data (only if explicitly enabled)
        else if (useCsvPopulationId) {
            // Check if any user has populationId data
            const hasCsvPopulationData = users.some(user => user.populationId && user.populationId.trim() !== '');
            if (hasCsvPopulationData) {
                console.log('[IMPORT] CSV has population data, will use individual population IDs from CSV');
                fallbackPopulationId = 'csv-population-ids'; // Special marker
            } else {
                console.log('[IMPORT] CSV population ID enabled but no population data found in CSV');
            }
        }
        
        // If still no population, show modal but allow import to continue
        if (!fallbackPopulationId) {
            console.log('[IMPORT] No population selected, showing modal...');
            if (window.app) {
                // Reset import button state before showing modal
                if (window.app.uiManager) {
                    window.app.uiManager.resetImportState();
                }
                
                // Show modal and wait for user action
                const modalResult = await window.app.showPopulationWarningModal();
                if (modalResult === 'settings') {
                    // User chose to go to settings, return early
                    return {
                        total: totalUsers,
                        success: 0,
                        failed: 0,
                        skipped: 0,
                        results: [],
                        error: 'No population selected or configured - user redirected to settings.'
                    };
                }
                // User clicked OK, continue with import but use default population
                console.log('[IMPORT] User chose to continue without population selection, using default population');
                // Get the first available population as fallback
                try {
                    const availablePopulations = await this.getPopulations();
                    if (availablePopulations && availablePopulations.length > 0) {
                        fallbackPopulationId = availablePopulations[0].id;
                        console.log('[IMPORT] Using first available population as fallback:', fallbackPopulationId);
                    } else {
                        console.log('[IMPORT] No populations available, skipping all users');
                        return {
                            total: totalUsers,
                            success: 0,
                            failed: 0,
                            skipped: totalUsers,
                            results: users.map(user => ({
                                success: false,
                                user: user,
                                error: 'No population available in PingOne environment',
                                skipped: true
                            })),
                            error: 'No population available in PingOne environment.'
                        };
                    }
                } catch (error) {
                    console.error('[IMPORT] Error getting populations:', error);
                    return {
                        total: totalUsers,
                        success: 0,
                        failed: 0,
                        skipped: totalUsers,
                        results: users.map(user => ({
                            success: false,
                            user: user,
                            error: 'Failed to get available populations',
                            skipped: true
                        })),
                        error: 'Failed to get available populations.'
                    };
                }
            } else {
                return {
                    total: totalUsers,
                    success: 0,
                    failed: 0,
                    skipped: 0,
                    results: [],
                    error: 'No population selected or configured.'
                };
            }
        }
        console.log('[IMPORT] Population selection completed, fallbackPopulationId:', fallbackPopulationId);
        this.logger.info('Population selection for import', {
            useCsvPopulationId,
            selectedPopulationId,
            useDefaultPopulation,
            fallbackPopulationId,
            settingsPopulationId: settings.populationId
        });

        // Process users in batches with improved error handling
        console.log('[IMPORT] Starting user processing loop...');
        const batchSize = 10;
        for (let i = 0; i < totalUsers; i += batchSize) {
            const batch = users.slice(i, i + batchSize);
            console.log(`[IMPORT] Processing batch ${Math.floor(i/batchSize) + 1}, users ${i+1}-${Math.min(i+batchSize, totalUsers)}`);
            this.logger.debug(`[IMPORT] Processing batch`, { batchNumber: Math.floor(i/batchSize) + 1, from: i+1, to: Math.min(i+batchSize, totalUsers) });
            for (let batchIndex = 0; batchIndex < batch.length; batchIndex++) {
                const currentIndex = i + batchIndex;
                const currentUser = batch[batchIndex];
                try {
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
                        results.push({
                            success: false,
                            user: currentUser,
                            error: validationError,
                            skipped: true
                        });
                        continue;
                    }
                    
                    // Additional validation for required name fields
                    if (!currentUser.firstName || currentUser.firstName.trim() === '') {
                        this.logger.warn(`User ${currentUser.email || currentUser.username} missing firstName, skipping`, 'warn');
                        skippedCount++;
                        results.push({
                            success: false,
                            user: currentUser,
                            error: 'firstName is required and cannot be empty',
                            skipped: true
                        });
                        continue;
                    }
                    
                    if (!currentUser.lastName || currentUser.lastName.trim() === '') {
                        this.logger.warn(`User ${currentUser.email || currentUser.username} missing lastName, skipping`, 'warn');
                        skippedCount++;
                        results.push({
                            success: false,
                            user: currentUser,
                            error: 'lastName is required and cannot be empty',
                            skipped: true
                        });
                        continue;
                    }
                    
                    // Determine population ID for this user
                    let userPopulationId = fallbackPopulationId;
                    
                    // If CSV population ID is enabled and user has a population ID
                    if (useCsvPopulationId && currentUser.populationId) {
                        // Validate the CSV population ID format (should be a valid UUID)
                        const isValidPopulationId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentUser.populationId);
                        
                        if (isValidPopulationId) {
                            // Check if the population exists in the available populations
                            const availablePopulations = await this.getPopulations();
                            const populationExists = availablePopulations.some(pop => pop.id === currentUser.populationId);
                            
                            if (populationExists) {
                                userPopulationId = currentUser.populationId;
                                this.logger.info(`Using CSV population ID for user ${currentUser.email || currentUser.username}: ${userPopulationId}`);
                            } else {
                                // CSV population ID doesn't exist, fall back to UI-selected population
                                this.logger.warn(`CSV population ID ${currentUser.populationId} does not exist in PingOne environment. Falling back to UI-selected population: ${fallbackPopulationId}`);
                                if (fallbackPopulationId && fallbackPopulationId !== 'csv-population-ids') {
                                    userPopulationId = fallbackPopulationId;
                                } else {
                                    this.logger.warn(`No valid population ID available for user ${currentUser.email || currentUser.username}. Skipping user.`);
                                    failedCount++;
                                    results.push({
                                        success: false,
                                        user: currentUser,
                                        error: `CSV population ID ${currentUser.populationId} does not exist in PingOne environment. No fallback population available.`,
                                        skipped: true
                                    });
                                    continue;
                                }
                            }
                        } else {
                            // CSV population ID is invalid format, fall back to UI-selected population
                            this.logger.warn(`Invalid CSV population ID format for user ${currentUser.email || currentUser.username}: ${currentUser.populationId}. Falling back to UI-selected population: ${fallbackPopulationId}`);
                            if (fallbackPopulationId && fallbackPopulationId !== 'csv-population-ids') {
                                userPopulationId = fallbackPopulationId;
                            } else {
                                this.logger.warn(`No valid population ID available for user ${currentUser.email || currentUser.username}. Skipping user.`);
                                failedCount++;
                                results.push({
                                    success: false,
                                    user: currentUser,
                                    error: `Invalid CSV population ID format: ${currentUser.populationId}. No fallback population available.`,
                                    skipped: true
                                });
                                continue;
                            }
                        }
                    } else if (fallbackPopulationId && fallbackPopulationId !== 'csv-population-ids') {
                        if (selectedPopulationId && fallbackPopulationId === selectedPopulationId) {
                            this.logger.info(`Using selected population ID for user ${currentUser.email || currentUser.username}: ${fallbackPopulationId}`);
                        } else {
                            this.logger.info(`Using fallback population ID for user ${currentUser.email || currentUser.username}: ${fallbackPopulationId}`);
                        }
                    } else if (fallbackPopulationId === 'csv-population-ids' && currentUser.populationId) {
                        // Validate the CSV population ID format
                        const isValidPopulationId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentUser.populationId);
                        
                        if (isValidPopulationId) {
                            // Check if the population exists in the available populations
                            const availablePopulations = await this.getPopulations();
                            const populationExists = availablePopulations.some(pop => pop.id === currentUser.populationId);
                            
                            if (populationExists) {
                                userPopulationId = currentUser.populationId;
                                this.logger.info(`Using CSV population ID for user ${currentUser.email || currentUser.username}: ${userPopulationId}`);
                            } else {
                                this.logger.warn(`CSV population ID ${currentUser.populationId} does not exist in PingOne environment. Skipping user.`);
                                failedCount++;
                                results.push({
                                    success: false,
                                    user: currentUser,
                                    error: `CSV population ID ${currentUser.populationId} does not exist in PingOne environment.`,
                                    skipped: true
                                });
                                continue;
                            }
                        } else {
                            this.logger.warn(`Invalid CSV population ID format for user ${currentUser.email || currentUser.username}: ${currentUser.populationId}. Skipping user.`);
                            failedCount++;
                            results.push({
                                success: false,
                                user: currentUser,
                                error: `Invalid CSV population ID format: ${currentUser.populationId}`,
                                skipped: true
                            });
                            continue;
                        }
                    } else {
                        this.logger.warn(`No population ID available for user ${currentUser.email || currentUser.username}. Skipping user.`);
                        failedCount++;
                        results.push({
                            success: false,
                            user: currentUser,
                            error: 'No population ID available for user',
                            skipped: true
                        });
                        continue;
                    }
                    // Store enabled status for later use (after user creation)
                    let userEnabledStatus = true; // default to true
                    if (currentUser.enabled !== undefined && currentUser.enabled !== null) {
                        if (typeof currentUser.enabled === 'boolean') {
                            userEnabledStatus = currentUser.enabled;
                        } else if (typeof currentUser.enabled === 'string') {
                            // Convert string values to boolean
                            const enabledStr = currentUser.enabled.toLowerCase().trim();
                            userEnabledStatus = enabledStr === 'true' || enabledStr === '1' || enabledStr === 'yes';
                        } else if (typeof currentUser.enabled === 'number') {
                            userEnabledStatus = currentUser.enabled !== 0;
                        }
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
                        }
                    };
                    if (currentUser.password) {
                        userData.password = {
                            value: '[REDACTED]'
                        };
                    }
                    if (currentUser.additionalProperties) {
                        Object.assign(userData, currentUser.additionalProperties);
                    }
                    // Extra debug output for each user
                    this.logger.debug('[IMPORT] Preparing to import user', {
                        index: currentIndex + 1,
                        total: totalUsers,
                        user: {
                            email: currentUser.email,
                            username: currentUser.username,
                            firstName: currentUser.firstName,
                            lastName: currentUser.lastName,
                            populationId: userPopulationId
                        },
                        userData
                    });
                    // Make the API request with retry logic
                    let result;
                    let lastError = null;
                    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
                        try {
                            // Log full request details for debugging
                            this.logger.debug('[IMPORT] API Request Details', {
                                attempt,
                                endpoint,
                                userData,
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Accept': 'application/json',
                                    'Authorization': '[REDACTED]'
                                }
                            });
                            console.log(`[IMPORT] Making API request for user ${currentUser.email || currentUser.username} (attempt ${attempt}/${retryAttempts})`);
                            result = await this.request('POST', endpoint, userData, { signal: abortController ? abortController.signal : undefined });
                            this.logger.debug('[IMPORT] API Response', { user: currentUser.email || currentUser.username, result });
                            console.log(`[IMPORT] API request completed for user ${currentUser.email || currentUser.username}`);
                            
                            // Check for different possible response structures
                            let userId = null;
                            
                            // Handle the actual PingOne API response structure
                            // PingOne API returns the user object directly with an 'id' field
                            if (result && typeof result === 'object') {
                                // Check for special "user already exists" response
                                if (result.success && result.warning && result.message && result.message.includes('already exists')) {
                                    // This is a special case where the user already exists
                                    // We should treat this as a skip rather than an error
                                    console.log(`[IMPORT] User already exists: ${currentUser.email || currentUser.username}`);
                                    skippedCount++;
                                    results.push({ 
                                        success: false, 
                                        user: currentUser, 
                                        warning: true,
                                        message: result.message,
                                        skipped: true 
                                    });
                                    break; // Exit the retry loop
                                }
                                
                                // Direct user object from PingOne API
                                if (result.id) {
                                    userId = result.id;
                                } else if (result._id) {
                                    userId = result._id;
                                } else if (result.userId) {
                                    userId = result.userId;
                                }
                                
                                // If no ID found in direct object, check nested structures
                                if (!userId) {
                                    if (result.user && result.user.id) {
                                        userId = result.user.id;
                                    } else if (result.data && result.data.id) {
                                        userId = result.data.id;
                                    } else if (result.success && result.id) {
                                        userId = result.id;
                                    }
                                }
                            }
                            
                            // If still no ID found, check if this is a wrapped response
                            if (!userId && result && typeof result === 'object') {
                                // Check if the response is wrapped in a data property
                                if (result.data && typeof result.data === 'object' && result.data.id) {
                                    userId = result.data.id;
                                }
                            }
                            
                            if (userId) {
                                // Handle user status if needed (enable/disable)
                                if (userEnabledStatus === false) {
                                    try {
                                        console.log(`[IMPORT] Disabling user ${userId} after creation`);
                                        await this.updateUserStatus(userId, false);
                                        console.log(`[IMPORT] Successfully disabled user ${userId}`);
                                    } catch (statusError) {
                                        console.warn(`[IMPORT] Failed to disable user ${userId}:`, statusError.message);
                                        // Don't fail the import, just log the warning
                                    }
                                }
                                
                                successCount++;
                                results.push({ success: true, user: currentUser, id: userId, enabled: userEnabledStatus });
                                console.log(`[IMPORT] Successfully created user with ID: ${userId} (enabled: ${userEnabledStatus})`);
                                break;
                            } else {
                                console.log(`[IMPORT] Invalid response structure - no ID found:`, result);
                                throw new Error('Unknown API response - no user ID found in response');
                            }
                        } catch (apiError) {
                            lastError = apiError;
                            // Try to extract error message and log full error details
                            let apiErrorMsg = apiError && apiError.message ? apiError.message : 'API request failed';
                            let apiErrorDetails = {};
                            if (apiError && apiError.response && typeof apiError.response.json === 'function') {
                                try {
                                    const errorBody = await apiError.response.json();
                                    apiErrorDetails.body = errorBody;
                                    if (errorBody && errorBody.detail) {
                                        apiErrorMsg = errorBody.detail;
                                    } else if (errorBody && errorBody.error_description) {
                                        apiErrorMsg = errorBody.error_description;
                                    } else if (errorBody && errorBody.message) {
                                        apiErrorMsg = errorBody.message;
                                    }
                                } catch (parseErr) {
                                    apiErrorDetails.bodyParseError = parseErr.message;
                                }
                            }
                            if (apiError && apiError.response) {
                                apiErrorDetails.status = apiError.response.status;
                                apiErrorDetails.statusText = apiError.response.statusText;
                                apiErrorDetails.headers = {};
                                if (apiError.response.headers && typeof apiError.response.headers.forEach === 'function') {
                                    apiError.response.headers.forEach((value, key) => {
                                        apiErrorDetails.headers[key] = value;
                                    });
                                }
                            }
                            this.logger.error(`[IMPORT] PingOne API Error (attempt ${attempt}/${retryAttempts}): ${apiErrorMsg}`, {
                                apiErrorMsg,
                                apiErrorDetails,
                                user: currentUser
                            });
                            if (attempt === retryAttempts) {
                                failedCount++;
                                results.push({ success: false, user: currentUser, error: apiErrorMsg, apiErrorDetails });
                                if (window.app && window.app.uiManager) {
                                    window.app.uiManager.showNotification(`PingOne API Error: ${apiErrorMsg}`, 'error');
                                }
                            } else {
                                await new Promise(res => setTimeout(res, delayBetweenRetries));
                            }
                        }
                    }
                } catch (err) {
                    this.logger.error('[IMPORT] Unexpected error during import', {
                        user: currentUser.email || currentUser.username,
                        error: err.message,
                        stack: err.stack
                    });
                    console.error(`[IMPORT] Unexpected error for user ${currentUser.email || currentUser.username}:`, err);
                    failedCount++;
                    results.push({
                        success: false,
                        user: currentUser,
                        error: err.message,
                        skipped: false
                    });
                }
            }
        }
        // Batch summary
        this.logger.info('[IMPORT] Batch import summary', {
            total: totalUsers,
            success: successCount,
            failed: failedCount,
            skipped: skippedCount,
            retries: retryCount
        });
        console.log('[IMPORT] Batch import summary:', {
            total: totalUsers,
            success: successCount,
            failed: failedCount,
            skipped: skippedCount,
            retries: retryCount
        });
        return {
            total: totalUsers,
            success: successCount,
            failed: failedCount,
            skipped: skippedCount,
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
        
        // Check required name fields
        if (!user.firstName || user.firstName.trim() === '') {
            return 'User must have a firstName (given name)';
        }
        
        if (!user.lastName || user.lastName.trim() === '') {
            return 'User must have a lastName (family name)';
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
     * Update user status (enable/disable)
     * @param {string} userId - The user ID
     * @param {boolean} enabled - Whether the user should be enabled
     * @returns {Promise<Object>} The API response
     */
    async updateUserStatus(userId, enabled) {
        const settings = this.getSettings();
        const endpoint = `/environments/${settings.environmentId}/users/${userId}`;
        
        const updateData = {
            enabled: enabled
        };
        
        this.logger.info(`[STATUS] Updating user ${userId} status to enabled: ${enabled}`);
        
        try {
            const result = await this.request('PATCH', endpoint, updateData);
            this.logger.info(`[STATUS] Successfully updated user ${userId} status to enabled: ${enabled}`);
            return result;
        } catch (error) {
            this.logger.error(`[STATUS] Failed to update user ${userId} status:`, error);
            throw error;
        }
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
     * Delete a user by ID
     * @param {string} userId - User ID to delete
     * @returns {Promise<void>}
     */
    async deleteUser(userId, options = {}) {
        if (!userId) {
            throw new Error('User ID is required for deletion');
        }
        if (options.signal && options.signal.aborted) {
            throw new DOMException('User delete aborted', 'AbortError');
        }
        try {
            const endpoint = `/environments/${this.getSettings().environmentId}/users/${userId}`;
            this.logger.info(`[DELETE] Deleting user with ID: ${userId}`);
            this.logger.debug(`[DELETE] Making DELETE request to: ${endpoint}`);
            await this.request('DELETE', endpoint, null, options);
            this.logger.info(`[DELETE] Successfully deleted user: ${userId}`);
        } catch (error) {
            if (options.signal && options.signal.aborted) {
                throw new DOMException('User delete aborted', 'AbortError');
            }
            this.logger.error(`[DELETE] Failed to delete user ${userId}:`, {
                error: error.message,
                status: error.status,
                statusText: error.statusText,
                response: error.response?.data
            });
            throw error;
        }
    }

    async modifyUsersFromCsv(users, options = {}) {
        const { onProgress, batchSize = 5, delayBetweenBatches = 2000, createIfNotExists = false, updateUserStatus = false, defaultPopulationId = '', defaultEnabled = true, generatePasswords = true } = options;
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
            
            // Process users sequentially within each batch to avoid overwhelming the API
            for (let batchIndex = 0; batchIndex < batch.length; batchIndex++) {
                const user = batch[batchIndex];
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
                            
                            // Prepare user data for creation (without enabled field)
                            const userData = {
                                name: {
                                    given: user.firstName || user.givenName || '',
                                    family: user.lastName || user.familyName || ''
                                },
                                email: user.email,
                                username: user.username || user.email,
                                population: {
                                    id: user.populationId || defaultPopulationId || this.getSettings().populationId
                                }
                            };
                            
                            // Determine if user should be enabled (for later status update)
                            let userEnabledStatus = defaultEnabled;
                            if (user.enabled !== undefined) {
                                if (typeof user.enabled === 'string') {
                                    userEnabledStatus = user.enabled.toLowerCase() === 'true' || user.enabled === '1';
                                } else {
                                    userEnabledStatus = user.enabled;
                                }
                            }

                            // Add password if generatePasswords is enabled
                            if (generatePasswords) {
                                userData.password = {
                                    value: this.generateTemporaryPassword()
                                };
                            }

                            // Create the user
                            const createdUser = await this.request('POST', `/environments/${this.getSettings().environmentId}/users`, userData);

                            // After creation, update status if needed
                            if (userEnabledStatus === false) {
                                try {
                                    await this.updateUserStatus(createdUser.id, false);
                                    this.logger.info(`[MODIFY] Disabled user after creation: ${createdUser.username || createdUser.email} (ID: ${createdUser.id})`);
                                } catch (statusErr) {
                                    this.logger.warn(`[MODIFY] Failed to disable user after creation: ${createdUser.username || createdUser.email} (ID: ${createdUser.id})`, statusErr);
                                }
                            }

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
                    let enabledStatusToUpdate = null;
                    if (updateUserStatus && user.enabled !== undefined && user.enabled !== existingUser.enabled) {
                        // Convert string values to boolean if needed
                        let newEnabledValue = user.enabled;
                        if (typeof newEnabledValue === 'string') {
                            newEnabledValue = newEnabledValue.toLowerCase() === 'true' || newEnabledValue === '1';
                        }
                        if (newEnabledValue !== existingUser.enabled) {
                            enabledStatusToUpdate = newEnabledValue;
                            this.logger.debug(`[MODIFY] Enabled status will be changed from "${existingUser.enabled}" to "${newEnabledValue}"`);
                        }
                    } else if (!updateUserStatus && user.enabled !== undefined && user.enabled !== existingUser.enabled) {
                        // Show warning only if updateUserStatus is not enabled
                        this.logger.warn(`[MODIFY] Cannot modify 'enabled' status for user ${existingUser.username} - updateUserStatus option is disabled`);
                        if (window.app && window.app.uiManager) {
                            window.app.uiManager.showWarning(`Cannot modify 'enabled' status for user ${existingUser.username} - updateUserStatus option is disabled`);
                        }
                    }

                    // Remove enabled from changes if present
                    if (changes.enabled !== undefined) {
                        delete changes.enabled;
                    }

                    // For PingOne API, we need to include required fields in the update
                    // Always include username and email as they are required
                    if (hasChanges) {
                        changes.username = existingUser.username;
                        changes.email = existingUser.email;
                        this.logger.debug(`[MODIFY] Including required fields: username=${existingUser.username}, email=${existingUser.email}`);
                    }

                    if (!hasChanges && enabledStatusToUpdate === null) {
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

                    // Update the user with changes if there are any
                    if (hasChanges) {
                        await this.request('PUT', `/environments/${this.getSettings().environmentId}/users/${existingUser.id}`, changes);
                    }

                    // Update enabled status if needed
                    if (enabledStatusToUpdate !== null) {
                        try {
                            await this.updateUserStatus(existingUser.id, enabledStatusToUpdate);
                            this.logger.info(`[MODIFY] Updated enabled status for user: ${existingUser.username || existingUser.email} (ID: ${existingUser.id}) to ${enabledStatusToUpdate}`);
                        } catch (statusErr) {
                            this.logger.warn(`[MODIFY] Failed to update enabled status for user: ${existingUser.username || existingUser.email} (ID: ${existingUser.id})`, statusErr);
                        }
                    }

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
            
            // Process users sequentially within each batch to avoid overwhelming the API
            for (let batchIndex = 0; batchIndex < batch.length; batchIndex++) {
                const user = batch[batchIndex];
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
                            
                            // Prepare user data for creation (without enabled field)
                            const userData = {
                                name: {
                                    given: user.firstName || user.givenName || '',
                                    family: user.lastName || user.familyName || ''
                                },
                                email: user.email,
                                username: user.username || user.email,
                                population: {
                                    id: user.populationId || defaultPopulationId || this.getSettings().populationId
                                }
                            };
                            
                            // Determine if user should be enabled (for later status update)
                            let userEnabledStatus = defaultEnabled;
                            if (user.enabled !== undefined) {
                                if (typeof user.enabled === 'string') {
                                    userEnabledStatus = user.enabled.toLowerCase() === 'true' || user.enabled === '1';
                                } else {
                                    userEnabledStatus = user.enabled;
                                }
                            }

                            // Add password if generatePasswords is enabled
                            if (generatePasswords) {
                                userData.password = {
                                    value: this.generateTemporaryPassword()
                                };
                            }

                            // Create the user
                            const createdUser = await this.request('POST', `/environments/${this.getSettings().environmentId}/users`, userData);

                            // After creation, update status if needed
                            if (userEnabledStatus === false) {
                                try {
                                    await this.updateUserStatus(createdUser.id, false);
                                    this.logger.info(`[MODIFY] Disabled user after creation: ${createdUser.username || createdUser.email} (ID: ${createdUser.id})`);
                                } catch (statusErr) {
                                    this.logger.warn(`[MODIFY] Failed to disable user after creation: ${createdUser.username || createdUser.email} (ID: ${createdUser.id})`, statusErr);
                                }
                            }

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
                            continue;
                        } catch (error) {
                            this.logger.error(`[MODIFY] Failed to create user ${user.username || user.email}:`, error.message);
                            results.failed++;
                            results.details.push({
                                user,
                                status: 'failed',
                                error: `Failed to create user: ${error.message}`,
                                reason: 'User creation failed'
                            });
                            continue;
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
                        continue;
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
                    
                    // Check each field for changes
                    Object.keys(fieldMappings).forEach(csvField => {
                        if (user[csvField] !== undefined && user[csvField] !== null && user[csvField] !== '') {
                            const apiField = fieldMappings[csvField];
                            const currentValue = this.getNestedValue(existingUser, apiField);
                            const newValue = user[csvField];
                            
                            if (currentValue !== newValue) {
                                this.setNestedValue(changes, apiField, newValue);
                                hasChanges = true;
                                this.logger.debug(`[MODIFY] Field "${csvField}" changed: "${currentValue}" -> "${newValue}"`);
                            }
                        }
                    });
                    
                    // If no changes detected, skip the user
                    if (!hasChanges) {
                        results.noChanges++;
                        results.details.push({
                            user,
                            status: 'no_changes',
                            reason: 'No changes detected'
                        });
                        this.logger.info(`[MODIFY] No changes detected for user: ${user.username || user.email}`);
                        
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
                        continue;
                    }
                    
                    // Update the user with changes
                    try {
                        this.logger.info(`[MODIFY] Updating user ${existingUser.id} with changes:`, changes);
                        const updatedUser = await this.request('PUT', `/environments/${this.getSettings().environmentId}/users/${existingUser.id}`, changes);
                        
                        results.modified++;
                        results.details.push({
                            user,
                            status: 'modified',
                            pingOneId: updatedUser.id,
                            changes: changes
                        });
                        
                        this.logger.info(`[MODIFY] Successfully modified user: ${updatedUser.username || updatedUser.email} (ID: ${updatedUser.id})`);
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
                    
                    // Add small delay between individual user operations to prevent rate limiting
                    if (batchIndex < batch.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay between users
                    }
                } catch (error) {
                    this.logger.error(`[MODIFY] Unexpected error processing user ${user.username || user.email}:`, error.message);
                    results.failed++;
                    results.details.push({
                        user,
                        status: 'failed',
                        error: error.message,
                        reason: 'Unexpected error'
                    });
                }
            }
            
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
        const maxPages = 1000;
        let fetched = 0;
        do {
            if (page > maxPages) break;
            try {
                const resp = await this.request('GET', `/environments/${settings.environmentId}/users?limit=${pageSize}&page=${page}&filter=population.id eq "${populationId}"`);
                if (resp && resp._embedded && resp._embedded.users && Array.isArray(resp._embedded.users)) {
                    const pageUsers = resp._embedded.users;
                    fetched = pageUsers.length;
                    if (fetched > 0) users.push(...pageUsers);
                } else {
                    break;
                }
            } catch (error) {
                break;
            }
            page++;
        } while (fetched > 0 && page <= maxPages);
        return users;
    }

    /**
     * Fetch all users in a specific population using search-like filtering (alternative to pagination)
     * @param {string} populationId - The population ID
     * @returns {Promise<Array>} Array of user objects
     */
    async getAllUsersInPopulationUsingSearch(populationId) {
        const settings = this.getSettings();
        
        this.logger.info(`[SEARCH-FILTER] Starting filter-based fetch for population: ${populationId}`);
        
        try {
            // Use the standard users endpoint with a filter parameter instead of search endpoint
            const response = await this.request('GET', `/environments/${settings.environmentId}/users?filter=population.id eq "${populationId}"&limit=1000`);
            
            if (response && response._embedded && response._embedded.users && Array.isArray(response._embedded.users)) {
                const users = response._embedded.users;
                this.logger.info(`[SEARCH-FILTER] Found ${users.length} users via filter for population ${populationId}`);
                return users;
            } else {
                this.logger.warn(`[SEARCH-FILTER] Invalid response structure for population ${populationId}`);
                return [];
            }
        } catch (error) {
            this.logger.error(`[SEARCH-FILTER] Error filtering users for population ${populationId}:`, error);
            return [];
        }
    }

    /**
     * Fetch all users in a specific population using offset-based approach (alternative to page-based)
     * @param {string} populationId - The population ID
     * @returns {Promise<Array>} Array of user objects
     */
    async getAllUsersInPopulationUsingOffset(populationId) {
        const settings = this.getSettings();
        const users = [];
        let offset = 0;
        const limit = 100;
        const maxUsers = 5000; // Reduced safety limit
        let fetched = 0;
        
        this.logger.info(`[OFFSET] Starting offset-based fetch for population: ${populationId}`);
        
        do {
            // Safety check to prevent infinite loops
            if (users.length >= maxUsers) {
                this.logger.warn(`[OFFSET] Reached maximum user limit (${maxUsers}) for population ${populationId}. Stopping fetch.`);
                break;
            }
            
            try {
                // Use limit and skip instead of offset (some APIs prefer skip) with proper filter format
                const resp = await this.request('GET', `/environments/${settings.environmentId}/users?limit=${limit}&skip=${offset}&filter=population.id eq "${populationId}"`);
                
                if (resp && resp._embedded && resp._embedded.users && Array.isArray(resp._embedded.users)) {
                    const offsetUsers = resp._embedded.users;
                    fetched = offsetUsers.length;
                    
                    if (fetched > 0) {
                        users.push(...offsetUsers);
                        this.logger.debug(`[OFFSET] Skip ${offset}: fetched ${fetched} users, total so far: ${users.length}`);
                        offset += fetched; // Move offset by actual fetched count
                    } else {
                        this.logger.debug(`[OFFSET] No more users returned at offset ${offset}, stopping`);
                        break;
                    }
                } else {
                    this.logger.warn(`[OFFSET] Invalid response structure at offset ${offset} for population ${populationId}`);
                    break;
                }
            } catch (error) {
                this.logger.error(`[OFFSET] Error fetching at offset ${offset} for population ${populationId}:`, error);
                break;
            }
            
            // Add small delay between requests
            await new Promise(resolve => setTimeout(resolve, 100));
            
        } while (fetched > 0);
        
        this.logger.info(`[OFFSET] Finished offset-based fetch for population ${populationId}: ${users.length} users total`);
        return users;
    }

    /**
     * Fetch all users in a specific population using single large request (no pagination)
     * @param {string} populationId - The population ID
     * @returns {Promise<Array>} Array of user objects
     */
    async getAllUsersInPopulationSingleRequest(populationId) {
        const settings = this.getSettings();
        
        this.logger.info(`[SINGLE] Starting single request fetch for population: ${populationId}`);
        
        try {
            // Try with a more reasonable limit first (1000) with proper filter format
            const resp = await this.request('GET', `/environments/${settings.environmentId}/users?limit=1000&filter=population.id eq "${populationId}"`);
            
            if (resp && resp._embedded && resp._embedded.users && Array.isArray(resp._embedded.users)) {
                const users = resp._embedded.users;
                this.logger.info(`[SINGLE] Found ${users.length} users in single request for population ${populationId}`);
                
                // Check if we might have hit the limit (indicating there could be more)
                if (users.length === 1000) {
                    this.logger.warn(`[SINGLE] Hit limit of 1000 users - there may be more users not fetched`);
                }
                
                return users;
            } else {
                this.logger.warn(`[SINGLE] Invalid response structure for population ${populationId}`);
                return [];
            }
        } catch (error) {
            this.logger.error(`[SINGLE] Error in single request for population ${populationId}:`, error);
            return [];
        }
    }

    /**
     * Fetch all users in a specific population using the most reliable method
     * This tries multiple approaches in order of preference
     * @param {string} populationId - The population ID
     * @returns {Promise<Array>} Array of user objects
     */
    async getAllUsersInPopulationReliable(populationId) {
        this.logger.info(`[RELIABLE] Starting reliable fetch for population: ${populationId}`);
        
        // Method 1: Try the original working method first
        try {
            const originalUsers = await this.getUsersByPopulation(populationId);
            if (originalUsers.length > 0) {
                this.logger.info(`[RELIABLE] Successfully used original method: ${originalUsers.length} users`);
                return originalUsers;
            }
        } catch (error) {
            this.logger.warn(`[RELIABLE] Original method failed:`, error.message);
        }
        
        // Method 2: Try filter-based approach
        try {
            const filterUsers = await this.getAllUsersInPopulationUsingSearch(populationId);
            if (filterUsers.length > 0) {
                this.logger.info(`[RELIABLE] Successfully used filter method: ${filterUsers.length} users`);
                return filterUsers;
            }
        } catch (error) {
            this.logger.warn(`[RELIABLE] Filter method failed:`, error.message);
        }
        
        // Method 3: Try single large request with smaller limit
        try {
            const singleUsers = await this.getAllUsersInPopulationSingleRequest(populationId);
            if (singleUsers.length > 0) {
                this.logger.info(`[RELIABLE] Successfully used single request method: ${singleUsers.length} users`);
                return singleUsers;
            }
        } catch (error) {
            this.logger.warn(`[RELIABLE] Single request method failed:`, error.message);
        }
        
        // Method 4: Try offset-based approach
        try {
            const offsetUsers = await this.getAllUsersInPopulationUsingOffset(populationId);
            if (offsetUsers.length > 0) {
                this.logger.info(`[RELIABLE] Successfully used offset method: ${offsetUsers.length} users`);
                return offsetUsers;
            }
        } catch (error) {
            this.logger.warn(`[RELIABLE] Offset method failed:`, error.message);
        }
        
        // Method 5: Fall back to limited pagination as last resort
        this.logger.warn(`[RELIABLE] All alternative methods failed, falling back to limited pagination`);
        return await this.getAllUsersInPopulationLimited(populationId);
    }

    /**
     * Limited pagination approach with very strict controls
     * @param {string} populationId - The population ID
     * @returns {Promise<Array>} Array of user objects
     */
    async getAllUsersInPopulationLimited(populationId) {
        const settings = this.getSettings();
        const users = [];
        let page = 1;
        const pageSize = 50; // Smaller page size
        const maxPages = 20; // Much stricter limit
        let fetched = 0;
        let consecutiveEmptyPages = 0;
        
        this.logger.info(`[LIMITED] Starting limited pagination for population: ${populationId}`);
        
        do {
            // Multiple safety checks
            if (page > maxPages) {
                this.logger.warn(`[LIMITED] Reached maximum page limit (${maxPages})`);
                break;
            }
            
            if (consecutiveEmptyPages >= 3) {
                this.logger.warn(`[LIMITED] Too many consecutive empty pages, stopping`);
                break;
            }
            
            try {
                const resp = await this.request('GET', `/environments/${settings.environmentId}/users?limit=${pageSize}&page=${page}&filter=population.id eq "${populationId}"`);
                
                if (resp && resp._embedded && resp._embedded.users && Array.isArray(resp._embedded.users)) {
                    const pageUsers = resp._embedded.users;
                    fetched = pageUsers.length;
                    
                    if (fetched > 0) {
                        users.push(...pageUsers);
                        consecutiveEmptyPages = 0;
                        this.logger.debug(`[LIMITED] Page ${page}: fetched ${fetched} users, total: ${users.length}`);
                    } else {
                        consecutiveEmptyPages++;
                        this.logger.debug(`[LIMITED] Page ${page}: no users (consecutive empty: ${consecutiveEmptyPages})`);
                    }
                } else {
                    consecutiveEmptyPages++;
                    this.logger.warn(`[LIMITED] Invalid response at page ${page}`);
                }
            } catch (error) {
                this.logger.error(`[LIMITED] Error at page ${page}:`, error);
                break;
            }
            
            page++;
            
            // Add small delay between requests
            await new Promise(resolve => setTimeout(resolve, 100));
            
        } while (fetched > 0 && page <= maxPages && consecutiveEmptyPages < 3);
        
        this.logger.info(`[LIMITED] Finished limited pagination: ${users.length} users total (${page - 1} pages)`);
        return users;
    }

    /**
     * Fetch all users in a specific population using the correct API endpoint
     * @param {string} populationId - The population ID
     * @returns {Promise<Array>} Array of user objects
     */
    async getUsersByPopulation(populationId, options = {}) {
        const settings = this.getSettings();
        const users = [];
        let page = 1;
        const pageSize = 100;
        const maxPages = 1000; // Safety limit to prevent infinite loops
        let fetched = 0;
        
        this.logger.info(`[DELETE] Starting to fetch users for population: ${populationId}`);
        
        do {
            if (options.signal && options.signal.aborted) {
                throw new DOMException('Population fetch aborted', 'AbortError');
            }
            
            // Safety check to prevent infinite loops
            if (page > maxPages) {
                this.logger.warn(`[DELETE] Reached maximum page limit (${maxPages}) for population ${populationId}. Stopping fetch.`);
                break;
            }
            
            this.logger.debug(`[DELETE] Fetching page ${page} for population ${populationId}...`);
            
            try {
                // Use the general users endpoint with proper population filter format
                const resp = await this.request('GET', `/environments/${settings.environmentId}/users?limit=${pageSize}&page=${page}&filter=population.id eq "${populationId}"`, null, options);
                
                if (resp && resp._embedded && resp._embedded.users && Array.isArray(resp._embedded.users)) {
                    const pageUsers = resp._embedded.users;
                    fetched = pageUsers.length;
                    
                    if (fetched > 0) {
                        users.push(...pageUsers);
                        this.logger.debug(`[DELETE] Page ${page}: fetched ${fetched} users, total so far: ${users.length}`);
                        
                        // Log first few users for debugging
                        if (page === 1) {
                            this.logger.debug(`[DELETE] First page users:`, pageUsers.slice(0, 3).map(u => ({ id: u.id, username: u.username, email: u.email })));
                        }
                    } else {
                        this.logger.debug(`[DELETE] Page ${page}: no users returned, stopping pagination`);
                    }
                } else {
                    this.logger.warn(`[DELETE] Invalid response structure on page ${page} for population ${populationId}`);
                    break;
                }
            } catch (error) {
                this.logger.error(`[DELETE] Error fetching page ${page} for population ${populationId}:`, error);
                break;
            }
            
            page++;
        } while (fetched > 0 && page <= maxPages);
        
        this.logger.info(`[DELETE] Finished fetching users for population ${populationId}: ${users.length} users total (${page - 1} pages)`);
        
        // Log summary of fetched users
        if (users.length > 0) {
            this.logger.debug(`[DELETE] User summary:`, {
                totalUsers: users.length,
                firstUser: { id: users[0].id, username: users[0].username, email: users[0].email },
                lastUser: { id: users[users.length - 1].id, username: users[users.length - 1].username, email: users[users.length - 1].email }
            });
        } else {
            this.logger.warn(`[DELETE] No users found in population ${populationId}`);
        }
        
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

    /**
     * Helper to get a nested value from an object using dot notation (e.g., 'name.given')
     */
    getNestedValue(obj, path) {
        if (!obj || !path) return undefined;
        return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
    }

    /**
     * Helper to set a nested value in an object using dot notation (e.g., 'name.given')
     */
    setNestedValue(obj, path, value) {
        if (!obj || !path) return;
        const parts = path.split('.');
        let current = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) current[parts[i]] = {};
            current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = value;
    }
}