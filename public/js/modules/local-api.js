/**
 * Local API Client
 * Handles all API calls to the local server (localhost:4000)
 */

class LocalAPI {
    /**
     * Create a new LocalAPI instance
     * @param {Object} logger - Logger instance
     */
    constructor(logger) {
        this.logger = logger || console;
        this.baseUrl = ''; // Relative URL for same-origin requests
    }

    /**
     * Make an authenticated API request to the local server
     * @param {string} method - HTTP method (GET, POST, PUT, DELETE, etc.)
     * @param {string} endpoint - API endpoint (without base URL)
     * @param {Object} [data] - Request body (for POST/PUT/PATCH)
     * @param {Object} [options] - Additional options
     * @returns {Promise<Object>} Response data
     */
    async request(method, endpoint, data = null, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        
        // Prepare headers
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...options.headers
        };

        // Log the request
        this.logger.debug('Local API Request:', {
            method,
            url,
            headers: { ...headers, 'Authorization': headers.Authorization ? '***REDACTED***' : 'Not set' },
            data
        });

        try {
            const response = await fetch(url, {
                method,
                headers,
                credentials: 'include', // Include cookies for session management
                body: data ? JSON.stringify(data) : undefined
            });

            const responseData = await this._handleResponse(response);
            
            // Log successful response
            this.logger.debug('Local API Response:', {
                status: response.status,
                url,
                data: responseData
            });

            return responseData;
        } catch (error) {
            this.logger.error('Local API Error:', error);
            throw error;
        }
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
            const error = new Error(data.message || 'API request failed');
            error.status = response.status;
            error.data = data;
            throw error;
        }

        return data;
    }

    // Convenience methods for common HTTP methods
    get(endpoint, options = {}) {
        return this.request('GET', endpoint, null, options);
    }

    post(endpoint, data, options = {}) {
        return this.request('POST', endpoint, data, options);
    }

    put(endpoint, data, options = {}) {
        return this.request('PUT', endpoint, data, options);
    }

    delete(endpoint, options = {}) {
        return this.request('DELETE', endpoint, null, options);
    }
}

// Export a singleton instance
export const localAPI = new LocalAPI(console);
