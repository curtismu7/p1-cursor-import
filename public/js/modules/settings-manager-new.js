const { CryptoUtils } = require('./crypto-utils');

class SettingsManager {
    constructor(logger) {
        // Initialize settings and storage key
        this.settings = this.getDefaultSettings();
        this.storageKey = 'pingone-import-settings';
        this.encryptionKey = null;
        this.logger = logger || this.createDefaultLogger();
        
        // Initialize encryption
        this.initializeEncryption();
    }

    /**
     * Create a default console logger if none provided
     */
    createDefaultLogger() {
        return {
            log: (msg, level = 'info') => console[level](`[Settings] ${msg}`),
            info: (msg) => this.log(msg, 'info'),
            warn: (msg) => this.log(msg, 'warn'),
            error: (msg) => this.log(msg, 'error'),
            debug: (msg) => this.log(msg, 'debug')
        };
    }

    /**
     * Initialize encryption with a key derived from browser and user-specific data
     */
    async initializeEncryption() {
        try {
            const deviceId = await this.getDeviceId();
            this.encryptionKey = await CryptoUtils.generateKey(deviceId);
        } catch (error) {
            this.logger.error('Failed to initialize encryption, using fallback key');
            this.encryptionKey = await CryptoUtils.generateKey('fallback-encryption-key');
        }
    }

    /**
     * Generate a device ID based on browser and system information
     */
    async getDeviceId() {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(JSON.stringify({
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                language: navigator.language,
                hardwareConcurrency: navigator.hardwareConcurrency,
                deviceMemory: navigator.deviceMemory
            }));
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            return Array.from(new Uint8Array(hashBuffer))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
        } catch (error) {
            this.logger.error('Failed to generate device ID, using fallback');
            return 'fallback-device-id';
        }
    }

    /**
     * Get required settings fields
     */
    getRequiredSettings() {
        return ['apiClientId', 'apiSecret', 'environmentId'];
    }

    /**
     * Get default settings
     */
    getDefaultSettings() {
        return {
            apiClientId: '',
            apiSecret: '',
            environmentId: '',
            populationId: '',
            region: 'NorthAmerica',
            connectionStatus: 'disconnected',
            connectionMessage: 'Not connected',
            lastConnectionTest: null,
            autoSave: true,
            lastUsedDirectory: '',
            theme: 'light',
            pageSize: 50,
            showNotifications: true
        };
    }

    /**
     * Check if all required settings are filled
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
     */
    isLocalStorageAvailable() {
        try {
            const testKey = '__test__';
            localStorage.setItem(testKey, testKey);
            localStorage.removeItem(testKey);
            return true;
        } catch (e) {
            this.logger.warn('localStorage is not available');
            return false;
        }
    }

    /**
     * Load settings from server with localStorage fallback
     */
    async loadSettings() {
        try {
            // Try to load from server first
            try {
                const response = await fetch('/api/settings');
                
                if (response.ok) {
                    const result = await response.json();
                    
                    if (result.success && result.data) {
                        const serverSettings = result.data;
                        
                        // Decrypt sensitive fields if they exist
                        if (serverSettings.apiSecret) {
                            try {
                                serverSettings.apiSecret = await this.decryptIfNeeded(serverSettings.apiSecret);
                            } catch (error) {
                                this.logger.error('Failed to decrypt API secret from server');
                                serverSettings.apiSecret = '';
                            }
                        }
                        
                        // Update settings
                        this.settings = { ...this.getDefaultSettings(), ...serverSettings };
                        
                        // Save to localStorage as cache
                        if (this.isLocalStorageAvailable()) {
                            localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
                        }
                        
                        this.logger.info('Settings loaded from server');
                        return this.settings;
                    }
                }
                
                throw new Error('Invalid server response');
                
            } catch (serverError) {
                this.logger.warn('Failed to load from server, trying localStorage', serverError);
                
                // Fall back to localStorage
                if (this.isLocalStorageAvailable()) {
                    const savedSettings = localStorage.getItem(this.storageKey);
                    
                    if (savedSettings) {
                        const parsedSettings = JSON.parse(savedSettings);
                        
                        // Decrypt sensitive fields
                        if (parsedSettings.apiSecret) {
                            try {
                                parsedSettings.apiSecret = await this.decryptIfNeeded(parsedSettings.apiSecret);
                            } catch (error) {
                                this.logger.error('Failed to decrypt API secret from localStorage');
                                parsedSettings.apiSecret = '';
                            }
                        }
                        
                        // Update settings
                        this.settings = { ...this.getDefaultSettings(), ...parsedSettings };
                        
                        // Try to save to server for next time
                        this.saveSettings(this.settings, false).catch(e => 
                            this.logger.warn('Failed to sync settings to server', e)
                        );
                        
                        this.logger.info('Settings loaded from localStorage');
                        return this.settings;
                    }
                }
                
                // If we get here, both server and localStorage failed or are empty
                this.settings = this.getDefaultSettings();
                this.logger.info('No saved settings found, using defaults');
                return this.settings;
            }
            
        } catch (error) {
            this.logger.error('Error loading settings:', error);
            this.settings = this.getDefaultSettings();
            return this.settings;
        }
    }
    
    /**
     * Save settings to server with localStorage fallback
     */
    async saveSettings(newSettings, validate = true) {
        try {
            // Create a deep copy of current settings
            const updatedSettings = { ...this.settings, ...newSettings };
            
            // Validate if needed
            if (validate) {
                const validation = this.validateSettings(updatedSettings);
                if (!validation.isValid) {
                    this.logger.warn(`Cannot save settings: Missing required fields - ${validation.missingFields.join(', ')}`);
                    return false;
                }
            }
            
            // Create a copy for saving (without connection status)
            const { connectionStatus, connectionMessage, lastConnectionTest, ...settingsToSave } = updatedSettings;
            
            // Only encrypt API secret if it's not already encrypted and not empty
            if (settingsToSave.apiSecret && !settingsToSave.apiSecret.startsWith('enc:')) {
                try {
                    settingsToSave.apiSecret = await this.encrypt(settingsToSave.apiSecret);
                } catch (error) {
                    this.logger.error('Failed to encrypt API secret');
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
                    throw new Error(`Server error: ${error}`);
                }
                
                // Update in-memory settings
                this.settings = updatedSettings;
                
                // Also save to localStorage as a backup
                if (this.isLocalStorageAvailable()) {
                    localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
                }
                
                this.logger.info('Settings saved successfully');
                return true;
                
            } catch (serverError) {
                this.logger.error('Failed to save to server, falling back to localStorage', serverError);
                
                // Fall back to localStorage if server save fails
                if (this.isLocalStorageAvailable()) {
                    try {
                        localStorage.setItem(this.storageKey, JSON.stringify(updatedSettings));
                        this.settings = updatedSettings;
                        this.logger.warn('Settings saved to localStorage (fallback)');
                        return true;
                    } catch (localError) {
                        this.logger.error('Failed to save to localStorage', localError);
                        throw new Error('Failed to save settings to any storage');
                    }
                }
                
                throw new Error('Failed to save settings to any storage');
            }
            
        } catch (error) {
            this.logger.error('Error saving settings:', error);
            throw error;
        }
    }
    
    /**
     * Encrypt a value if encryption is available
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
            this.logger.error('Decryption failed:', error);
            throw new Error('Failed to decrypt sensitive data');
        }
    }
    
    /**
     * Get a setting value
     */
    getSetting(key, defaultValue = null) {
        return this.settings[key] !== undefined ? this.settings[key] : defaultValue;
    }
    
    /**
     * Update a single setting
     */
    async updateSetting(key, value) {
        return this.saveSettings({ [key]: value });
    }
    
    /**
     * Clear all settings and reset to defaults
     */
    async clearSettings() {
        this.settings = this.getDefaultSettings();
        
        // Clear from server
        try {
            await fetch('/api/settings', { method: 'DELETE' });
        } catch (error) {
            this.logger.warn('Failed to clear settings from server:', error);
        }
        
        // Clear from localStorage
        if (this.isLocalStorageAvailable()) {
            localStorage.removeItem(this.storageKey);
        }
        
        return true;
    }
}

// Export a singleton instance
const settingsManager = new SettingsManager();

module.exports = {
    SettingsManager,
    settingsManager
};
