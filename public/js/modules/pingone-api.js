const TokenManager = require('./token-manager.js');

class PingOneAPI {
    constructor(logger, settingsManager) {
        this.logger = logger;
        this.settingsManager = settingsManager;
        this.tokenManager = new TokenManager(logger, this.getCurrentSettings());
    }
    
    /**
     * Get current settings from settings manager
     * @returns {Object} Current settings
     */
    getCurrentSettings() {
        return {
            apiClientId: this.settingsManager.getSetting('apiClientId'),
            apiSecret: this.settingsManager.getSetting('apiSecret'),
            environmentId: this.settingsManager.getSetting('environmentId')
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
            return response._embedded?.populations || [];
        } catch (error) {
            this.logger.error(`Failed to fetch populations: ${error.message}`);
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
            // Try to find a population named 'Default' (case insensitive)
            const defaultPopulation = populations.find(pop => 
                pop.name && pop.name.toLowerCase() === 'default'
            );
            
            if (defaultPopulation) {
                return defaultPopulation.id;
            }
            
            // If no default population found, return the first one
            if (populations.length > 0) {
                return populations[0].id;
            }
            
            throw new Error('No populations found in the environment');
        } catch (error) {
            this.logger.error(`Failed to get default population: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update the API settings and refresh the token manager
     * @param {Object} settings - New settings object
     */
    updateSettings(settings) {
        try {
            // Update the token manager with new settings
            this.tokenManager.updateSettings({
                apiClientId: settings.apiClientId,
                apiSecret: settings.apiSecret,
                environmentId: settings.environmentId
            });
            
            // Clear any existing token to force a new one to be fetched with the new settings
            this.clearToken();
            
            this.logger.log('PingOne API settings updated', 'info');
        } catch (error) {
            this.logger.error(`Failed to update API settings: ${error.message}`);
            throw error;
        }
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
        try {
            const environmentId = this.settingsManager.getSetting('environmentId');
            
            if (!environmentId) {
                throw new Error('Environment ID is not configured');
            }
            
            // Add environment ID to the endpoint if it's not already there
            let fullEndpoint = endpoint.startsWith(`/v1/environments/${environmentId}`) 
                ? endpoint 
                : `/v1/environments/${environmentId}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
            
            // Use our server-side proxy
            const url = `/api/pingone${fullEndpoint}`;
            
            // Log the request
            this.logger.log(`API ${method} ${url}`, 'info');
            
            // Determine content type - use custom type if provided, otherwise default to application/json
            const contentType = options.contentType || 'application/json';
            
            // Make the request to our proxy
            const headers = {
                'Accept': 'application/json',
                ...options.headers
            };
            
            // Prepare the request body
            let requestBody = null;
            if (data) {
                // Set Content-Type header based on the content type
                headers['Content-Type'] = contentType;
                
                // For user import, we need to send the exact JSON string without additional processing
                if (contentType === 'application/vnd.pingone.import.users+json') {
                    // Ensure we're sending the exact format PingOne expects
                    requestBody = JSON.stringify({
                        users: data.users || data
                    });
                } 
                // For regular JSON requests, stringify the data
                else if (contentType === 'application/json') {
                    requestBody = JSON.stringify(data);
                }
                // For other content types, send as-is (e.g., FormData)
                else {
                    requestBody = data;
                }
            }
            
            // Log the request details for debugging
            this.logger.log(`Sending ${method} request to ${url}`, 'debug', {
                headers,
                body: requestBody ? JSON.parse(requestBody) : null,
                contentType
            });
            
            const response = await fetch(url, {
                method,
                headers,
                body: requestBody,
                signal: options.signal,
                credentials: 'same-origin'  // Include cookies for session management
            });
            
            // Handle response
            if (!response.ok) {
                let errorMessage = `API request failed with status ${response.status} (${response.statusText})`;
                let errorDetails = null;
                
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorData.message || errorMessage;
                    errorDetails = errorData;
                    
                    // For 400 Bad Request, include validation errors if available
                    if (response.status === 400 && errorData.details) {
                        errorMessage += ': ' + JSON.stringify(errorData.details);
                    }
                } catch (e) {
                    // If we can't parse the error as JSON, try to get the text
                    const errorText = await response.text().catch(() => '');
                    if (errorText) {
                        errorMessage += `: ${errorText}`;
                    }
                }
                
                const error = new Error(errorMessage);
                error.status = response.status;
                error.details = errorDetails;
                throw error;
            }
            // Check if response has content before trying to parse as JSON
            const responseText = await response.text();
            if (!responseText) {
                return {}; // Return empty object for empty responses
            }
            
            try {
                return JSON.parse(responseText);
            } catch (e) {
                // If not JSON, return as text
                return responseText;
            }
            
        } catch (error) {
            this.logger.error(`API request failed: ${error.message}`, 'error');
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
            if (!email) return false;
            
            // Search for users with the given email
            const response = await this.apiRequest('GET', `/users?filter=email eq \"${encodeURIComponent(email)}\"`);
            
            // If we found any users with this email, return true
            return response._embedded && 
                   response._embedded.users && 
                   response._embedded.users.length > 0;
        } catch (error) {
            // If there's an error (e.g., 404), treat as user not found
            if (error.status === 404) {
                return false;
            }
            // For other errors, log and rethrow
            this.logger.error(`Error checking if user exists (${email}): ${error.message}`);
            throw error;
        }
    }

    /**
     * Import multiple users
     * @param {Array<Object>} users - Array of user objects to import
     * @param {Object} [options] - Import options
     * @param {boolean} [options.skipExisting=false] - Whether to skip users that already exist
     * @returns {Promise<Object>} Import results
     */
    async importUsers(users, options = {}, signal = null) {
        try {
            // Ensure we have an array of users
            const userArray = Array.isArray(users) ? users : [users];
            
            // Get the population ID from options or use the default one
            let populationId = options.populationId;
            if (!populationId) {
                this.logger.log('No population ID provided, fetching default population...', 'info');
                populationId = await this.getDefaultPopulationId();
                this.logger.log(`Using default population ID: ${populationId}`, 'info');
            }
            
            // Format users according to PingOne API requirements
            const formattedUsers = userArray.map(user => {
                if (!user.email) {
                    throw new Error('Email is required for user import');
                }
                
                // Create a clean user object with only the fields we want to send
                const formattedUser = {
                    email: user.email,
                    username: user.username || user.email.split('@')[0],
                    name: {
                        given: user.firstName || user.givenName || '',
                        family: user.lastName || user.familyName || ''
                    },
                    population: {
                        id: populationId
                    },
                    enabled: true
                };
                
                // Add any additional fields that might be present
                if (user.phone) formattedUser.phone = user.phone;
                if (user.title) formattedUser.title = user.title;
                if (user.locale) formattedUser.locale = user.locale;
                
                return formattedUser;
            });
            
            // Format the request body according to PingOne API requirements
            const requestBody = {
                users: formattedUsers
            };
            
            this.logger.log('Prepared user import request', 'debug', { userCount: formattedUsers.length });
            
            // Add query parameters for options
            const queryParams = [];
            if (options.updateExisting) {
                queryParams.push('updateExisting=true');
            }
            
            const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
            
            // Use the correct content type for user import
            return this.apiRequest('POST', `/users/import${queryString}`, requestBody, {
                ...(signal && { signal }),
                contentType: 'application/vnd.pingone.import.users+json'
            });
        } catch (error) {
            this.logger.error(`Error in importUsers: ${error.message}`, error);
            throw error;
        }
    }
}

module.exports = { PingOneAPI };
