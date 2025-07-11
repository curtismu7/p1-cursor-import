// File: settings-manager.js
// Description: Application settings management with encryption support
// 
// This module handles all application configuration including:
// - Secure storage of API credentials and settings
// - Encryption/decryption of sensitive data
// - Settings validation and default values
// - Local storage management with fallbacks
// - Device-specific encryption keys
// 
// Provides a secure way to store and retrieve application settings.

import { CryptoUtils } from './crypto-utils.js';

/**
 * Settings Manager Class
 * 
 * Manages application settings with secure storage and encryption.
 * Handles API credentials, user preferences, and configuration data
 * with automatic encryption for sensitive information.
 * 
 * @param {Object} logger - Logger instance for debugging
 */
class SettingsManager {
    constructor(logger) {
        // Initialize settings with default values
        this.settings = this.getDefaultSettings();
        this.storageKey = 'pingone-import-settings';
        this.crypto = new CryptoUtils();
        this.encryptionKey = null;
        
        // Initialize logger for debugging and error reporting
        this.initializeLogger(logger);
        
        // Encryption will be initialized in the init method
        this.encryptionInitialized = false;
    }
    
    /**
     * Initialize the settings manager
     */
    async init() {
        try {
            await this.initializeEncryption();
            this.encryptionInitialized = true;
            this.logger.info('Settings manager initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize settings manager:', error);
            // Continue without encryption if it fails
            this.encryptionInitialized = false;
        }
    }
    
    /**
     * Initialize the logger
     * @param {Object} logger - Optional logger instance
     */
    initializeLogger(logger) {
        if (logger && typeof logger === 'object') {
            this.logger = logger;
        } else {
            // Create a minimal safe console logger
            const safeLog = (level, message, ...args) => {
                const logFn = console[level] || console.log;
                try {
                    if (typeof message === 'string') {
                        logFn(`[${level.toUpperCase()}] ${message}`, ...args);
                    } else {
                        logFn(message, ...args);
                    }
                } catch (e) {
                    console.error('Logger error:', e);
                }
            };
            
            this.logger = {
                debug: (msg, ...args) => safeLog('debug', msg, ...args),
                log: (msg, ...args) => safeLog('log', msg, ...args),
                info: (msg, ...args) => safeLog('info', msg, ...args),
                warn: (msg, ...args) => safeLog('warn', msg, ...args),
                error: (msg, ...args) => safeLog('error', msg, ...args)
            };
        }
    }
    
    /**
     * Initialize encryption with a key derived from browser and user-specific data
     */
    async initializeEncryption() {
        try {
            const deviceId = await this.getDeviceId();
            // Use the static method from CryptoUtils
            this.encryptionKey = await CryptoUtils.generateKey(deviceId);
        } catch (error) {
            this.logger.error('Failed to initialize encryption:', error);
            // Fallback to a less secure but functional approach
            this.encryptionKey = await CryptoUtils.generateKey('fallback-encryption-key');
        }
    }
    
    /**
     * Generate a device ID based on browser and system information
     * @returns {Promise<string>} A unique device ID
     */
    async getDeviceId() {
        try {
            // Try to get a stored device ID first
            if (this.isLocalStorageAvailable()) {
                const storedDeviceId = localStorage.getItem('pingone-device-id');
                if (storedDeviceId) {
                    return storedDeviceId;
                }
            }
            
            // Generate a new device ID based on stable browser characteristics
            const navigatorInfo = {
                platform: navigator.platform,
                hardwareConcurrency: navigator.hardwareConcurrency,
                deviceMemory: navigator.deviceMemory,
                maxTouchPoints: navigator.maxTouchPoints,
                language: navigator.language,
                languages: navigator.languages ? navigator.languages.slice(0, 3).join(',') : '',
                userAgent: navigator.userAgent ? navigator.userAgent.substring(0, 100) : ''
            };
            
            // Create a hash of the navigator info
            const encoder = new TextEncoder();
            const data = encoder.encode(JSON.stringify(navigatorInfo));
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const deviceId = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            
            // Store the device ID for future use
            if (this.isLocalStorageAvailable()) {
                localStorage.setItem('pingone-device-id', deviceId);
            }
            
            return deviceId;
        } catch (error) {
            this.logger.error('Failed to generate device ID:', error);
            // Fallback to a random string if crypto API fails
            return 'fallback-' + Math.random().toString(36).substring(2, 15);
        }
    }

    /**
     * Get required settings fields
     * @returns {Array<string>} Array of required setting keys
     */
    getRequiredSettings() {
        return ['apiClientId', 'apiSecret', 'environmentId'];
    }

    /**
     * Get default settings
     * @returns {Object} Default settings object
     */
    getDefaultSettings() {
        return {
            // Connection settings
            apiClientId: '',
            apiSecret: '',
            environmentId: '',
            populationId: 'not set',
            region: 'NorthAmerica',
            
            // Rate limiting
            rateLimit: 90,
            
            // Connection status
            connectionStatus: 'disconnected',
            connectionMessage: 'Not connected',
            lastConnectionTest: null,
            
            // UI settings
            autoSave: true,
            lastUsedDirectory: '',
            theme: 'light',
            pageSize: 50,
            showNotifications: true
        };
    }
    
    /**
     * Check if all required settings are filled
     * @param {Object} [settings] - Optional settings to validate (uses current settings if not provided)
     * @returns {{isValid: boolean, missingFields: Array<string>}} Validation result
     */
    validateSettings(settings = null) {
        const settingsToValidate = settings || this.settings;
        const requiredFields = this.getRequiredSettings();
        const missingFields = [];
        
        requiredFields.forEach(field => {
            if (!settingsToValidate[field] || String(settingsToValidate[field]).trim() === '') {
                missingFields.push(field);
            }
        });
        
        return {
            isValid: missingFields.length === 0,
            missingFields
        };
    }

    /**
     * Check if localStorage is available
     * @returns {boolean} True if localStorage is available
     */
    isLocalStorageAvailable() {
        try {
            const testKey = '__test__';
            localStorage.setItem(testKey, testKey);
            localStorage.removeItem(testKey);
            return true;
        } catch (e) {
            this.logger.error('localStorage is not available', 'error');
            return false;
        }
    }

    /**
     * Load settings from server with localStorage fallback
     * @returns {Promise<Object>} Loaded settings
     */
    async loadSettings() {
        try {
            // Try to load from server first
            try {
                const response = await fetch('/api/settings');
                
                if (response.ok) {
                    let serverSettings = await response.json();
                    // Handle stringified JSON in data
                    if (typeof serverSettings === 'string') {
                        try {
                            serverSettings = JSON.parse(serverSettings);
                        } catch (e) {}
                    }
                    // Accept both {success, data} and {success, fileSettings}
                    let parsedSettings = null;
                    if (serverSettings.success && serverSettings.data) {
                        parsedSettings = serverSettings.data;
                    } else if (serverSettings.success && serverSettings.fileSettings) {
                        parsedSettings = serverSettings.fileSettings;
                    } else if (serverSettings.environmentId || serverSettings.apiClientId) {
                        parsedSettings = serverSettings;
                    }
                    if (parsedSettings) {
                        // Decrypt sensitive fields if they exist
                        if (parsedSettings.apiSecret) {
                            try {
                                parsedSettings.apiSecret = await this.decryptIfNeeded(parsedSettings.apiSecret);
                            } catch (error) {
                                this.logger.warn('Failed to decrypt API secret - device ID may have changed');
                                parsedSettings.apiSecret = '';
                            }
                        }
                        // Deep merge with defaults
                        this.settings = this.deepMerge(this.getDefaultSettings(), parsedSettings);
                        // Save to localStorage as cache
                        if (this.isLocalStorageAvailable()) {
                            localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
                        }
                        this.logger.log('Settings loaded from server', 'success');
                        return this.settings;
                    }
                }
                // If we get here, server load failed or returned invalid data
                throw new Error('Invalid server response');
            } catch (serverError) {
                this.logger.warn('Failed to load settings from server, falling back to localStorage', serverError);
                
                // Fall back to localStorage if available
                if (this.isLocalStorageAvailable()) {
                    const savedSettings = localStorage.getItem(this.storageKey);
                    
                    if (savedSettings) {
                        const parsedSettings = JSON.parse(savedSettings);
                        
                        // Decrypt sensitive fields
                        if (parsedSettings.apiSecret) {
                            try {
                                parsedSettings.apiSecret = await this.decryptIfNeeded(parsedSettings.apiSecret);
                            } catch (error) {
                                this.logger.warn('Failed to decrypt API secret from localStorage - device ID may have changed');
                                parsedSettings.apiSecret = '';
                            }
                        }
                        
                        // Deep merge with defaults
                        this.settings = this.deepMerge(this.getDefaultSettings(), parsedSettings);
                        this.logger.log('Settings loaded from localStorage (fallback)', 'warning');
                        
                        // Try to save to server for next time
                        this.saveSettings(this.settings, false).catch(e => 
                            this.logger.warn('Failed to sync settings to server', e)
                        );
                        
                        return this.settings;
                    }
                }
                
                // If we get here, both server and localStorage failed or are empty
                this.settings = this.getDefaultSettings();
                this.logger.log('No saved settings found, using defaults', 'info');
                return this.settings;
            }
            
        } catch (error) {
            this.logger.error('Error loading settings:', error);
            return this.getDefaultSettings();
        }
    }
    
    /**
     * Save settings to localStorage and server
     * @param {Object} newSettings - Settings to save
     * @param {boolean} [validate=true] - Whether to validate settings before saving
     * @returns {Promise<boolean>} True if settings were saved successfully
     */
    async saveSettings(newSettings, validate = true) {
        try {
            // Create a deep copy of current settings
            const updatedSettings = this.deepMerge({}, this.settings);
            
            // Preserve connection status fields
            const connectionFields = ['connectionStatus', 'connectionMessage', 'lastConnectionTest'];
            const preservedConnectionFields = {};
            
            // Extract connection fields from new settings
            connectionFields.forEach(field => {
                if (newSettings[field] !== undefined) {
                    preservedConnectionFields[field] = newSettings[field];
                }
            });
            
            // Update with new settings
            Object.assign(updatedSettings, newSettings);
            
            // Restore preserved connection fields
            Object.assign(updatedSettings, preservedConnectionFields);
            
            // Validate settings if needed
            if (validate) {
                const validation = this.validateSettings(updatedSettings);
                if (!validation.isValid) {
                    this.logger.warn(`Cannot save settings: Missing required fields - ${validation.missingFields.join(', ')}`);
                    return false;
                }
            }
            
            // Create a copy of settings for saving (without connection fields)
            const settingsToSave = { ...updatedSettings };
            
            // Only send apiSecret if a new value is provided (not blank or ********)
            if (newSettings.apiSecret === '' || newSettings.apiSecret === '********') {
                delete newSettings.apiSecret;
            }
            
            // Only encrypt API secret if it's not already encrypted and not empty
            if (settingsToSave.apiSecret && !settingsToSave.apiSecret.startsWith('enc:')) {
                try {
                    settingsToSave.apiSecret = await this.encrypt(settingsToSave.apiSecret);
                } catch (error) {
                    this.logger.error('Failed to encrypt API secret', error);
                    throw new Error('Failed to secure API secret');
                }
            }
            
            // Save to server first
            try {
                const response = await fetch('/api/settings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(settingsToSave)
                });
                
                if (!response.ok) {
                    const error = await response.text();
                    throw new Error(`Server responded with status ${response.status}: ${error}`);
                }
                
                // Update in-memory settings
                this.settings = updatedSettings;
                
                // Also save to localStorage as a backup
                if (this.isLocalStorageAvailable()) {
                    localStorage.setItem(this.storageKey, JSON.stringify(settingsToSave));
                }
                
                this.logger.log('Settings saved successfully', 'success');
                return true;
                
            } catch (error) {
                this.logger.error('Failed to save settings to server, falling back to localStorage', error);
                
                // Fall back to localStorage if server save fails
                if (this.isLocalStorageAvailable()) {
                    try {
                        localStorage.setItem(this.storageKey, JSON.stringify(settingsToSave));
                        this.settings = updatedSettings;
                        this.logger.log('Settings saved to localStorage (fallback)', 'warning');
                        return true;
                    } catch (localError) {
                        this.logger.error('Failed to save settings to localStorage', localError);
                        throw new Error('Failed to save settings to any storage');
                    }
                }
                
                return false;
            }
        } catch (error) {
            this.logger.error('Error in saveSettings:', error);
            throw error;
        }
    }
    
    /**
     * Encrypt a string value
     * @param {string} value - The value to encrypt
     * @returns {Promise<string>} Encrypted value with 'enc:' prefix
     */
    async encrypt(value) {
        if (!value || typeof value !== 'string') return value;
        if (value.startsWith('enc:')) return value; // Already encrypted
        
        try {
            if (!this.encryptionKey) {
                await this.initializeEncryption();
            }
            
            const encrypted = await CryptoUtils.encrypt(value, this.encryptionKey);
            return `enc:${encrypted}`;
        } catch (error) {
            this.logger.error('Encryption failed:', error);
            throw new Error('Failed to encrypt sensitive data');
        }
    }
    
    /**
     * Decrypt a value if it's encrypted
     * @param {string} value - Value to decrypt
     * @returns {Promise<string>} Decrypted value
     */
    async decryptIfNeeded(value) {
        if (!value || typeof value !== 'string') return value;
        if (!value.startsWith('enc:')) return value; // Not encrypted
        
        try {
            if (!this.encryptionKey) {
                await this.initializeEncryption();
            }
            
            const encryptedValue = value.substring(4); // Remove 'enc:' prefix
            return await CryptoUtils.decrypt(encryptedValue, this.encryptionKey);
        } catch (error) {
            // Log the error but don't show it to the user unless it's a critical failure
            if (error.name === 'OperationError') {
                this.logger.warn('Decryption failed due to key mismatch - this is normal when device ID changes');
                // Clear the encrypted value from localStorage to prevent future decryption attempts
                if (this.isLocalStorageAvailable()) {
                    const savedSettings = localStorage.getItem(this.storageKey);
                    if (savedSettings) {
                        try {
                            const parsedSettings = JSON.parse(savedSettings);
                            if (parsedSettings.apiSecret && parsedSettings.apiSecret.startsWith('enc:')) {
                                delete parsedSettings.apiSecret;
                                localStorage.setItem(this.storageKey, JSON.stringify(parsedSettings));
                                this.logger.info('Cleared encrypted API secret from localStorage');
                            }
                        } catch (e) {
                            this.logger.warn('Failed to clear encrypted data from localStorage');
                        }
                    }
                }
            } else {
                this.logger.error('Decryption failed:', error);
            }
            // Return empty string instead of throwing error to prevent app from crashing
            return '';
        }
    }
    
    /**
     * Deep merge objects
     * @param {Object} target - Target object
     * @param {Object} source - Source object
     * @returns {Object} Merged object
     */
    deepMerge(target, source) {
        const output = { ...target };
        
        if (this.isObject(target) && this.isObject(source)) {
            Object.keys(source).forEach(key => {
                if (this.isObject(source[key])) {
                    if (!(key in target)) {
                        Object.assign(output, { [key]: source[key] });
                    } else {
                        output[key] = this.deepMerge(target[key], source[key]);
                    }
                } else {
                    Object.assign(output, { [key]: source[key] });
                }
            });
        }
        
        return output;
    }
    
    /**
     * Check if a value is an object
     * @param {*} item - Value to check
     * @returns {boolean} True if the value is an object
     */
    isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    }
    
    /**
     * Update settings in memory
     * @param {Object} newSettings - New settings to update
     * @returns {Object} The updated settings
     */
    updateSettings(newSettings) {
        try {
            if (!newSettings || typeof newSettings !== 'object') {
                throw new Error('Invalid settings object');
            }
            
            // Merge new settings with existing ones
            this.settings = {
                ...this.settings,
                ...newSettings
            };
            
            this.logger.info('Settings updated in memory');
            return this.settings;
        } catch (error) {
            this.logger.error(`Error updating settings: ${error.message}`);
            throw error;
        }
    }
    

    
    /**
     * Clear all settings and reset to defaults
     * @returns {Promise<boolean>} True if settings were cleared successfully
     */
    async clearSettings() {
        try {
            if (this.isLocalStorageAvailable()) {
                localStorage.removeItem(this.storageKey);
            }
            
            this.settings = this.getDefaultSettings();
            this.logger.log('Settings cleared successfully', 'success');
            return true;
        } catch (error) {
            this.logger.error(`Error clearing settings: ${error.message}`, 'error');
            return false;
        }
    }
    
    /**
     * Get all settings
     * @returns {Object} Current settings object
     */
    getSettings() {
        return { ...this.settings }; // Return a shallow copy to prevent direct modification
    }

    /**
     * Get a setting value
     * @param {string} key - Setting key
     * @param {*} defaultValue - Default value if setting doesn't exist
     * @returns {*} Setting value or default value
     */
    getSetting(key, defaultValue = null) {
        return this.settings.hasOwnProperty(key) ? this.settings[key] : defaultValue;
    }
    
    /**
     * Update a setting
     * @param {string} key - Setting key
     * @param {*} value - New value
     * @returns {Promise<boolean>} True if setting was updated successfully
     */
    async updateSetting(key, value) {
        return this.saveSettings({ [key]: value });
    }
}

// Export the class and a singleton instance
export { SettingsManager };
export const settingsManager = new SettingsManager();
