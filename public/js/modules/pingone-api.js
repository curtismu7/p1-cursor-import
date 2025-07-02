const TokenManager = require('./token-manager.js');

class PingOneAPI {
    constructor(logger, settingsManager) {
        this.logger = logger;
        this.settingsManager = settingsManager;
        this.tokenManager = new TokenManager(logger, this.getCurrentSettings());
    }
    
    /**
     * Get the base URL for the PingOne API based on region
     * @param {string} region - The region code (e.g., 'NorthAmerica', 'Europe')
     * @returns {string} The base URL for the API
     */
    getApiBaseUrl(region) {
        const baseUrls = {
            'NorthAmerica': 'https://api.pingone.com/v1',
            'Europe': 'https://api.eu.pingone.com/v1',
            'Asia': 'https://api.asia.pingone.com/v1',
            'Canada': 'https://api.ca.pingone.com/v1'
        };
        
        return baseUrls[region] || baseUrls['NorthAmerica'];
    }
    
    /**
     * Get current settings from settings manager
     * @returns {Object} Current settings
     */
    getCurrentSettings() {
        return {
            apiClientId: this.settingsManager.getSetting('apiClientId'),
            apiSecret: this.settingsManager.getSetting('apiSecret'),
            environmentId: this.settingsManager.getSetting('environmentId'),
            region: this.settingsManager.getSetting('region', 'NorthAmerica')
        };
    }

    /**
     * Get an access token using client credentials flow
     * @returns {Promise<string>} Access token
     */
    async getAccessToken() {
        try {
            // Update token manager with latest settings
            this.tokenManager.updateSettings(this.getCurrentSettings());
            return await this.tokenManager.getAccessToken();
        } catch (error) {
            this.logger.error(`Failed to get access token: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Clear the current token (force a new one to be fetched on next request)
     */
    clearToken() {
        this.tokenManager.clearToken();
    }

    /**
     * Get all populations from PingOne
     * @returns {Promise<Array>} Array of population objects
     */
    async getPopulations() {
        try {
            const response = await this.apiRequest('GET', '/populations');
            return response._embedded.populations || [];
        } catch (error) {
            this.logger.error('Failed to get populations:', error);
            throw error;
        }
    }

    /**
     * Get the default population ID
     * @returns {Promise<string>} The default population ID
     */
    async getDefaultPopulationId() {
        try {
            const populations = await this.getPopulations();
            
            // First try to find a population with 'default' in the name
            const defaultPop = populations.find(pop => 
                pop.name && pop.name.toLowerCase().includes('default'));
                
            if (defaultPop) {
                return defaultPop.id;
            }
            
            // If no default found, return the first population ID
            if (populations.length > 0) {
                return populations[0].id;
            }
            
            throw new Error('No populations found');
        } catch (error) {
            this.logger.error('Failed to get default population ID:', error);
            throw error;
        }
    }

    /**
     * Update the API settings and refresh the token manager
     * @param {Object} settings - New settings object
     */
    updateSettings(settings) {
        // Update settings in settings manager
        Object.entries(settings).forEach(([key, value]) => {
            this.settingsManager.setSetting(key, value);
        });
        
        // Update token manager with new settings
        this.tokenManager.updateSettings(this.getCurrentSettings());
        
        // Clear any existing token to force refresh
        this.clearToken();
    }
    
    /**
     * Make an authenticated API request
     * @param {string} method - HTTP method (GET, POST, PUT, DELETE, etc.)
     * @param {string} endpoint - API endpoint (without base URL)
     * @param {Object} [data] - Request body (for POST/PUT/PATCH)
     * @param {Object} [options] - Additional options
     * @param {AbortSignal} [options.signal] - Abort signal for request cancellation
     * @returns {Promise<Object>} Response data
     */
    async apiRequest(method, endpoint, data = null, options = {}) {
        const settings = this.getCurrentSettings();
        
        // For PingOne API calls, use the proxy endpoint
        const isPingOneApi = endpoint.startsWith('/v1/');
        const url = isPingOneApi ? `/api/proxy${endpoint}` : endpoint;
        
        // Prepare headers
        const requestHeaders = {
            'Accept': 'application/json',
            ...options.headers
        };
        
        // Add Authorization header for PingOne API calls
        if (isPingOneApi) {
            requestHeaders['Authorization'] = `Bearer ${await this.getAccessToken()}`;
        }
        
        // Set content type based on the request
        if (method !== 'GET' && method !== 'HEAD') {
            if (endpoint.endsWith('/users') && method === 'POST') {
                requestHeaders['Content-Type'] = 'application/vnd.pingidentity.user.import+json';
            } else if (!requestHeaders['Content-Type']) {
                requestHeaders['Content-Type'] = 'application/json';
            }
        }
        
        // Log the request details
        console.log('=== API REQUEST ===');
        console.log('Method:', method);
        console.log('URL:', url);
        console.log('Endpoint:', endpoint);
        
        const headers = {
            'Authorization': `Bearer ${await this.getAccessToken()}`,
            'Accept': 'application/json',
            ...options.headers
        };
        
        console.log('Headers:', JSON.stringify(headers, null, 2));
        
        let requestBody = null;
        const requestContentType = headers['Content-Type'] || 'application/json';
        
        // Set Content-Type header based on the content type
        headers['Content-Type'] = requestContentType;
        
        console.log('Request Content Type:', requestContentType);
        
        // For user import, format the request body
        if (requestContentType === 'application/vnd.pingidentity.user.import+json') {
            console.log('Processing user import request');
            requestBody = JSON.stringify(data);
            console.log('Request Body:', requestBody);
        } else if (requestContentType === 'application/json') {
            requestBody = JSON.stringify(data);
            console.log('Request Body:', requestBody);
        } else {
            requestBody = data;
            console.log('Request Body (raw):', requestBody);
        }
        
        // Prepare fetch options with CORS mode
        const fetchOptions = {
            method,
            headers: requestHeaders,
            body: requestBody,
            mode: 'cors',
            credentials: 'omit' // Don't send cookies with CORS requests
        };
        
        // For preflight requests, ensure the content type is set correctly
        if (method === 'OPTIONS') {
            fetchOptions.headers['Access-Control-Request-Method'] = method;
            fetchOptions.headers['Access-Control-Request-Headers'] = 'authorization,content-type';
        }
        
        // Make the request
        try {
            console.log('Sending request to proxy:', url);
            const response = await fetch(url, fetchOptions);
            
            // Clone the response so we can read it multiple times if needed
            const responseClone = response.clone();
            
            // Log response status
            console.log('Response Status:', response.status, response.statusText);
            
            // Handle non-2xx responses
            if (!response.ok) {
                let errorMessage = `Request failed with status ${response.status}`;
                try {
                    const errorData = await responseClone.json();
                    console.error('Error response:', JSON.stringify(errorData, null, 2));
                    errorMessage = errorData.detail || errorData.message || JSON.stringify(errorData);
                } catch (e) {
                    console.error('Failed to parse error response:', e);
                    const text = await responseClone.text();
                    console.error('Raw error response:', text);
                    errorMessage = `${response.status} ${response.statusText}`;
                }
                
                const error = new Error(errorMessage);
                error.status = response.status;
                error.response = response;
                throw error;
            }
            
            // For 204 No Content responses, return null
            if (response.status === 204) {
                return null;
            }
            
            // Parse and return JSON response
            const responseData = await response.json();
            console.log('Response Data:', JSON.stringify(responseData, null, 2));
            return responseData;
            
        } catch (error) {
            console.error('API request failed:', error);
            if (error.response) {
                try {
                    const errorData = await error.response.json();
                    console.error('Error details:', errorData);
                } catch (e) {
                    console.error('Could not parse error response:', e);
                }
            }
            throw error;
        }
    }
    
    /**
     * Get a list of users
     * @param {Object} [params] - Query parameters
     * @returns {Promise<Array>} List of users
     */
    async getUsers(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.apiRequest('GET', `/users${query ? `?${query}` : ''}`);
    }

    /**
     * Create a new user
     * @param {Object} userData - User data
     * @returns {Promise<Object>} Created user
     */
    async createUser(userData) {
        return this.apiRequest('POST', '/users', userData);
    }

    /**
     * Update an existing user
     * @param {string} userId - User ID
     * @param {Object} userData - Updated user data
     * @returns {Promise<Object>} Updated user
     */
    async updateUser(userId, userData) {
        return this.apiRequest('PUT', `/users/${userId}`, userData);
    }

    /**
     * Delete a user
     * @param {string} userId - User ID
     * @returns {Promise<void>}
     */
    async deleteUser(userId) {
        return this.apiRequest('DELETE', `/users/${userId}`);
    }

    /**
     * Get user by ID
     * @param {string} userId - User ID
     * @returns {Promise<Object>} User data
     */
    async getUser(userId) {
        return this.apiRequest('GET', `/users/${userId}`);
    }

    /**
     * Search for users
     * @param {Object} filter - Filter criteria
     * @returns {Promise<Array>} Matching users
     */
    async searchUsers(filter) {
        return this.apiRequest('POST', '/users/.search', { filter });
    }

    /**
     * Check if a user with the given email already exists in PingOne
     * @param {string} email - User email to check
     * @returns {Promise<boolean>} True if user exists, false otherwise
     */
    async userExists(email) {
        try {
            const users = await this.searchUsers({ email: { $eq: email } });
            return users.length > 0;
        } catch (error) {
            this.logger.error(`Error checking if user exists (${email}):`, error);
            throw error;
        }
    }

    /**
     * Helper to get field value case-insensitively
     */
    getField(obj, possibleNames, defaultValue = '') {
        if (!obj) return defaultValue;
        
        const key = Object.keys(obj).find(k => 
            possibleNames.map(n => n.toLowerCase()).includes(k.toLowerCase())
        );
        
        return key ? obj[key] : defaultValue;
    }

    /**
     * Import multiple users
     * @param {Array<Object>} users - Array of user objects to import
     * @param {Object} [options] - Import options
     * @param {boolean} [options.skipExisting=false] - Whether to skip users that already exist
     * @param {boolean} [options.skipErrors=false] - Whether to continue on error
     * @param {string} [options.populationId] - Population ID to assign users to
     * @returns {Promise<Object>} Import results
     */
    /**
     * Import multiple users into PingOne
     * @param {Array<Object>} users - Array of user objects to import
     * @param {Object} [options] - Import options
     * @param {boolean} [options.skipExisting=false] - Whether to skip users that already exist
     * @param {boolean} [options.continueOnError=false] - Whether to continue on error
     * @param {string} [options.populationId] - Population ID to assign users to
     * @returns {Promise<Object>} Import results
     */
    async importUsers(users, options = {}, signal = null) {
        if (!users || !Array.isArray(users) || users.length === 0) {
            throw new Error('No users provided for import');
        }

        const results = [];
        const populationId = options.populationId || await this.getDefaultPopulationId();
        
        if (!populationId) {
            throw new Error('No population ID provided and no default population found');
        }

        this.logger.log(`Starting import of ${users.length} users to population ${populationId}`, 'info');

        for (const [index, user] of users.entries()) {
            try {
                // Format user data according to PingOne API requirements
                const userData = {
                    name: {
                        given: this.getField(user, ['firstName', 'givenName', 'firstname', 'first_name', 'first']) || '',
                        family: this.getField(user, ['lastName', 'familyName', 'lastname', 'last_name', 'last']) || ''
                    },
                    email: this.getField(user, ['email', 'mail', 'Email', 'e-mail']),
                    username: this.getField(user, ['username', 'userName', 'login', 'user']) || user.email,
                    population: { id: populationId },
                    password: {
                        value: this.getField(user, ['password', 'pwd', 'pass']) || this.generateTemporaryPassword()
                    },
                    enabled: user.enabled !== false
                };

                // Add phone number if available
                const phone = this.getField(user, ['phone', 'mobile', 'mobilePhone', 'phoneNumber']);
                if (phone) {
                    userData.phoneNumbers = [{
                        type: 'mobile',
                        value: phone
                    }];
                }

                // Skip if user exists and skipExisting is true
                if (options.skipExisting) {
                    const exists = await this.userExists(userData.email);
                    if (exists) {
                        results.push({
                            success: true,
                            skipped: true,
                            user: userData.email,
                            message: 'User already exists'
                        });
                        continue;
                    }
                }

                // Make the API request to create the user
                const response = await this.apiRequest('POST', '/users', userData, {
                    headers: {
                        'Content-Type': 'application/vnd.pingidentity.user.import+json',
                        'Accept': 'application/json'
                    },
                    signal
                });

                results.push({
                    success: true,
                    userId: response.id,
                    email: userData.email,
                    details: response
                });

            } catch (error) {
                this.logger.error(`Error importing user at index ${index}:`, error);
                
                let errorMessage = error.message;
                if (error.response) {
                    try {
                        const errorData = await error.response.json();
                        errorMessage = errorData.detail || errorData.message || JSON.stringify(errorData);
                    } catch (e) {
                        errorMessage = `${error.response.status} ${error.response.statusText}`;
                    }
                }

                results.push({
                    success: false,
                    email: user.email || `user_${index}`,
                    error: errorMessage,
                    details: error.response?.data || error
                });

                if (!options.continueOnError) {
                    throw error;
                }
            }
        }

        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);
        
        return {
            total: users.length,
            successful: successful.length,
            failed: failed.length,
            skipped: results.filter(r => r.skipped).length,
            results
        };
    }

    /**
     * Generate a secure random password
     * @returns {string} A random password
     * @private
     */
    generateTemporaryPassword() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
        let password = '';
        for (let i = 0; i < 16; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    }
}

module.exports = { PingOneAPI };
