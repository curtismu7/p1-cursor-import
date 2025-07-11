/**
 * Local API Client
 * Handles all API calls to the local server (localhost:4000)
 */

export class LocalAPIClient {
    /**
     * Create a new LocalAPIClient instance
     * @param {Object} logger - Logger instance
     * @param {string} [baseUrl=''] - Base URL for the API (defaults to relative path)
     */
    constructor(logger, baseUrl = '') {
        this.logger = logger || console;
        this.baseUrl = baseUrl;
    }

    /**
     * Make an API request to the local server
     * @param {string} method - HTTP method (GET, POST, PUT, DELETE, etc.)
     * @param {string} endpoint - API endpoint (without base URL)
     * @param {Object} [data] - Request body (for POST/PUT/PATCH)
     * @param {Object} [options] - Additional options
     * @returns {Promise<Object>} Response data
     */
    async request(method, endpoint, data = null, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const startTime = Date.now();

        // Enhanced options with retry logic
        const requestOptions = {
            ...options,
            retries: options.retries || 3,
            retryDelay: options.retryDelay || 1000 // 1 second base delay
        };

        // Prepare headers
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        // Add authorization if available
        if (this.accessToken) {
            headers.Authorization = `Bearer ${this.accessToken}`;
        }

        // Prepare request body
        let body = null;
        if (data && method !== 'GET') {
            body = JSON.stringify(data);
        }

        // Log the request with minimal details to avoid rate limiting
        const requestLog = {
            type: 'api_request',
            method,
            url,
            timestamp: new Date().toISOString(),
            source: 'local-api-client'
        };
        this.logger.debug('🔄 Local API Request:', requestLog);

        // Retry logic
        let lastError = null;
        for (let attempt = 1; attempt <= requestOptions.retries; attempt++) {
            try {
                const response = await fetch(url, {
                    method,
                    headers,
                    body
                });

                const responseData = await this._handleResponse(response);

                // Log successful response with minimal details
                const responseLog = {
                    type: 'api_response',
                    status: response.status,
                    method,
                    duration: Date.now() - startTime,
                    attempt: attempt,
                    source: 'local-api-client'
                };
                this.logger.debug('✅ Local API Response:', responseLog);

                return responseData;
            } catch (error) {
                lastError = error;
                this.logger.error(`Local API Error (attempt ${attempt}/${requestOptions.retries}):`, error);

                // Get the friendly error message if available
                const friendlyMessage = error.friendlyMessage || error.message;
                const isRateLimit = error.status === 429;

                // Calculate baseDelay and delay here, before using them
                const baseDelay = isRateLimit ? (requestOptions.retryDelay * 2) : requestOptions.retryDelay;
                const delay = baseDelay * Math.pow(2, attempt - 1);

                // Show appropriate UI messages based on error type
                if (window.app && window.app.uiManager) {
                    if (isRateLimit) {
                        if (attempt < requestOptions.retries) {
                            // Use enhanced rate limit warning with retry information
                            window.app.uiManager.showRateLimitWarning(friendlyMessage, {
                                isRetrying: true,
                                retryAttempt: attempt,
                                maxRetries: requestOptions.retries,
                                retryDelay: delay
                            });
                        } else {
                            window.app.uiManager.showError(friendlyMessage);
                        }
                    } else if (attempt === requestOptions.retries) {
                        // For other errors, show friendly message on final attempt
                        window.app.uiManager.showError(friendlyMessage);
                    }
                }

                // If this is the last attempt, throw with friendly message
                if (attempt === requestOptions.retries) {
                    throw error;
                }

                // Only retry for rate limits (429) and server errors (5xx)
                const shouldRetry = isRateLimit || error.status >= 500 || !error.status;
                if (!shouldRetry) {
                    // Don't retry for client errors (4xx except 429), throw immediately
                    throw error;
                }

                // Use the delay calculated above
                this.logger.info(`Retrying request in ${delay}ms... (attempt ${attempt + 1}/${requestOptions.retries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        // If all retries fail, throw the last error
        throw lastError;
    }

    /**
     * Handle API response
     * @private
     */
    async _handleResponse(response) {
        const contentType = response.headers.get('content-type');
        let data;

        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }

        if (!response.ok) {
            let errorMessage;
            
            // Provide user-friendly error messages based on status code
            switch (response.status) {
                case 400:
                    errorMessage = this._getBadRequestMessage(data, response.url);
                    break;
                case 401:
                    errorMessage = this._getUnauthorizedMessage();
                    break;
                case 403:
                    errorMessage = this._getForbiddenMessage(data, response.url);
                    break;
                case 404:
                    errorMessage = this._getNotFoundMessage(data, response.url);
                    break;
                case 429:
                    errorMessage = this._getRateLimitMessage();
                    break;
                case 500:
                case 501:
                case 502:
                case 503:
                case 504:
                    errorMessage = this._getServerErrorMessage(response.status);
                    break;
                default:
                    errorMessage = data.message || `Request failed with status ${response.status}`;
            }
            
            const error = new Error(errorMessage);
            error.status = response.status;
            error.details = data;
            error.friendlyMessage = errorMessage;
            throw error;
        }

        return data;
    }

    /**
     * Get user-friendly error message for 400 Bad Request errors
     * @private
     */
    _getBadRequestMessage(data, url) {
        // Check if it's an import endpoint error
        if (url.includes('/import')) {
            if (data && data.error) {
                // Return the specific error message from the server
                return data.error;
            }
            if (data && data.message) {
                return data.message;
            }
            return '🔍 Import failed. Please check your CSV file and settings.';
        }
        
        // Check if it's a user modification endpoint
        if (url.includes('/users/') && url.includes('PUT')) {
            return '🔍 User data validation failed. Please check the user information and try again.';
        }
        
        // Check if it's a user creation endpoint
        if (url.includes('/users') && url.includes('POST')) {
            return '🔍 User creation failed due to invalid data. Please check required fields and try again.';
        }
        
        // Check if it's a population-related error
        if (url.includes('/populations')) {
            return '🔍 Population data is invalid. Please check your population settings.';
        }
        
        // Generic 400 error
        return '🔍 Request data is invalid. Please check your input and try again.';
    }

    /**
     * Get user-friendly error message for 401 Unauthorized errors
     * @private
     */
    _getUnauthorizedMessage() {
        return '🔑 Authentication failed. Please check your PingOne credentials and try again.';
    }

    /**
     * Get user-friendly error message for 403 Forbidden errors
     * @private
     */
    _getForbiddenMessage(data, url) {
        // Check if it's a user modification endpoint
        if (url.includes('/users/') && url.includes('PUT')) {
            return '🚫 Permission denied. Your PingOne application may not have permission to modify users.';
        }
        
        // Check if it's a user creation endpoint
        if (url.includes('/users') && url.includes('POST')) {
            return '🚫 Permission denied. Your PingOne application may not have permission to create users.';
        }
        
        // Check if it's a user deletion endpoint
        if (url.includes('/users/') && url.includes('DELETE')) {
            return '🚫 Permission denied. Your PingOne application may not have permission to delete users.';
        }
        
        // Generic 403 error
        return '🚫 Access denied. Your PingOne application may not have the required permissions for this operation.';
    }

    /**
     * Get user-friendly error message for 404 Not Found errors
     * @private
     */
    _getNotFoundMessage(data, url) {
        // Check if it's a user-related endpoint
        if (url.includes('/users/')) {
            return '🔍 User not found. The user may have been deleted or the ID is incorrect.';
        }
        
        // Check if it's a population-related endpoint
        if (url.includes('/populations')) {
            return '🔍 Population not found. Please check your population settings.';
        }
        
        // Check if it's an environment-related endpoint
        if (url.includes('/environments/')) {
            return '🔍 PingOne environment not found. Please check your environment ID.';
        }
        
        // Generic 404 error
        return '🔍 Resource not found. Please check the ID or settings and try again.';
    }

    /**
     * Get user-friendly error message for 429 Too Many Requests errors
     * @private
     */
    _getRateLimitMessage() {
        return '⏰ You are sending requests too quickly. Please wait a moment and try again.';
    }

    /**
     * Get user-friendly error message for 500+ server errors
     * @private
     */
    _getServerErrorMessage(status) {
        if (status >= 500) {
            return '🔧 PingOne service is experiencing issues. Please try again in a few minutes.';
        }
        return '🔧 An unexpected error occurred. Please try again.';
    }

    // Convenience methods for common HTTP methods
    get(endpoint, options = {}) {
        return this.request('GET', endpoint, null, options);
    }

    post(endpoint, data, options = {}) {
        return this.request('POST', endpoint, data, options);
    }

    /**
     * Send a POST request with FormData (for file uploads)
     * @param {string} endpoint - API endpoint
     * @param {FormData} formData - FormData object
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Response data
     */
    async postFormData(endpoint, formData, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const startTime = Date.now();

        // Enhanced options with retry logic
        const requestOptions = {
            ...options,
            retries: options.retries || 3,
            retryDelay: options.retryDelay || 1000 // 1 second base delay
        };

        // Prepare headers for FormData (don't set Content-Type, let browser set it with boundary)
        const headers = {
            'Accept': 'application/json'
        };

        // Add authorization if available
        if (this.accessToken) {
            headers.Authorization = `Bearer ${this.accessToken}`;
        }

        // Log the request with minimal details to avoid rate limiting
        const requestLog = {
            type: 'api_request',
            method: 'POST',
            url,
            timestamp: new Date().toISOString(),
            source: 'local-api-client',
            contentType: 'multipart/form-data'
        };
        this.logger.debug('🔄 Local API FormData Request:', requestLog);

        // Retry logic
        let lastError = null;
        for (let attempt = 1; attempt <= requestOptions.retries; attempt++) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers,
                    body: formData
                });

                const responseData = await this._handleResponse(response);

                // Log successful response with minimal details
                const responseLog = {
                    type: 'api_response',
                    status: response.status,
                    method: 'POST',
                    duration: Date.now() - startTime,
                    attempt: attempt,
                    source: 'local-api-client'
                };
                this.logger.debug('✅ Local API FormData Response:', responseLog);

                return responseData;
            } catch (error) {
                lastError = error;
                this.logger.error(`Local API FormData Error (attempt ${attempt}/${requestOptions.retries}):`, error);

                // Get the friendly error message if available
                const friendlyMessage = error.friendlyMessage || error.message;
                const isRateLimit = error.status === 429;

                // Calculate baseDelay and delay here, before using them
                const baseDelay = isRateLimit ? (requestOptions.retryDelay * 2) : requestOptions.retryDelay;
                const delay = baseDelay * Math.pow(2, attempt - 1);

                // Show appropriate UI messages based on error type
                if (window.app && window.app.uiManager) {
                    if (isRateLimit) {
                        if (attempt < requestOptions.retries) {
                            // Use enhanced rate limit warning with retry information
                            window.app.uiManager.showRateLimitWarning(friendlyMessage, {
                                isRetrying: true,
                                retryAttempt: attempt,
                                maxRetries: requestOptions.retries,
                                retryDelay: delay
                            });
                        } else {
                            window.app.uiManager.showError(friendlyMessage);
                        }
                    } else if (attempt === requestOptions.retries) {
                        // For other errors, show friendly message on final attempt
                        window.app.uiManager.showError(friendlyMessage);
                    }
                }

                // If this is the last attempt, throw with friendly message
                if (attempt === requestOptions.retries) {
                    throw error;
                }

                // Only retry for rate limits (429) and server errors (5xx)
                const shouldRetry = isRateLimit || error.status >= 500 || !error.status;
                if (!shouldRetry) {
                    // Don't retry for client errors (4xx except 429), throw immediately
                    throw error;
                }

                // Use the delay calculated above
                this.logger.info(`Retrying FormData request in ${delay}ms... (attempt ${attempt + 1}/${requestOptions.retries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        // If all retries fail, throw the last error
        throw lastError;
    }

    put(endpoint, data, options = {}) {
        return this.request('PUT', endpoint, data, options);
    }

    delete(endpoint, options = {}) {
        return this.request('DELETE', endpoint, null, options);
    }
}

// Export a singleton instance
export const localAPIClient = new LocalAPIClient(console);
