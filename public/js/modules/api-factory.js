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
let isInitializing = false;
let initializationPromise = null;

/**
 * Initialize the API factory with required dependencies
 * @param {Object} logger - Logger instance
 * @param {Object} settingsManager - Settings manager instance
 * @returns {Promise<APIFactory>} Initialized API factory instance
 */
const initAPIFactory = async (logger, settingsManager) => {
    // If already initialized, return the existing instance
    if (_apiFactoryInstance) {
        return _apiFactoryInstance;
    }
    
    // If initialization is in progress, wait for it to complete
    if (isInitializing) {
        if (initializationPromise) {
            return initializationPromise;
        }
    }
    
    // Set initialization flag and create a new promise
    isInitializing = true;
    initializationPromise = new Promise(async (resolve, reject) => {
        try {
            // Create the factory instance
            const factory = new APIFactory(logger, settingsManager);
            
            // Set the instance
            _apiFactoryInstance = factory;
            defaultAPIFactory = factory;
            
            // Log successful initialization
            if (logger && logger.info) {
                logger.info('API Factory initialized successfully');
            } else {
                console.log('API Factory initialized successfully');
            }
            
            resolve(factory);
        } catch (error) {
            const errorMsg = `Failed to initialize API Factory: ${error.message}`;
            if (logger && logger.error) {
                logger.error(errorMsg, { error });
            } else {
                console.error(errorMsg, error);
            }
            reject(new Error(errorMsg));
        } finally {
            isInitializing = false;
            initializationPromise = null;
        }
    });
    
    return initializationPromise;
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
