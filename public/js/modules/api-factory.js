/**
 * API Factory
 * Creates and manages API client instances
 */

import { LocalAPIClient, localAPIClient } from './local-api-client.js';
import { PingOneClient } from './pingone-client.js';

/**
 * API Factory class
 */
class APIFactory {
    /**
     * Create a new APIFactory instance
     * @param {Object} logger - Logger instance
     * @param {Object} settingsManager - Settings manager instance
     */
    constructor(logger, settingsManager) {
        this.logger = logger || console;
        this.settingsManager = settingsManager;
        this.clients = new Map();
    }

    /**
     * Get or create a PingOne API client
     * @returns {PingOneClient} PingOne API client instance
     */
    getPingOneClient() {
        if (!this.clients.has('pingone')) {
            this.clients.set('pingone', new PingOneClient(this.logger, this.settingsManager));
        }
        return this.clients.get('pingone');
    }

    /**
     * Get or create a local API client
     * @param {string} [baseUrl=''] - Base URL for the API
     * @returns {LocalAPIClient} Local API client instance
     */
    getLocalClient(baseUrl = '') {
        const cacheKey = `local_${baseUrl}`;
        if (!this.clients.has(cacheKey)) {
            this.clients.set(cacheKey, new LocalAPIClient(this.logger, baseUrl));
        }
        return this.clients.get(cacheKey);
    }

    /**
     * Get the default local API client (singleton)
     * @returns {LocalAPIClient} Default local API client instance
     */
    getDefaultLocalClient() {
        return localAPIClient;
    }
}

// Create a singleton instance but don't export it directly
let _apiFactoryInstance = null;

/**
 * Initialize the API factory with required dependencies
 * @param {Object} logger - Logger instance
 * @param {Object} settingsManager - Settings manager instance
 */
const initAPIFactory = (logger, settingsManager) => {
    if (!_apiFactoryInstance) {
        _apiFactoryInstance = new APIFactory(logger, settingsManager);
    }
    return _apiFactoryInstance;
};

// Export the singleton instance and initialization function
export { APIFactory, initAPIFactory };

// For backward compatibility, export a default instance (will be initialized when initAPIFactory is called)
let defaultAPIFactory = null;

export const apiFactory = {
    getPingOneClient: () => {
        if (!defaultAPIFactory) {
            throw new Error('API Factory not initialized. Call initAPIFactory() first.');
        }
        return defaultAPIFactory.getPingOneClient();
    },
    getLocalClient: (baseUrl = '') => {
        if (!defaultAPIFactory) {
            throw new Error('API Factory not initialized. Call initAPIFactory() first.');
        }
        return defaultAPIFactory.getLocalClient(baseUrl);
    }
};

// For backward compatibility
export const getAPIFactory = () => defaultAPIFactory;
