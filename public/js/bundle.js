(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
// Main application entry point
const { Logger } = require('./modules/logger.js');
const { UIManager } = require('./modules/ui-manager.js');
const { FileHandler } = require('./modules/file-handler.js');
const { SettingsManager } = require('./modules/settings-manager.js');
const { PingOneAPI } = require('./modules/pingone-api.js');
const VersionManager = require('./modules/version-manager.js');

class App {
    constructor() {
        // Initialize logger with the log container
        const logContainer = document.getElementById('logs-container');
        this.logger = new Logger(logContainer);
        
        // Initialize settings manager first as it's used by other components
        this.settingsManager = new SettingsManager(this.logger);
        
        // Initialize other components
        this.uiManager = new UIManager(this.logger);
        this.fileHandler = new FileHandler(this.logger, this.uiManager);
        this.pingOneAPI = new PingOneAPI(this.logger, this.settingsManager);
        
        // Initialize version manager and update UI
        this.versionManager = new VersionManager();
        this.versionManager.updateTitle();
        
        // Track import state
        this.isImporting = false;
        this.currentImportAbortController = null;
        
        // Bind methods
        this.handleFileSelect = this.handleFileSelect.bind(this);
        this.handleSaveSettings = this.handleSaveSettings.bind(this);
        this.testPingOneConnection = this.testPingOneConnection.bind(this);
        this.cancelImport = this.cancelImport.bind(this);
        
        // Initialize the application
        this.init();
    }

    async init() {
        try {
            // Add initial test logs
            this.logger.log('Application starting...', 'info');
            this.logger.log('Logger initialized', 'debug');
            this.logger.log('Initializing UI components', 'info');
            
            // Listen for file selection events
            window.addEventListener('fileSelected', (event) => {
                this.logger.debug('File selected event received');
                const { file } = event.detail;
                this.handleFileSelect(file);
            });
            
            // Always show import view by default
            this.uiManager.switchView('import');
            
            // Initialize UI
            this.uiManager.init({
                onFileSelect: (file) => this.handleFileSelect(file),
                onSaveSettings: (settings) => this.handleSaveSettings(settings),
                onClearLogs: () => this.logger.clearLogs(),
                onTestConnection: () => this.testPingOneConnection(),
                onImport: () => this.startImport(),
                onCancelImport: () => this.cancelImport()
            });
            
            this.logger.log('Loading settings...', 'debug');
            // Load settings
            await this.settingsManager.loadSettings();
            this.logger.log('Settings loaded', 'debug');
            
            // Update UI with loaded settings
            this.uiManager.updateSettingsForm(this.settingsManager.settings);
            
            // Check if we have a saved connection status
            const { connectionStatus, connectionMessage } = this.settingsManager.settings;
            if (connectionStatus && connectionMessage) {
                this.uiManager.updateConnectionStatus(connectionStatus, connectionMessage);
            }
            
            // Check settings and restore file if needed
            await this.checkSettingsAndRestore();
            
            // Always show import view on initial load
            this.uiManager.switchView('import');
            
            this.logger.log('Application initialized', 'success');
        } catch (error) {
            console.error('Error initializing application:', error);
            this.logger.error(`Initialization error: ${error.message}`);
            this.uiManager.showError('Failed to initialize application. Please refresh the page.');
        }
    }
    
    /**
     * Check if required settings are filled and update UI accordingly
     */
    checkSettings() {
        const validation = this.settingsManager.validateSettings();
        
        if (!validation.isValid) {
            const missingFields = validation.missingFields;
            const message = missingFields.length > 0 
                ? `Missing required fields: ${missingFields.join(', ')}`
                : 'Please configure your API settings';
                
            this.uiManager.updateConnectionStatus('disconnected', message);
            this.logger.warn(`Settings validation failed: ${missingFields.join(', ')}`);
            return false;
        }
        
        // If we have all required settings, try to validate them
        this.uiManager.updateConnectionStatus('disconnected', 'Credentials saved but not yet verified');
        return true;
    }

    /**
     * Check settings and restore previous file if available
     */
    async checkSettingsAndRestore() {
        try {
            // Check if we have a valid settings and a previously loaded file
            if (this.fileHandler.lastFileInfo) {
                this.logger.log('Found previously loaded file reference in local storage', 'info');
                
                // Clear the last file info immediately to prevent any auto-processing
                const lastFileName = this.fileHandler.lastFileInfo.name;
                this.fileHandler.clearFileInfo();
                
                // Log the information but don't try to process the file
                this.logger.info('Please re-upload the file to process it', {
                    fileName: lastFileName,
                    note: 'File references from previous sessions require re-upload for security reasons'
                });
                
                // Update the UI to show no file is selected
                this.uiManager.setImportButtonState(false, 'Select File to Import');
                
                // Clear any file input that might have been restored
                if (this.fileHandler.fileInput) {
                    this.fileHandler.fileInput.value = '';
                }
            }
        } catch (error) {
            this.logger.error(`Error restoring previous file: ${error.message}`);
            this.fileHandler.clearFileInfo();
            this.uiManager.setImportButtonState(false, 'Error Restoring File');
        }
    }
    
    /**
     * Handle file selection
     * @param {File} file - The selected file
     */
    async handleFileSelect(file) {
        if (!file) {
            this.logger.error('No file selected');
            this.uiManager.setImportButtonState(false);
            return;
        }
        
        try {
            this.logger.log(`Processing file: ${file.name}`, 'info');
            this.uiManager.setImportButtonState(false);
            
            // Clear any previous data
            this.processedData = null;
            this.currentImportData = null;
            
            // Process the CSV file
            const { headers, rows } = await this.fileHandler.processCSV(file);
            
            // Store the processed data for display
            this.processedData = { headers, rows };
            // Store the data needed for import
            this.currentImportData = { 
                headers, 
                rows,
                fileName: file.name 
            };
            
            // Enable import button if we have valid data
            if (rows.length > 0) {
                this.uiManager.setImportButtonState(true, 'Start Import');
                
                // Show preview of first few rows
                const previewCount = Math.min(3, rows.length);
                this.logger.log(`Found ${rows.length} valid users in ${file.name}:`, 'success');
                
                for (let i = 0; i < previewCount; i++) {
                    const user = rows[i];
                    const name = [user.name?.given, user.name?.family].filter(Boolean).join(' ') || 'No name';
                    this.logger.log(`  • ${user.email} (${name})`, 'info');
                }
                
                if (rows.length > previewCount) {
                    this.logger.log(`  ... and ${rows.length - previewCount} more`, 'info');
                }
                
                // Show success message
                this.uiManager.showSuccess(`Successfully loaded ${rows.length} users from ${file.name}`);
            } else {
                this.logger.warn('No valid user data found in the file');
                this.fileHandler.clearFileInfo();
                this.uiManager.showWarning('No valid user records found in the file');
            }
        } catch (error) {
            const errorMsg = `Error processing file: ${error.message}`;
            this.logger.error(errorMsg);
            this.uiManager.showError(errorMsg);
            this.uiManager.setImportButtonState(false);
            this.fileHandler.clearFileInfo();
            this.currentImportData = null;
        }
    }

    async handleSaveSettings(settings) {
        try {
            const settingsToSave = {
                apiClientId: (settings.apiClientId || '').trim(),
                apiSecret: (settings.apiSecret || '').trim(),
                environmentId: (settings.environmentId || '').trim(),
                populationId: (settings.populationId || '').trim(),
                region: (settings.region || 'NorthAmerica').trim()
            };

            // Save the settings - this will encrypt the API secret
            const saveResult = await this.settingsManager.saveSettings(settingsToSave);
            
            if (!saveResult) {
                // Save failed (likely due to validation)
                return false;
            }

            // Update the PingOne API with new settings
            this.pingOneAPI.updateSettings(this.settingsManager.settings);
            
            // Check if we have all required settings
            const validation = this.settingsManager.validateSettings();
            
            if (validation.isValid) {
                // Test the connection with the new settings
                const connectionTest = await this.testPingOneConnection();
                
                if (connectionTest.success) {
                    this.logger.log('Settings saved and connection verified', 'success');
                    this.uiManager.showNotification('Settings saved and connection verified', 'success');
                    return true;
                } else {
                    this.logger.warn('Settings saved but connection test failed', 'warn');
                    this.uiManager.showError('Settings saved but connection test failed');
                    return false;
                }
            } else {
                const missingFields = validation.missingFields;
                const message = missingFields.length > 0 
                    ? `Missing required fields: ${missingFields.join(', ')}`
                    : 'Please configure your API settings';
                    
                this.uiManager.updateConnectionStatus('disconnected', message);
                this.logger.warn(`Settings validation failed: ${missingFields.join(', ')}`);
                return false;
            }
        } catch (error) {
            const errorMessage = `Failed to save settings: ${error.message}`;
            this.logger.error(errorMessage, 'error');
            this.uiManager.showError(errorMessage);
            
            // Save error status
            try {
                await this.settingsManager.saveSettings({
                    connectionStatus: 'error',
                    connectionMessage: errorMessage,
                    lastConnectionTest: new Date().toISOString()
                });
            } catch (saveError) {
                this.logger.error(`Failed to save error status: ${saveError.message}`, 'error');
            }
            
            return false;
        }
    }

    /**
     * Test the PingOne API connection with the provided credentials
     * @returns {Promise<{success: boolean, message?: string}>} Result of the connection test
     */
    async testPingOneConnection() {
        try {
            // Update UI to show testing state
            this.uiManager.updateConnectionStatus('testing');
            
            // Get the current settings from the settings manager
            const settings = this.settingsManager.settings;
            
            // Verify we have all required fields
            const requiredFields = ['apiClientId', 'apiSecret', 'environmentId'];
            const missingFields = requiredFields.filter(field => !settings[field] || settings[field].trim() === '');
            
            if (missingFields.length > 0) {
                const errorMsg = `Missing required fields: ${missingFields.join(', ')}`;
                this.logger.error(errorMsg);
                this.uiManager.updateConnectionStatus('error', errorMsg);
                
                // Save connection status as error
                await this.settingsManager.saveSettings({
                    connectionStatus: 'error',
                    connectionMessage: errorMsg,
                    lastConnectionTest: new Date().toISOString()
                });
                
                return { success: false, message: errorMsg };
            }
            
            // Test the connection by getting an access token
            const token = await this.pingOneAPI.getAccessToken();
            
            // If we get here, the connection was successful
            const successMessage = 'Successfully connected to PingOne API';
            this.logger.log(successMessage, 'success');
            this.uiManager.updateConnectionStatus('connected', successMessage);
            this.uiManager.showNotification('✅ ' + successMessage, 'success');
            
            // Save successful connection status
            await this.settingsManager.saveSettings({
                connectionStatus: 'connected',
                connectionMessage: successMessage,
                lastConnectionTest: new Date().toISOString()
            });
            
            return { success: true, message: successMessage };
            
        } catch (error) {
            const errorMessage = `Error testing connection: ${error.message}`;
            this.logger.error(errorMessage, 'error');
            this.uiManager.updateConnectionStatus('error', errorMessage);
            
            // Save error status
            await this.settingsManager.saveSettings({
                connectionStatus: 'error',
                connectionMessage: errorMessage,
                lastConnectionTest: new Date().toISOString()
            });
            
            return { success: false, message: errorMessage };
        }
    }

    /**
     * Start the import process
     */
    // Cancel the current import operation
    cancelImport() {
        if (this.isImporting && this.currentImportAbortController) {
            this.currentImportAbortController.abort();
            this.logger.log('Import cancelled by user', 'warning');
            this.uiManager.showNotification('Import cancelled', 'warning');
            this.uiManager.resetImportState();
            this.isImporting = false;
            this.currentImportAbortController = null;
        }
    }

    async startImport() {
        if (!this.currentImportData) {
            this.logger.error('No import data available. Please select a file first.', 'error');
            return;
        }

        const { headers, rows, fileName } = this.currentImportData;
        const totalUsers = rows.length;
        let successfulImports = 0;
        let failedImports = 0;
        let skippedUsers = 0;
        
        // Create a new AbortController for this import
        this.currentImportAbortController = new AbortController();
        this.isImporting = true;
        
        try {
            this.logger.log(`Starting import of ${totalUsers} users from ${fileName}...`, 'info');
            
            // Show progress UI
            this.uiManager.showImportStatus(totalUsers);
            this.uiManager.updateImportProgress(0, totalUsers, 'Starting import...');
            
            // Check if we have valid settings
            if (!this.settingsManager.settings.environmentId || 
                !this.settingsManager.settings.apiClientId || 
                !this.settingsManager.settings.apiSecret) {
                throw new Error('PingOne API credentials are not configured. Please check your settings.');
            }
            
            // Process users in batches to improve performance
            const batchSize = 10; // Process 10 users at a time
            
            for (let i = 0; i < rows.length; i += batchSize) {
                if (this.currentImportAbortController.signal.aborted) {
                    this.logger.log('Import cancelled by user', 'warning');
                    break;
                }
                
                const batch = rows.slice(i, i + batchSize);
                const batchStartIndex = i + 1;
                const batchEndIndex = Math.min(i + batchSize, rows.length);
                
                try {
                    // Check for existing users in the current batch
                    const usersToImport = [];
                    const existingUsers = [];
                    
                    // Check each user in the batch
                    for (const user of batch) {
                        const userEmail = user.email;
                        const currentIndex = batchStartIndex + batch.indexOf(user);
                        
                        try {
                            const userExists = await this.pingOneAPI.userExists(userEmail);
                            if (userExists) {
                                existingUsers.push(userEmail);
                                skippedUsers++;
                                this.logger.log(`Skipping existing user: ${userEmail} (${currentIndex}/${totalUsers})`, 'info');
                            } else {
                                usersToImport.push(user);
                            }
                            
                            // Update progress for each user check
                            const currentProcessed = batchStartIndex + batch.indexOf(user);
                            this.uiManager.updateImportProgress(
                                currentProcessed,
                                totalUsers,
                                `Processing user ${currentProcessed} of ${totalUsers}`,
                                {
                                    success: successfulImports,
                                    failed: failedImports,
                                    skipped: skippedUsers
                                }
                            );
                            
                        } catch (error) {
                            failedImports++;
                            this.logger.error(`Error checking existing user ${userEmail}: ${error.message}`);
                        }
                        
                        // Small delay between user checks to avoid rate limiting
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    
                    // If we have users to import in this batch, process them
                    if (usersToImport.length > 0) {
                        this.logger.log(`Importing batch of ${usersToImport.length} users (${batchStartIndex}-${batchStartIndex + usersToImport.length - 1}/${totalUsers})`, 'info');
                        
                        // Update progress for the batch
                        this.uiManager.updateImportProgress(
                            batchStartIndex + usersToImport.length - 1,
                            totalUsers,
                            `Importing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(rows.length/batchSize)}`,
                            {
                                success: successfulImports,
                                failed: failedImports,
                                skipped: skippedUsers
                            }
                        );
                        
                        try {
                            // Import the batch of users
                            await this.pingOneAPI.importUsers(usersToImport, {
                                signal: this.currentImportAbortController.signal,
                                skipExisting: true
                            });
                            
                            // Update successful imports count
                            successfulImports += usersToImport.length;
                            this.logger.log(`Successfully imported ${usersToImport.length} users in batch ${Math.floor(i/batchSize) + 1}`, 'success');
                            
                        } catch (error) {
                            // If batch import fails, try importing users one by one
                            this.logger.warn(`Batch import failed, falling back to individual imports: ${error.message}`);
                            
                            for (const user of usersToImport) {
                                if (this.currentImportAbortController.signal.aborted) {
                                    throw new Error('Import cancelled by user');
                                }
                                
                                try {
                                    await this.pingOneAPI.importUsers([user], {
                                        signal: this.currentImportAbortController.signal,
                                        skipExisting: true
                                    });
                                    successfulImports++;
                                    this.logger.log(`Imported user: ${user.email}`, 'success');
                                } catch (singleError) {
                                    failedImports++;
                                    this.logger.error(`Error importing user ${user.email}: ${singleError.message}`);
                                }
                                
                                // Small delay between individual imports
                                await new Promise(resolve => setTimeout(resolve, 200));
                            }
                        }
                    }
                    
                    // Small delay between batches
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                } catch (error) {
                    failedImports += batch.length;
                    this.logger.error(`Error processing batch ${Math.floor(i/batchSize) + 1}: ${error.message}`);
                    
                    // Continue with next batch even if one fails
                    if (error.message !== 'Import cancelled by user') {
                        continue;
                    } else {
                        break;
                    }
                }
            }
            
            // Show final status
            let statusMessage = `Import completed: ${successfulImports} succeeded, ${failedImports} failed`;
            if (skippedUsers > 0) {
                statusMessage += `, ${skippedUsers} skipped (already exist)`;
                this.logger.log(`Skipped ${skippedUsers} users that already exist in PingOne`, 'info');
            }
            if (failedImports === 0) {
                this.logger.log(statusMessage, 'success');
                this.uiManager.showSuccess('Import completed successfully!');
            } else if (successfulImports === 0) {
                this.logger.error(statusMessage, 'error');
                this.uiManager.showError('Import failed for all users');
            } else {
                this.logger.warn(statusMessage, 'warning');
                this.uiManager.showWarning('Import completed with some failures');
            }
            
            // Final update with all counts
            this.uiManager.updateImportProgress(
                totalUsers,
                totalUsers,
                statusMessage,
                {
                    success: successfulImports,
                    failed: failedImports,
                    skipped: skippedUsers
                }
            );
            
        } catch (error) {
            const errorMsg = `Import failed: ${error.message}`;
            this.logger.error(errorMsg);
            this.uiManager.showError(errorMsg);
            
            const processedUsers = successfulImports + failedImports + skippedUsers;
            if (processedUsers > 0) {
                this.uiManager.updateImportProgress(
                    processedUsers,
                    totalUsers,
                    `Error: ${error.message}`,
                    {
                        success: successfulImports,
                        failed: failedImports,
                        skipped: skippedUsers
                    }
                );
            }
        } finally {
            // Clean up
            this.isImporting = false;
            this.currentImportAbortController = null;
            this.uiManager.setImportButtonState(true);
            
            // Clear the import data
            this.currentImportData = null;
            this.processedData = null;
        }
    }
}

// Initialize the application when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    console.log(`PingOne Import Tool ${app.versionManager.getFormattedVersion()} initialized`);
});

},{"./modules/file-handler.js":3,"./modules/logger.js":5,"./modules/pingone-api.js":6,"./modules/settings-manager.js":7,"./modules/ui-manager.js":9,"./modules/version-manager.js":10}],2:[function(require,module,exports){
class CryptoUtils {
    /**
     * Generate a cryptographic key for encryption/decryption
     * @param {string} password - The password to derive the key from
     * @returns {Promise<CryptoKey>} A CryptoKey object
     */
    static async generateKey(password) {
        const encoder = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveBits', 'deriveKey']
        );

        return window.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: new TextEncoder().encode('PingOneImportSalt'), // Should be unique per user in production
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Encrypt a string
     * @param {string} text - The text to encrypt
     * @param {CryptoKey} key - The encryption key
     * @returns {Promise<string>} Encrypted text as base64
     */
    static async encrypt(text, key) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        
        // Generate a random IV (Initialization Vector)
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        
        const encrypted = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            data
        );
        
        // Combine IV and encrypted data into a single array
        const result = new Uint8Array(iv.length + encrypted.byteLength);
        result.set(iv, 0);
        result.set(new Uint8Array(encrypted), iv.length);
        
        // Convert to base64 for storage
        return btoa(String.fromCharCode(...result));
    }

    /**
     * Decrypt a string
     * @param {string} encryptedBase64 - The encrypted text in base64 format
     * @param {CryptoKey} key - The decryption key
     * @returns {Promise<string>} Decrypted text
     */
    static async decrypt(encryptedBase64, key) {
        try {
            // Convert from base64 to Uint8Array
            const encryptedData = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
            
            // Extract the IV (first 12 bytes)
            const iv = encryptedData.slice(0, 12);
            const data = encryptedData.slice(12);
            
            const decrypted = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                key,
                data
            );
            
            return new TextDecoder().decode(decrypted);
        } catch (error) {
            console.error('Decryption failed:', error);
            throw new Error('Failed to decrypt data. The encryption key may be incorrect.');
        }
    }
}

// Export the class and a singleton instance
module.exports = { 
    CryptoUtils,
    cryptoUtils: new CryptoUtils() 
};

},{}],3:[function(require,module,exports){
class FileHandler {
    constructor(logger, uiManager) {
        this.logger = logger;
        this.uiManager = uiManager;
        this.requiredFields = ['email'];
        this.validationResults = {
            total: 0,
            valid: 0,
            errors: 0,
            warnings: 0
        };
        
        // Store UI elements
        this.fileInput = document.getElementById('csv-file');
        this.fileInfo = document.getElementById('file-info');
        this.previewContainer = document.getElementById('preview-container');
        
        // Load last file info from localStorage
        this.lastFileInfo = this.loadLastFileInfo();
        
        // Initialize file input change handler
        this.initializeFileInput();
    }
    
    /**
     * Load last file info from localStorage
     * @returns {Object|null} Last file info or null if not found
     */
    loadLastFileInfo() {
        try {
            const savedFile = localStorage.getItem('lastSelectedFile');
            return savedFile ? JSON.parse(savedFile) : null;
        } catch (error) {
            this.logger.error('Error loading last file info:', error);
            return null;
        }
    }
    
    /**
     * Save file info to localStorage
     * @param {Object} fileInfo - File info to save
     */
    saveFileInfo(fileInfo) {
        try {
            const fileData = {
                name: fileInfo.name,
                size: fileInfo.size,
                lastModified: fileInfo.lastModified,
                type: fileInfo.type
            };
            localStorage.setItem('lastSelectedFile', JSON.stringify(fileData));
            this.lastFileInfo = fileData;
        } catch (error) {
            this.logger.error('Error saving file info:', error);
        }
    }
    
    /**
     * Clear saved file info
     */
    clearFileInfo() {
        try {
            localStorage.removeItem('lastSelectedFile');
            this.lastFileInfo = null;
        } catch (error) {
            this.logger.error('Error clearing file info:', error);
        }
    }
    
    /**
     * Generate a secure temporary password
     * @returns {string} A randomly generated password
     */
    generateTemporaryPassword() {
        const length = 16;
        const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]\\:;?><,./-';
        let password = '';
        
        // Ensure at least one of each character type
        password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
        password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
        password += '0123456789'[Math.floor(Math.random() * 10)];
        password += '!@#$%^&*'[Math.floor(Math.random() * 8)];
        
        // Fill the rest of the password
        for (let i = password.length; i < length; i++) {
            password += charset[Math.floor(Math.random() * charset.length)];
        }
        
        // Shuffle the password to make it more random
        return password.split('').sort(() => Math.random() - 0.5).join('');
    }
    
    /**
     * Initialize file input change handler
     */
    initializeFileInput() {
        if (this.fileInput) {
            // Remove any existing event listeners to prevent duplicates
            const newFileInput = this.fileInput.cloneNode(true);
            this.fileInput.parentNode.replaceChild(newFileInput, this.fileInput);
            this.fileInput = newFileInput;
            
            // Add change event listener
            this.fileInput.addEventListener('change', (e) => {
                this.logger.debug('File input changed');
                this.handleFileSelect(e);
            });
            
            this.logger.debug('File input initialized');
        } else {
            this.logger.warn('File input element not found');
        }
    }
    
    /**
     * Handle file selection event
     * @param {Event} event - The file input change event
     */
    handleFileSelect(event) {
        this.logger.debug('Handling file selection');
        
        const fileInput = event.target;
        if (!fileInput.files || fileInput.files.length === 0) {
            this.logger.debug('No file selected');
            this.updateFileInfo(null);
            return;
        }
        
        const file = fileInput.files[0];
        this.logger.debug(`Selected file: ${file.name} (${file.size} bytes)`);
        
        // Save file info and update UI
        this.saveFileInfo(file);
        this.updateFileInfo(file);
        
        // Read the file content
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const content = e.target.result;
                this.logger.debug('File content loaded, first 100 chars:', content.substring(0, 100) + '...');
                
                // Update preview if preview container exists
                if (this.previewContainer) {
                    try {
                        // Parse the CSV content
                        const { headers, rows } = this.parseCSV(content);
                        const previewRows = rows.slice(0, 10); // Get first 10 data rows
                        const totalRows = rows.length;
                        
                        // Create table HTML with proper escaping
                        const escapeHTML = (str) => {
                            if (str === null || str === undefined) return '';
                            return String(str)
                                .replace(/&/g, '&amp;')
                                .replace(/</g, '&lt;')
                                .replace(/>/g, '&gt;')
                                .replace(/"/g, '&quot;')
                                .replace(/'/g, '&#039;');
                        };
                        
                        // Generate table rows
                        const tableRows = previewRows.map(row => {
                            return `
                                <tr>
                                    ${headers.map(header => 
                                        `<td>${escapeHTML(row[header])}</td>`
                                    ).join('')}
                                </tr>`;
                        }).join('');
                        
                        // Generate the full table HTML
                        const tableHtml = `
                            <div class="preview-container">
                                <div class="preview-header">
                                    <h3>CSV Preview (First ${previewRows.length} of ${totalRows} rows)</h3>
                                </div>
                                <div class="table-responsive">
                                    <table class="table table-striped table-bordered table-hover">
                                        <thead class="table-dark">
                                            <tr>
                                                ${headers.map(header => 
                                                    `<th>${escapeHTML(header)}</th>`
                                                ).join('')}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${tableRows}
                                        </tbody>
                                    </table>
                                </div>
                                ${totalRows > 10 ? 
                                    `<div class="preview-footer text-muted">
                                        Showing 10 of ${totalRows} rows
                                    </div>` : 
                                    ''
                                }
                            </div>`;
                        
                        this.previewContainer.innerHTML = tableHtml;
                    } catch (error) {
                        console.error('Error generating CSV preview:', error);
                        this.previewContainer.innerHTML = `
                            <div class="preview-error">
                                <p>Error generating preview. Please check the console for details.</p>
                            </div>
                        `;
                    }
                }
                
                // Trigger the file selected event on the window
                const fileSelectedEvent = new CustomEvent('fileSelected', { 
                    detail: { file, content } 
                });
                window.dispatchEvent(fileSelectedEvent);
                
            } catch (error) {
                this.logger.error('Error processing file content:', error);
                this.uiManager.showError('Error processing file: ' + error.message);
            }
        };
        
        reader.onerror = (error) => {
            this.logger.error('Error reading file:', error);
            this.uiManager.showError('Error reading file: ' + error.message);
            this.updateFileInfo(null);
        };
        
        // Read the file as text
        reader.readAsText(file);
    }
    
    /**
     * Check if file matches the last saved file info
     * @param {File} file - File to check
     * @returns {boolean} True if file matches last saved info
     */
    isSameFile(file) {
        if (!this.lastFileInfo) return false;
        return (
            file.name === this.lastFileInfo.name &&
            file.size === this.lastFileInfo.size &&
            file.lastModified === this.lastFileInfo.lastModified &&
            file.type === this.lastFileInfo.type
        );
    }

    /**
     * Format file size in human-readable format
     * @param {number} bytes - File size in bytes
     * @returns {string} Formatted file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Format date in a readable format
     * @param {number} timestamp - Timestamp in milliseconds
     * @returns {string} Formatted date string
     */
    formatDate(timestamp) {
        return new Date(timestamp).toLocaleString();
    }

    /**
     * Update file information in the UI
     * @param {File} file - The selected file
     */
    updateFileInfo(file) {
        this.logger.debug('Updating file info for:', file ? file.name : 'no file');
        
        if (!file) {
            if (this.fileInfo) {
                this.fileInfo.innerHTML = '';
            }
            return;
        }
        
        if (!this.fileInfo) {
            this.logger.warn('File info element not found');
            return;
        }
        
        const fileInfoHtml = `
            <div class="file-details">
                <div class="file-name"><i class="fas fa-file"></i> ${file.name}</div>
                <div class="file-meta">
                    <span><i class="fas fa-database"></i> ${this.formatFileSize(file.size)}</span>
                    <span><i class="far fa-clock"></i> ${this.formatDate(file.lastModified)}</span>
                    <span><i class="fas fa-table"></i> ${file.type || 'text/csv'}</span>
                </div>
            </div>
        `;
        
        this.fileInfo.innerHTML = fileInfoHtml;
        this.logger.debug('File info updated in UI');
    }

    /**
     * Show preview of the CSV data
     * @param {Array} data - Parsed CSV data
     */
    showPreview(data) {
        if (!this.uiManager.previewContainer) return;
        
        if (!data || data.length === 0) {
            this.uiManager.previewContainer.innerHTML = '<div class="no-data">No data to display</div>';
            return;
        }

        // Limit to first 10 rows for preview
        const previewData = data.slice(0, 10);
        const headers = Object.keys(previewData[0] || {});
        
        let tableHtml = `
            <div class="table-container">
                <table class="preview-table">
                    <thead>
                        <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
                    </thead>
                    <tbody>
                        ${previewData.map(row => `
                            <tr>${headers.map(h => `<td>${row[h] || ''}</td>`).join('')}</tr>
                        `).join('')}
                    </tbody>
                </table>
                ${data.length > 10 ? 
                    `<div class="preview-footer">Showing 10 of ${data.length} rows</div>` : 
                    `<div class="preview-footer">${data.length} rows</div>`
                }
            </div>
        `;
        
        this.uiManager.previewContainer.innerHTML = tableHtml;
    }

    /**
     * Process a CSV file and return headers and rows
     * @param {File} file - The CSV file to process
     * @returns {Promise<{headers: Array<string>, rows: Array<Object>}>} - Processed data
     */
    /**
     * Process a CSV file and return headers and rows
     * @param {File} file - The CSV file to process
     * @returns {Promise<{headers: Array<string>, rows: Array<Object>}>} - Processed data
     */
    async processCSV(file) {
        this.logger.log(`Processing file: ${file.name} (${this.formatFileSize(file.size)})`, 'info');
        
        // Check if file is empty
        if (!file || file.size === 0) {
            throw new Error(`The file "${file.name}" is empty (0 bytes). Please select a valid CSV file with data.`);
        }
        
        // Check file type
        const fileExt = this.getFileExtension(file.name).toLowerCase();
        if (fileExt !== 'csv') {
            throw new Error(`Unsupported file type: .${fileExt}. Please upload a CSV file.`);
        }
        
        // Save file info for persistence
        this.saveFileInfo(file);
        
        // Update UI with file info
        this.updateFileInfo(file);
        
        // Show loading state for preview
        if (this.uiManager.previewContainer) {
            this.uiManager.previewContainer.innerHTML = `
                <div class="loading">
                    <div class="spinner"></div>
                    <div>Processing file (${this.formatFileSize(file.size)})...</div>
                </div>`;
        }
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (event) => {
                try {
                    const text = event.target.result;
                    
                    // Debug log the raw file content
                    console.debug('Raw file content:', {
                        type: typeof text,
                        length: text.length,
                        first100: text.substring(0, 100) + (text.length > 100 ? '...' : '')
                    });
                    
                    // Check if the file content is empty
                    if (!text || (typeof text === 'string' && text.trim() === '')) {
                        console.error('File content is empty or invalid:', {
                            isNull: text === null,
                            isUndefined: text === undefined,
                            isEmptyString: text === '',
                            isWhitespace: text && text.trim() === ''
                        });
                        throw new Error('The file appears to be empty or contains no text content');
                    }
                    
                    // Split into lines and filter out empty lines
                    const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
                    
                    // Check if we have at least a header and one data row
                    if (lines.length < 2) {
                        throw new Error('CSV file must contain a header row and at least one data row');
                    }
                    
                    // Check if the first line (header) contains valid CSV data
                    if (!lines[0].includes(',')) {
                        throw new Error('Invalid CSV format: Could not detect column delimiters. Please ensure the file is a valid CSV with comma-separated values.');
                    }
                    
                    // Parse headers
                    const headers = this.parseCSVLine(lines[0]).map(h => h.trim());
                    
                    // Log the headers for debugging
                    console.log('CSV Headers:', headers);
                    
                    // Create a mapping of lowercase header names to their original case
                    const headerMap = {};
                    headers.forEach(header => {
                        headerMap[header.toLowerCase()] = header;
                    });
                    
                    // Check if email column exists
                    if (!('email' in headerMap)) {
                        throw new Error('CSV must contain an "email" column');
                    }
                    
                    // Parse data rows
                    const rows = [];
                    let lineNumber = 1; // Start from 1 to account for header row
                    let validRows = 0;
                    
                    for (let i = 1; i < lines.length; i++) {
                        try {
                            const values = this.parseCSVLine(lines[i]);
                            if (values.length !== headers.length) {
                                this.logger.warn(`Skipping row ${lineNumber}: Column count doesn't match headers`);
                                lineNumber++;
                                continue;
                            }
                            
                            const row = {};
                            
                            // Map values to headers
                            headers.forEach((header, index) => {
                                if (values[index] !== undefined) {
                                    const value = values[index] ? values[index].trim() : '';
                                    row[header] = value;
                                }
                            });
                            
                            // Skip rows without email (required field)
                            const email = row[headerMap['email']] || '';
                            if (!email.trim()) {
                                this.logger.warn(`Skipping row ${lineNumber}: Missing email address`);
                                lineNumber++;
                                continue;
                            }
                            
                            // Get username, fall back to email if not provided
                            const username = row[headerMap['username']] || email;
                            
                            // Convert string 'true'/'false' to boolean for active field
                            const activeField = headerMap['active'] || headerMap['enabled'];
                            let active = true; // default to true
                            if (activeField && row[activeField] !== undefined) {
                                active = String(row[activeField]).toLowerCase() === 'true';
                            }
                            
                            // Set default password if not provided (PingOne requires a password)
                            if (!row.password) {
                                row.password = this.generateTemporaryPassword();
                                this.logger.log(`Generated temporary password for user: ${row.username || row.email}`, 'info');
                            }
                            
                            // Set default active status if not provided
                            if (row.active === undefined) {
                                row.active = true;
                            }
                            
                            // Get name fields if they exist
                            const firstName = row[headerMap['firstname']] || 
                                           row[headerMap['first name']] || 
                                           row[headerMap['first_name']] || '';
                            const lastName = row[headerMap['lastname']] || 
                                          row[headerMap['last name']] || 
                                          row[headerMap['last_name']] || '';
                            
                            // Get password or generate one if not provided
                            const password = row[headerMap['password']] || this.generateTemporaryPassword();
                            
                            // Format user data for PingOne API
                            const userData = {
                                username: username,
                                email: email,
                                name: {
                                    given: firstName,
                                    family: lastName
                                },
                                password: password,
                                enabled: active
                            };
                            
                            // Add to valid rows
                            rows.push(userData);
                            validRows++;
                        } catch (error) {
                            this.logger.warn(`Error parsing line ${lineNumber}: ${error.message}`);
                        } finally {
                            lineNumber++;
                        }
                    }
                    
                    if (validRows === 0) {
                        throw new Error('No valid user records found in the file. Please check that the file contains valid user data with at least an email and username.');
                    }
                    
                    this.logger.log(`Successfully processed ${validRows} valid users from ${file.name}`, 'success');
                    
                    resolve({
                        headers,
                        rows
                    });
                } catch (error) {
                    // Clear saved file info on error
                    this.clearFileInfo();
                    reject(error);
                }
            };
            
            reader.onerror = (error) => {
                // Log detailed error information
                console.error('FileReader error:', {
                    name: error.name,
                    message: error.message,
                    code: error.code,
                    type: error.type,
                    readyState: reader.readyState,
                    error: error
                });
                
                // Clear saved file info on error
                this.clearFileInfo();
                reject(new Error(`Error reading file (${error.name}): ${error.message}`));
            };
            
            // Log before starting to read
            console.log('Starting to read file with FileReader', {
                file: {
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    lastModified: new Date(file.lastModified).toISOString()
                },
                readerReadyState: reader.readyState
            });
            
            reader.readAsText(file);
        });
    }
    
    /**
     * Parse a single CSV line, handling quoted values and different delimiters
     * @param {string} line - CSV line to parse
     * @param {string} [delimiter=','] - Field delimiter (defaults to comma)
     * @returns {Array<string>} Array of values
     */
    parseCSVLine(line, delimiter = ',') {
        const values = [];
        let inQuotes = false;
        let currentValue = '';
        let i = 0;
        
        // Skip empty lines
        if (!line || line.trim() === '') {
            return [];
        }
        
        // Normalize line endings and trim whitespace
        line = line.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
        
        // Check if the line might be tab-delimited (if no delimiter specified)
        if (delimiter === ',' && line.includes('\t') && !line.includes(',')) {
            delimiter = '\t';
        }
        
        while (i < line.length) {
            const char = line[i];
            
            if (char === '"') {
                // Handle quoted values
                if (inQuotes && line[i + 1] === '"') {
                    // Escaped quote inside quoted value
                    currentValue += '"';
                    i += 2;
                } else if (inQuotes && line[i + 1] === delimiter) {
                    // End of quoted field
                    inQuotes = false;
                    i++;
                } else {
                    // Start or end of quoted field
                    inQuotes = !inQuotes;
                    i++;
                }
            } else if (char === delimiter && !inQuotes) {
                // End of field
                values.push(currentValue);
                currentValue = '';
                i++;
                
                // Skip any whitespace after delimiter
                while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
                    i++;
                }
            } else {
                currentValue += char;
                i++;
            }
        }
        
        // Add the last value
        values.push(currentValue);
        
        // Clean up values (remove quotes and trim)
        return values.map(value => {
            // Remove surrounding quotes if they exist
            let cleaned = value.trim();
            if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || 
                (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
                cleaned = cleaned.substring(1, cleaned.length - 1);
            }
            // Replace escaped quotes
            return cleaned.replace(/""/g, '"');
        });
    }
    
    /**
     * Validate a user object against required fields and data formats
     * @param {Object} user - The user object to validate
     * @param {Array} headers - The CSV headers
     * @returns {Object} Validation result with validity and errors
     */
    validateUser(user, headers) {
        const errors = [];
        const warnings = [];
        
        // Skip validation if email is missing (handled in processCSV)
        if (!user.email || user.email.trim() === '') {
            return { valid: false, errors: ['Email is required'], warnings: [] };
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(user.email)) {
            errors.push(`Invalid email format: ${user.email}`);
        }
        
        // Check for duplicate fields
        const fieldCounts = {};
        headers.forEach(header => {
            if (!fieldCounts[header]) {
                fieldCounts[header] = 0;
            }
            fieldCounts[header]++;
        });
        
        Object.entries(fieldCounts).forEach(([header, count]) => {
            if (count > 1) {
                warnings.push(`Duplicate column '${header}' found in CSV`);
            }
        });
        
        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
    
    /**
     * Parse CSV text into headers and rows with proper handling of quoted values and different delimiters
     * @param {string} csvText - The CSV text to parse
     * @returns {{headers: Array<string>, rows: Array<Object>, delimiter: string}} Parsed CSV data
     */
    parseCSV(csvText) {
        if (!csvText || typeof csvText !== 'string') {
            throw new Error('Invalid CSV text');
        }

        // Normalize line endings and trim whitespace
        const normalizedText = csvText
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .trim();
        
        if (normalizedText.length === 0) {
            return { headers: [], rows: [], delimiter: ',' };
        }

        // Detect delimiter from first line
        const firstLine = normalizedText.split('\n')[0];
        let delimiter = ',';
        if (firstLine.includes('\t') && !firstLine.includes(',')) {
            delimiter = '\t';
        } else if (firstLine.includes(';') && !firstLine.includes(',')) {
            delimiter = ';';
        }

        const lines = [];
        let currentLine = [];
        let inQuotes = false;
        let currentValue = '';
        let i = 0;
        const length = normalizedText.length;

        // Process each character to handle quoted values and newlines
        while (i < length) {
            const char = normalizedText[i];
            const nextChar = normalizedText[i + 1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    // Handle escaped quotes ("")
                    currentValue += '"';
                    i++; // Skip next quote
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === delimiter && !inQuotes) {
                // End of field
                currentLine.push(currentValue.trim());
                currentValue = '';
            } else if ((char === '\n' || (char === '\r' && nextChar === '\n')) && !inQuotes) {
                // End of line (handle both \n and \r\n)
                currentLine.push(currentValue.trim());
                
                // Only add non-empty lines
                if (currentLine.length > 0 && (currentLine.length > 1 || currentLine[0] !== '')) {
                    lines.push([...currentLine]);
                }
                
                currentLine = [];
                currentValue = '';
                
                // Skip next character if it's part of \r\n
                if (char === '\r' && nextChar === '\n') {
                    i++;
                }
            } else {
                currentValue += char;
            }
            
            i++;
        }
        
        // Add the last line if there's any remaining data
        if (currentValue.trim() !== '' || currentLine.length > 0) {
            currentLine.push(currentValue.trim());
            if (currentLine.length > 0 && (currentLine.length > 1 || currentLine[0] !== '')) {
                lines.push([...currentLine]);
            }
        }

        if (lines.length === 0) {
            return { headers: [], rows: [], delimiter };
        }

        // First line is headers - normalize them (trim, lowercase, replace spaces with underscores)
        const headers = lines[0].map(header => 
            header.toString().trim().toLowerCase()
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '')
        );
        
        // Process data rows
        const rows = [];
        for (let j = 1; j < lines.length; j++) {
            const row = {};
            const values = lines[j];
            
            // Skip empty lines
            if (values.length === 1 && values[0].trim() === '') {
                continue;
            }
            
            // Map values to headers
            for (let k = 0; k < headers.length; k++) {
                const header = headers[k];
                if (header && values[k] !== undefined) {
                    row[header] = values[k].toString().trim();
                }
            }
            
            // Only add non-empty rows
            if (Object.keys(row).length > 0) {
                rows.push(row);
            }
        }
        
        return { 
            headers,
            rows,
            delimiter // Return detected delimiter for reference
        };
    }
    
    /**
     * Simple email validation
     * @param {string} email - Email to validate
     * @returns {boolean} - True if email is valid
     */
    isValidEmail(email) {
        if (!email) return false;
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(String(email).toLowerCase());
    }
    
    /**
     * Get the file extension from a filename
     * @param {string} filename - The filename to get the extension from
     * @returns {string} The file extension (without dot) or empty string if no extension
     */
    getFileExtension(filename) {
        if (!filename || typeof filename !== 'string') return '';
        const parts = filename.split('.');
        return parts.length > 1 ? parts.pop().toLowerCase() : '';
    }
}

// Export the FileHandler class
module.exports = { FileHandler };

},{}],4:[function(require,module,exports){
/**
 * FileLogger - Handles writing logs to localStorage with file download capability
 */
class FileLogger {
    /**
     * Create a new FileLogger instance
     * @param {string} logKey - Key to use for localStorage
     */
    constructor(logKey = 'pingone-import-logs') {
        this.logKey = logKey;
        this.maxLogSize = 100000; // ~100KB max log size
        this.logs = this._loadLogs();
        this._initializeLogs();
    }

    /**
     * Initialize logs with a header if empty
     * @private
     */
    _initializeLogs() {
        if (this.logs.length === 0) {
            const header = [
                '/***********************************************************************',
                ' * PINGONE IMPORT LOG',
                ' *',
                ` * Started: ${new Date().toISOString()}`,
                ' *',
                ' * FORMAT:',
                ' * [TIMESTAMP] [LEVEL] MESSAGE',
                ' *   - Data: { ... }',
                ' *   - Context: { ... }',
                ' *',
                ' * LEVELS: DEBUG, INFO, WARN, ERROR',
                ' *',
                ' * SENSITIVE DATA (tokens, secrets, etc.) ARE AUTOMATICALLY REDACTED',
                ' **********************************************************************/\n\n'
            ].join('\n');
            this._appendToLogs(header);
        }
    }

    /**
     * Load logs from localStorage
     * @private
     */
    _loadLogs() {
        try {
            const logs = localStorage.getItem(this.logKey);
            return logs ? logs : '';
        } catch (error) {
            console.error('Failed to load logs from localStorage:', error);
            return '';
        }
    }

    /**
     * Save logs to localStorage
     * @private
     */
    _saveLogs(logs) {
        try {
            localStorage.setItem(this.logKey, logs);
            return true;
        } catch (error) {
            console.error('Failed to save logs to localStorage:', error);
            return false;
        }
    }

    /**
     * Append text to logs, handling size limits
     * @private
     */
    _appendToLogs(text) {
        // If adding this text would exceed max size, trim from the beginning
        if (this.logs.length + text.length > this.maxLogSize) {
            // Remove oldest log entries until we have enough space
            const excess = (this.logs.length + text.length) - this.maxLogSize;
            const headerEnd = this.logs.indexOf('\n\n') + 2;
            const header = this.logs.substring(0, headerEnd);
            let content = this.logs.substring(headerEnd);
            
            // Remove oldest log entries (after the header)
            while (content.length > 0 && content.length > excess) {
                const firstNewline = content.indexOf('\n');
                if (firstNewline === -1) break;
                content = content.substring(firstNewline + 1);
            }
            
            this.logs = header + content;
        }
        
        this.logs += text;
        this._saveLogs(this.logs);
    }

    /**
     * Log a message
     * @param {string} level - Log level (info, debug, error, etc.)
     * @param {string} message - The message to log
     * @param {Object} [data] - Additional data to log
     */
    async log(level, message, data = {}) {
        const timestamp = new Date().toISOString();
        const levelStr = level.toUpperCase().padEnd(5);
        let logEntry = `[${timestamp}] [${levelStr}] ${message}`;
        
        // Add data if provided
        if (data && typeof data === 'object' && Object.keys(data).length > 0) {
            try {
                // Redact sensitive information
                const safeData = JSON.parse(JSON.stringify(data, (key, value) => {
                    // Redact tokens and secrets
                    if (typeof value === 'string' && 
                        (key.toLowerCase().includes('token') || 
                         key.toLowerCase().includes('secret') ||
                         key.toLowerCase().includes('password') ||
                         key.toLowerCase().includes('api_key') ||
                         key.toLowerCase().includes('apikey'))) {
                        return '***REDACTED***';
                    }
                    return value;
                }));
                
                // Format the data with proper indentation
                const formattedData = JSON.stringify(safeData, null, 2)
                    .split('\n')
                    .map((line, i) => i === 0 ? `  - ${line}` : `    ${line}`)
                    .join('\n');
                
                logEntry += `\n${formattedData}`;
            } catch (e) {
                logEntry += '\n  - [Error stringifying data]';
                logEntry += `\n  - Error: ${e.message}`;
            }
        }
        
        logEntry += '\n';
        this._appendToLogs(logEntry);
    }

    /**
     * Get all logs as a string
     * @returns {string} The complete log content
     */
    getLogs() {
        return this.logs;
    }
    
    /**
     * Clear all logs
     */
    clear() {
        this.logs = '';
        this._saveLogs('');
        this._initializeLogs();
    }
    
    /**
     * Download logs as a file
     */
    download() {
        try {
            const blob = new Blob([this.logs], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pingone-import-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to download logs:', error);
        }
    }
}

module.exports = FileLogger;

},{}],5:[function(require,module,exports){
const FileLogger = require('./file-logger.js');

class Logger {
    constructor(logContainer = null) {
        // Initialize properties
        this.logs = [];
        this.maxLogs = 1000;
        this.initialized = false;
        this.offlineLogs = [];
        this.isOnline = window.navigator.onLine;
        this.logContainer = null;
        
        // Initialize log container
        this._initLogContainer(logContainer);
        
        // Setup file logger with safe defaults
        this.fileLogger = {
            log: (level, message, data) => {
                const logFn = console[level] || console.log;
                logFn(`[${level.toUpperCase()}] ${message}`, data);
                return Promise.resolve();
            },
            download: () => {
                console.warn('File logger not initialized - cannot download logs');
                return Promise.resolve();
            }
        };
        
        // Try to initialize the actual file logger
        try {
            const fileLogger = new FileLogger('pingone-import-logs');
            this.fileLogger = fileLogger;
            this.initialized = true;
        } catch (error) {
            console.warn('Could not initialize file logger, using console fallback', error);
        }
        
        // Set up event listeners
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
    }
    
    _initLogContainer(logContainer) {
        if (logContainer && typeof logContainer === 'object') {
            this.logContainer = logContainer;
        } else {
            this.logContainer = document.getElementById('log-entries') || document.createElement('div');
        }
    }
    
    handleOnline() {
        this.isOnline = true;
        this.log('Internet connection restored', 'info');
        this.processOfflineLogs();
    }
    
    handleOffline() {
        this.isOnline = false;
        this.log('Internet connection lost, logging to memory', 'warn');
    }
    
    async processOfflineLogs() {
        if (this.offlineLogs.length === 0) return;
        
        this.log(`Processing ${this.offlineLogs.length} queued logs...`, 'info');
        
        for (const logEntry of this.offlineLogs) {
            try {
                await this.fileLogger.log(logEntry.level, logEntry.message, logEntry.data);
            } catch (error) {
                console.error('Error processing queued log:', error);
            }
        }
        
        this.offlineLogs = [];
        this.log('Finished processing queued logs', 'info');
    }
    
    async log(level, message, data = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = { level, message, data, timestamp };
        
        // Add to in-memory logs
        this.logs.push(logEntry);
        
        // Keep logs under maxLogs limit
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }
        
        // Log to console
        const logFn = console[level] || console.log;
        logFn(`[${timestamp}] [${level.toUpperCase()}] ${message}`, data);
        
        // Save to file logger
        if (this.fileLogger) {
            try {
                await this.fileLogger.log(level, message, data);
            } catch (error) {
                console.error('Error saving log to file:', error);
            }
        }
        
        // Send log to server
        try {
            await fetch('/api/logs/ui', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    level,
                    message,
                    data
                })
            });
        } catch (error) {
            console.error('Error sending log to server:', error);
            // Store logs for later when offline
            this.offlineLogs.push(logEntry);
        }
        
        // Update UI if log container exists
        this._updateLogUI(logEntry);
        
        return logEntry;
    }
    
    _updateLogUI(logEntry) {
        if (!this.logContainer) return;
        
        const logElement = document.createElement('div');
        logElement.className = `log-entry log-${logEntry.level}`;
        
        const timestamp = new Date(logEntry.timestamp).toLocaleTimeString();
        logElement.innerHTML = `
            <span class="log-timestamp">[${timestamp}]</span>
            <span class="log-level">${logEntry.level.toUpperCase()}</span>
            <span class="log-message">${logEntry.message}</span>
        `;
        
        if (logEntry.data && Object.keys(logEntry.data).length > 0) {
            const dataElement = document.createElement('pre');
            dataElement.className = 'log-data';
            dataElement.textContent = JSON.stringify(logEntry.data, null, 2);
            logElement.appendChild(dataElement);
        }
        
        this.logContainer.appendChild(logElement);
        this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }
    
    renderLogs() {
        if (!this.logContainer) return;
        
        // Clear existing logs
        this.logContainer.innerHTML = '';
        
        // Add all logs to the container
        this.logs.forEach(log => this._updateLogUI(log));
        
        // Scroll to bottom
        this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }
    
    clearLogs() {
        this.logs = [];
        if (this.logContainer) {
            this.logContainer.innerHTML = '';
        }
    }
    
    getLogs() {
        return [...this.logs];
    }
    
    debug(message, data = {}) {
        return this.log(message, 'debug', data);
    }
    
    info(message, data = {}) {
        return this.log(message, 'info', data);
    }
    
    success(message, data = {}) {
        return this.log(message, 'success', data);
    }
    
    warn(message, data = {}) {
        return this.log(message, 'warn', data);
    }
    
    error(message, data = {}) {
        return this.log(message, 'error', data);
    }
}

module.exports = { Logger };

},{"./file-logger.js":4}],6:[function(require,module,exports){
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
        const { signal, headers: customHeaders = {}, ...fetchOptions } = options;
        
        // Get the access token
        const accessToken = await this.getAccessToken();
        
        // Set up request options
        const requestOptions = {
            method,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                ...customHeaders
            },
            ...fetchOptions
        };
        
        // Add request body for methods that support it
        if (data && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
            requestOptions.body = JSON.stringify(data);
        }
        
        // Add signal if provided (for request cancellation)
        if (signal) {
            requestOptions.signal = signal;
        }
        
        // Get base URL based on region
        const region = this.settingsManager.getSetting('region', 'NorthAmerica');
        const baseUrls = {
            'NorthAmerica': 'https://api.pingone.com/v1',
            'Europe': 'https://api.eu.pingone.com/v1',
            'Asia': 'https://api.asia.pingone.com/v1',
            'Canada': 'https://api.ca.pingone.com/v1'
        };
        
        const baseUrl = baseUrls[region] || baseUrls.NorthAmerica;
        const environmentId = this.settingsManager.getSetting('environmentId');
        
        if (!environmentId) {
            throw new Error('Environment ID is not configured');
        }
        
        // Construct the full URL
        const url = `${baseUrl}/environments/${environmentId}${endpoint}`;
        
        try {
            this.logger.log(`Making ${method} request to: ${url}`, 'debug');
            
            const response = await fetch(url, requestOptions);
            
            // Handle non-2xx responses
            if (!response.ok) {
                let errorMessage = `Request failed with status ${response.status}`;
                let errorDetails = null;
                
                try {
                    const errorData = await response.json();
                    errorDetails = errorData;
                    errorMessage = errorData.message || errorData.detail || errorMessage;
                } catch (e) {
                    // If we can't parse the error as JSON, try to get the text
                    const text = await response.text().catch(() => '');
                    if (text) {
                        errorDetails = text;
                        errorMessage = `Request failed: ${text}`;
                    }
                }
                
                const error = new Error(errorMessage);
                error.status = response.status;
                error.details = errorDetails;
                throw error;
            }
            
            // For 204 No Content, return empty object
            if (response.status === 204) {
                return {};
            }
            
            // Parse and return JSON response
            return await response.json();
            
        } catch (error) {
            this.logger.error(`API request failed: ${error.message}`, error);
            
            // Add more context to the error
            if (!error.status) {
                error.status = 0; // Network error
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

},{"./token-manager.js":8}],7:[function(require,module,exports){
const { CryptoUtils } = require('./crypto-utils.js');

class SettingsManager {
    constructor(logger) {
        // Initialize settings and storage key
        this.settings = this.getDefaultSettings();
        this.storageKey = 'pingone-import-settings';
        this.crypto = new CryptoUtils();
        this.encryptionKey = null;
        
        // Initialize logger
        this.initializeLogger(logger);
        
        // Initialize encryption
        this.initializeEncryption();
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
            const navigatorInfo = {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                hardwareConcurrency: navigator.hardwareConcurrency,
                deviceMemory: navigator.deviceMemory,
                maxTouchPoints: navigator.maxTouchPoints
            };
            
            // Create a hash of the navigator info
            const encoder = new TextEncoder();
            const data = encoder.encode(JSON.stringify(navigatorInfo));
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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
            populationId: '',
            region: 'NorthAmerica',
            
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
                    const serverSettings = await response.json();
                    
                    if (serverSettings.success && serverSettings.data) {
                        // Server settings are available, use them
                        const parsedSettings = serverSettings.data;
                        
                        // Decrypt sensitive fields if they exist
                        if (parsedSettings.apiSecret) {
                            try {
                                parsedSettings.apiSecret = await this.decryptIfNeeded(parsedSettings.apiSecret);
                            } catch (error) {
                                this.logger.error('Failed to decrypt API secret', error);
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
                                this.logger.error('Failed to decrypt API secret from localStorage', error);
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
            this.logger.error('Decryption failed:', error);
            throw new Error('Failed to decrypt sensitive data');
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
module.exports = { 
    SettingsManager,
    settingsManager: new SettingsManager() 
};

},{"./crypto-utils.js":2}],8:[function(require,module,exports){
/**
 * TokenManager - Handles OAuth 2.0 token acquisition and caching
 */
class TokenManager {
    /**
     * Create a new TokenManager instance
     * @param {Object} logger - Logger instance for logging messages
     * @param {Object} settings - Settings object containing API credentials
     */
    constructor(logger, settings) {
        this.logger = logger;
        this.settings = settings;
        this.tokenCache = {
            accessToken: null,
            expiresAt: 0,
            tokenType: null
        };
        this.tokenExpiryBuffer = 5 * 60 * 1000; // 5 minutes buffer before token expiry
    }

    /**
     * Get a valid access token, either from cache or by requesting a new one
     * @returns {Promise<string>} The access token
     */
    async getAccessToken() {
        // Check if we have a valid cached token
        if (this._isTokenValid()) {
            this.logger.debug('Using cached access token');
            return this.tokenCache.accessToken;
        }

        // If no valid token, request a new one
        return this._requestNewToken();
    }

    /**
     * Check if the current token is still valid
     * @returns {boolean} True if token is valid, false otherwise
     * @private
     */
    _isTokenValid() {
        const now = Date.now();
        return this.tokenCache.accessToken && 
               this.tokenCache.expiresAt > (now + this.tokenExpiryBuffer);
    }

    /**
     * Request a new access token from PingOne
     * @returns {Promise<string>} The new access token
     * @private
     */
    async _requestNewToken() {
        const startTime = Date.now();
        const { apiClientId, apiSecret, environmentId, region = 'NorthAmerica' } = this.settings;
        const requestId = `req_${Math.random().toString(36).substr(2, 9)}`;
        
        // Log the environment for debugging
        const envInfo = {
            requestId,
            hasClientId: !!apiClientId,
            clientIdPrefix: apiClientId ? `${apiClientId.substring(0, 4)}...` : 'none',
            hasSecret: !!apiSecret,
            hasEnvId: !!environmentId,
            envId: environmentId || 'none',
            region: region || 'NorthAmerica',
            timestamp: new Date().toISOString()
        };
        
        if (!apiClientId || !apiSecret || !environmentId) {
            const error = new Error('Missing required API credentials in settings');
            this.logger.error('Token request failed: Missing credentials', envInfo);
            throw error;
        }

        // Determine the auth URL based on region
        const authDomainMap = {
            'NorthAmerica': 'auth.pingone.com',
            'Europe': 'auth.eu.pingone.com',
            'Canada': 'auth.ca.pingone.com',
            'Asia': 'auth.apsoutheast.pingone.com',
            'Australia': 'auth.aus.pingone.com',
            'US': 'auth.pingone.com',
            'EU': 'auth.eu.pingone.com',
            'AP': 'auth.apsoutheast.pingone.com'
        };
        
        const authDomain = authDomainMap[region] || 'auth.pingone.com';
        const tokenUrl = `https://${authDomain}/${environmentId}/as/token`;
        
        // Log token request details (without exposing full credentials)
        this.logger.debug('Preparing token request', {
            ...envInfo,
            tokenUrl: tokenUrl,
            requestMethod: 'POST',
            hasAuthHeader: true,
            hasContentType: true
        });

        let response;
        let responseData;
        const authString = btoa(`${apiClientId}:${apiSecret}`);
        
        try {
            // Make the request
            const fetchStart = Date.now();
            response = await fetch(tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${authString}`,
                    'Accept': 'application/json'
                },
                body: 'grant_type=client_credentials',
                credentials: 'omit' // Important for CORS
            });

            const responseTime = Date.now() - fetchStart;
            const totalTime = Date.now() - startTime;
            
            try {
                responseData = await response.json();
            } catch (e) {
                const text = await response.text().catch(() => 'Failed to read response text');
                this.logger.error('Failed to parse JSON response', {
                    ...envInfo,
                    status: response.status,
                    statusText: response.statusText,
                    responseText: text,
                    error: e.toString()
                });
                throw new Error(`Invalid JSON response: ${e.message}`);
            }
            
            // Log response details
            const logData = {
                ...envInfo,
                status: response.status,
                statusTime: `${responseTime}ms`,
                totalTime: `${totalTime}ms`,
                hasResponseData: !!responseData,
                hasAccessToken: !!(responseData && responseData.access_token)
            };
            
            if (!response.ok) {
                this.logger.error('Token request failed', {
                    ...logData,
                    error: responseData.error,
                    errorDescription: responseData.error_description,
                    responseHeaders: Object.fromEntries(response.headers.entries())
                });
                
                let errorMsg = responseData.error_description || 
                              responseData.error || 
                              `HTTP ${response.status} ${response.statusText}`;
                
                // Add more context to common errors
                if (response.status === 401) {
                    errorMsg = 'Authentication failed. Please check your API Client ID and Secret.';
                } else if (response.status === 403) {
                    errorMsg = 'Authorization failed. The provided credentials do not have sufficient permissions.';
                } else if (response.status === 404) {
                    errorMsg = 'Environment not found. Please check your Environment ID.';
                }
                
                throw new Error(errorMsg);
            }
            
            if (!responseData.access_token) {
                this.logger.error('No access token in response', {
                    ...logData,
                    responseData: responseData
                });
                throw new Error('No access token in response');
            }
            
            // Log successful token acquisition (without logging the actual token)
            this.logger.debug('Successfully obtained access token', {
                ...logData,
                tokenType: responseData.token_type,
                expiresIn: responseData.expires_in,
                scope: responseData.scope
            });
            
            // Cache the token and return it
            this._cacheToken(responseData);
            return responseData.access_token;
            
        } catch (error) {
            const errorInfo = {
                ...envInfo,
                error: error.toString(),
                errorName: error.name,
                errorMessage: error.message,
                errorStack: error.stack,
                isNetworkError: error instanceof TypeError && error.message.includes('fetch'),
                timestamp: new Date().toISOString()
            };
            
            // Log network errors with more details
            if (errorInfo.isNetworkError) {
                this.logger.error('Network error while requesting token', errorInfo);
                error.message = 'Network error. Please check your internet connection and CORS settings.';
            } else {
                this.logger.error('Failed to obtain access token', errorInfo);
            }
            
            // Re-throw with a more user-friendly message if needed
            if (error.message.includes('Failed to fetch')) {
                error.message = 'Failed to connect to PingOne. This might be due to network issues, CORS restrictions, or an invalid environment URL.';
            }
            
            throw error;
        }
    }

    /**
     * Cache the token and calculate expiry time
     * @param {Object} tokenData - Token data from PingOne
     * @private
     */
    _cacheToken(tokenData) {
        const now = Date.now();
        const expiresInMs = (tokenData.expires_in || 3600) * 1000; // Default to 1 hour if not provided
        const tokenLifetimeMs = Math.min(expiresInMs, 55 * 60 * 1000); // Cap at 55 minutes
        
        this.tokenCache = {
            accessToken: tokenData.access_token,
            tokenType: tokenData.token_type || 'Bearer',
            expiresAt: now + tokenLifetimeMs
        };

        this.logger.debug('Token cached', {
            tokenType: this.tokenCache.tokenType,
            expiresAt: new Date(this.tokenCache.expiresAt).toISOString(),
            lifetimeMinutes: Math.round(tokenLifetimeMs / 60000),
            tokenPreview: this.tokenCache.accessToken 
                ? `${this.tokenCache.accessToken.substring(0, 10)}...` 
                : 'empty'
        });
    }

    /**
     * Update the settings used for token requests
     * @param {Object} newSettings - New settings to use
     */
    updateSettings(newSettings) {
        if (!newSettings || typeof newSettings !== 'object') {
            this.logger.warn('Invalid settings provided to updateSettings');
            return;
        }
        
        // Only update if settings have actually changed
        const settingsChanged = Object.keys(newSettings).some(
            key => this.settings[key] !== newSettings[key]
        );
        
        if (settingsChanged) {
            this.logger.debug('Updating token manager settings');
            this.settings = { ...this.settings, ...newSettings };
            // Clear any cached token since settings changed
            this.clearToken();
        }
    }

    /**
     * Clear the cached token
     */
    clearToken() {
        this.tokenCache = {
            accessToken: null,
            expiresAt: 0,
            tokenType: null
        };
        this.logger.debug('Cleared cached token');
    }
}

module.exports = TokenManager;

},{}],9:[function(require,module,exports){
class UIManager {
    constructor(logger) {
        this.logger = logger;
        this.currentView = 'import';
        
        // Initialize UI elements
        this.views = {
            'import': document.getElementById('import-view'),
            'settings': document.getElementById('settings-view'),
            'logs': document.getElementById('logs-view')
        };
        
        // Navigation elements
        this.navItems = document.querySelectorAll('.nav-item');
        
        // Logs view elements
        this.logsView = this.views.logs;
        
        // Connection status element
        this.connectionStatusElement = document.getElementById('connection-status');
    }

    /**
     * Switch between different views
     * @param {string} viewName - The name of the view to switch to ('import', 'settings', 'logs')
     */
    switchView(viewName) {
        if (!this.views[viewName]) {
            console.error(`View '${viewName}' not found`);
            return;
        }

        // Hide all views
        Object.values(this.views).forEach(view => {
            if (view) view.classList.remove('active');
        });

        // Show the selected view
        this.views[viewName].classList.add('active');
        this.currentView = viewName;

        // Update active state of nav items
        this.navItems.forEach(item => {
            if (item.getAttribute('data-view') === viewName) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        this.logger.debug(`Switched to ${viewName} view`);
    }

    /**
     * Update the connection status display
     * @param {string} status - The connection status ('connected', 'disconnected', 'error')
     * @param {string} message - The status message to display
     * @param {boolean} [updateSettingsStatus=true] - Whether to also update the settings page status
     */
    updateConnectionStatus(status, message, updateSettingsStatus = true) {
        console.log(`Updating connection status: ${status} - ${message}`);
        
        // Update main status
        this._updateStatusElement('connection-status', status, message);
        
        // Also update settings status if we're on the settings page
        if (updateSettingsStatus && this.currentView === 'settings') {
            this.updateSettingsConnectionStatus(status, message);
        }
    }
    
    /**
     * Update the settings page connection status
     * @param {string} status - The connection status ('connected', 'disconnected', 'error')
     * @param {string} message - The status message to display
     */
    updateSettingsConnectionStatus(status, message) {
        // Default messages for statuses if not provided
        if (!message) {
            switch(status) {
                case 'connected':
                    message = 'Successfully connected to PingOne';
                    break;
                case 'error':
                    message = 'Connection error. Please check your settings.';
                    break;
                case 'disconnected':
                default:
                    message = 'Not connected. Please save your API credentials and test the connection.';
            }
        }
        
        this._updateStatusElement('settings-connection-status', status, message, false);
    }
    
    /**
     * Internal method to update a status element
     * @private
     */
    _updateStatusElement(elementId, status, message, autoHide = true) {
        let element = document.getElementById(elementId);
        if (!element) {
            console.warn(`Status element with ID '${elementId}' not found`);
            return;
        }
        
        // Clear existing classes
        element.className = 'connection-status';
        
        // Add status class
        element.classList.add(`status-${status}`);
        
        // Add icon based on status
        let icon = '';
        switch(status) {
            case 'connected':
                icon = '✓';
                break;
            case 'error':
                icon = '⚠️';
                break;
            case 'disconnected':
            default:
                icon = '⚠️';
        }
        
        // Update with icon and message
        element.innerHTML = `<span class="status-icon">${icon}</span> <span class="status-message">${message}</span>`;
        
        // Show the status element
        element.style.display = 'flex';
        
        // If connected and auto-hide is enabled, hide after 5 seconds
        if (status === 'connected' && autoHide) {
            setTimeout(() => {
                if (element) {
                    element.style.display = 'none';
                }
            }, 5000);
        }
    }

    /**
     * Switch to the specified view
     * @param {string} viewName - Name of the view to show ('import', 'settings', 'logs')
     */
    /**
     * Scroll the logs container to the bottom
     */
    scrollLogsToBottom() {
        if (this.logsView) {
            const logsContainer = this.logsView.querySelector('.logs-container') || this.logsView;
            logsContainer.scrollTop = logsContainer.scrollHeight;
        }
    }

    async showView(viewName) {
        console.log(`Switching to view: ${viewName}`);
        
        // Hide all views
        Object.values(this.views).forEach(view => {
            if (view) view.classList.remove('active');
        });
        
        // Deactivate all nav items
        this.navItems.forEach(item => {
            if (item) item.classList.remove('active');
        });
        
        // Show the selected view
        if (this.views[viewName]) {
            this.views[viewName].classList.add('active');
            this.currentView = viewName;
            
            // Activate the corresponding nav item
            const navItem = document.querySelector(`[data-view="${viewName}"]`);
            if (navItem) {
                navItem.classList.add('active');
            }
            
            // Special handling for specific views
            switch(viewName) {
                case 'logs':
                    await this.loadAndDisplayLogs();
                    this.scrollLogsToBottom();
                    break;
                case 'settings':
                    // Update settings connection status when switching to settings view
                    const currentStatus = this.connectionStatusElement?.classList.contains('status-connected') ? 'connected' : 'disconnected';
                    const currentMessage = this.connectionStatusElement?.querySelector('.status-message')?.textContent || '';
                    this.updateSettingsConnectionStatus(currentStatus, currentMessage);
                    break;
            }
            
            return true;
        } else {
            console.warn(`View '${viewName}' not found`);
            return false;
        }
    }

    /**
     * Load and display logs from the server
     */
    async loadAndDisplayLogs() {
        if (!this.logsView) {
            console.warn('Logs view element not found');
            return;
        }

        // Safe logging function
        const safeLog = (message, level = 'log', data = null) => {
            try {
                if (this.logger) {
                    if (typeof this.logger[level] === 'function') {
                        this.logger[level](message, data);
                        return;
                    } else if (typeof this.logger.log === 'function') {
                        this.logger.log(message, level, data);
                        return;
                    }
                }
                // Fallback to console
                if (console[level]) {
                    console[level](message, data);
                } else {
                    console.log(`[${level.toUpperCase()}]`, message, data);
                }
            } catch (logError) {
                console.error('Error in safeLog:', logError);
            }
        };

        // Get or create log entries container
        let logEntries = this.logsView.querySelector('.log-entries');
        if (!logEntries) {
            logEntries = document.createElement('div');
            logEntries.className = 'log-entries';
            this.logsView.appendChild(logEntries);
        }

        // Show loading indicator
        const loadingElement = document.createElement('div');
        loadingElement.id = 'logs-loading';
        loadingElement.textContent = 'Loading logs...';
        loadingElement.style.padding = '1rem';
        loadingElement.style.textAlign = 'center';
        loadingElement.style.color = '#666';
        
        // Clear existing content and show loading
        logEntries.innerHTML = '';
        logEntries.appendChild(loadingElement);
        
        try {
            // Fetch logs from the UI logs endpoint
            safeLog('Fetching logs from /api/logs/ui...', 'debug');
            const response = await fetch('/api/logs/ui?limit=200');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const responseData = await response.json();
            safeLog('Received logs from server', 'debug', { count: responseData.logs?.length });
            
            // Clear any existing logs in the UI
            logEntries.innerHTML = '';
            
            if (responseData.success === true && Array.isArray(responseData.logs)) {
                if (responseData.logs.length === 0) {
                    const noLogsElement = document.createElement('div');
                    noLogsElement.className = 'log-entry info';
                    noLogsElement.textContent = 'No logs available';
                    logEntries.appendChild(noLogsElement);
                    return;
                }
                
                // Process logs in reverse chronological order (newest first)
                const logsToProcess = [...responseData.logs].reverse();
                
                logsToProcess.forEach((log, index) => {
                    try {
                        if (log && typeof log === 'object') {
                            const logElement = document.createElement('div');
                            const logLevel = (log.level || 'info').toLowerCase();
                            logElement.className = `log-entry log-${logLevel}`;
                            
                            const timestamp = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
                            const level = log.level ? log.level.toUpperCase() : 'INFO';
                            const message = log.message || 'No message';
                            
                            logElement.innerHTML = `
                                <span class="log-timestamp">[${timestamp}]</span>
                                <span class="log-level">${level}</span>
                                <span class="log-message">${message}</span>
                            `;
                            
                            // Add data if present
                            if (log.data && Object.keys(log.data).length > 0) {
                                const dataElement = document.createElement('pre');
                                dataElement.className = 'log-data';
                                dataElement.textContent = JSON.stringify(log.data, null, 2);
                                logElement.appendChild(dataElement);
                            }
                            
                            logEntries.appendChild(logElement);
                        } else {
                            safeLog(`Skipping invalid log entry at index ${index}`, 'warn', log);
                        }
                    } catch (logError) {
                        safeLog(`Error processing log entry at index ${index}: ${logError.message}`, 'error', { error: logError });
                    }
                });
                
                // Scroll to bottom after adding logs
                this.scrollLogsToBottom();
            } else {
                safeLog('No valid log entries found in response', 'warn');
                const noLogsElement = document.createElement('div');
                noLogsElement.className = 'log-entry info';
                noLogsElement.textContent = 'No logs available';
                logEntries.appendChild(noLogsElement);
            }
        } catch (error) {
            safeLog(`Error fetching logs: ${error.message}`, 'error', { 
                error: {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                }
            });
            
            // Show error message in the UI
            const errorElement = document.createElement('div');
            errorElement.className = 'log-entry error';
            errorElement.textContent = `Error loading logs: ${error.message}`;
            logEntries.innerHTML = '';
            logEntries.appendChild(errorElement);
        } finally {
            // Remove loading indicator
            const loadingElement = document.getElementById('logs-loading');
            if (loadingElement && loadingElement.parentNode === logEntries) {
                logEntries.removeChild(loadingElement);
            }
        }
    }

    /**
     * Show the import status section
     * @param {number} totalUsers - Total number of users to import
     */
    showImportStatus(totalUsers) {
        const importStatus = document.getElementById('import-status');
        if (importStatus) {
            importStatus.style.display = 'block';
        }
        
        // Reset all counters
        this.updateImportProgress(0, totalUsers, 'Starting import...', {
            success: 0,
            failed: 0,
            skipped: 0
        });
    }

    /**
     * Update the import progress
     * @param {number} current - Number of users processed so far
     * @param {number} total - Total number of users to process
     * @param {string} message - Status message to display
     * @param {Object} [counts] - Optional object containing success, failed, and skipped counts
     */
    updateImportProgress(current, total, message, counts = {}) {
        const progressBar = document.getElementById('import-progress');
        const progressPercent = document.getElementById('import-progress-percent');
        const progressText = document.getElementById('import-progress-text');
        const progressCount = document.getElementById('import-progress-count');
        
        if (progressBar) {
            const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
            progressBar.style.width = `${percent}%`;
            progressBar.setAttribute('aria-valuenow', percent);
        }
        
        if (progressPercent) {
            progressPercent.textContent = `${total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0}%`;
        }
        
        if (progressText) {
            progressText.textContent = message || '';
        }
        
        if (progressCount) {
            progressCount.textContent = `${current} of ${total} users`;
        }
        
        // Update success, failed, and skipped counts if provided
        if (counts.success !== undefined) {
            const successCount = document.getElementById('import-success-count');
            if (successCount) successCount.textContent = counts.success;
        }
        
        if (counts.failed !== undefined) {
            const failedCount = document.getElementById('import-failed-count');
            if (failedCount) failedCount.textContent = counts.failed;
        }
        
        if (counts.skipped !== undefined) {
            const skippedCount = document.getElementById('import-skipped-count');
            if (skippedCount) skippedCount.textContent = counts.skipped;
        }
    }
    
    /**
     * Reset the import state
     */
    resetImportState() {
        const importStatus = document.getElementById('import-status');
        if (importStatus) {
            importStatus.style.display = 'none';
        }
    }
    
    /**
     * Set the import button state
     * @param {boolean} enabled - Whether the button should be enabled
     * @param {string} [text] - Optional button text
     */
    setImportButtonState(enabled, text) {
        const importButton = document.getElementById('start-import-btn');
        if (importButton) {
            importButton.disabled = !enabled;
            if (text) {
                importButton.textContent = text;
            }
        }
    }
    
    /**
     * Show a success notification
     * @param {string} message - The message to display
     */
    showSuccess(message) {
        this.showNotification(message, 'success');
    }
    
    /**
     * Show a warning notification
     * @param {string} message - The message to display
     */
    showWarning(message) {
        this.showNotification(message, 'warning');
    }
    
    /**
     * Show an error notification
     * @param {string} message - The message to display
     */
    showError(message) {
        this.showNotification(message, 'error');
    }
    
    /**
     * Show a notification
     * @param {string} message - The message to display
     * @param {string} type - The type of notification ('success', 'warning', 'error')
     */
    showNotification(message, type = 'info') {
        // Implementation for showing notifications
        console.log(`[${type}] ${message}`);
        // You can add actual UI notification logic here
    }
    
    /**
     * Update the settings form with the provided settings
     * @param {Object} settings - The settings object containing the form values
     */
    updateSettingsForm(settings) {
        if (!settings) return;

        // Map of setting IDs to their corresponding form field IDs
        const settingFields = {
            'environmentId': 'environment-id',
            'apiClientId': 'api-client-id',
            'apiSecret': 'api-secret',
            'populationId': 'population-id'
        };

        // Update each form field with the corresponding setting value
        Object.entries(settingFields).forEach(([settingKey, fieldId]) => {
            const element = document.getElementById(fieldId);
            if (element && settings[settingKey] !== undefined) {
                element.value = settings[settingKey] || '';
            }
        });
    }

    init(callbacks = {}) {
        // Store callbacks
        this.callbacks = callbacks;
        
        // Initialize navigation event listeners
        this.navItems.forEach(item => {
            if (item) {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    const view = item.getAttribute('data-view');
                    if (view) {
                        this.showView(view);
                    }
                });
            }
        });
        
        // Set up Start Import button
        const startImportBtn = document.getElementById('start-import-btn');
        if (startImportBtn) {
            startImportBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (this.callbacks.onImport) {
                    this.callbacks.onImport();
                }
            });
        }
        
        // Set up Cancel Import button
        const cancelImportBtn = document.getElementById('cancel-import-btn');
        if (cancelImportBtn && this.callbacks.onCancelImport) {
            cancelImportBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.callbacks.onCancelImport();
            });
        }
        
        // Make sure the current view is visible
        const currentView = this.getLastView();
        this.showView(currentView);
    }
    
    /**
     * Show loading state
     * @param {boolean} [show=true] - Whether to show or hide the loading state
     * @param {string} [message='Loading...'] - Optional loading message
     */
    showLoading(show = true, message = 'Loading...') {
        let loadingElement = document.getElementById('loading-overlay');
        
        if (show) {
            // Create loading overlay if it doesn't exist
            if (!loadingElement) {
                loadingElement = document.createElement('div');
                loadingElement.id = 'loading-overlay';
                loadingElement.style.position = 'fixed';
                loadingElement.style.top = '0';
                loadingElement.style.left = '0';
                loadingElement.style.width = '100%';
                loadingElement.style.height = '100%';
                loadingElement.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
                loadingElement.style.display = 'flex';
                loadingElement.style.justifyContent = 'center';
                loadingElement.style.alignItems = 'center';
                loadingElement.style.zIndex = '9999';
                
                const spinner = document.createElement('div');
                spinner.className = 'spinner-border text-light';
                spinner.role = 'status';
                
                const srOnly = document.createElement('span');
                srOnly.className = 'visually-hidden';
                srOnly.textContent = 'Loading...';
                
                spinner.appendChild(srOnly);
                
                const messageElement = document.createElement('div');
                messageElement.className = 'ms-3 text-light';
                messageElement.textContent = message;
                messageElement.id = 'loading-message';
                
                loadingElement.appendChild(spinner);
                loadingElement.appendChild(messageElement);
                document.body.appendChild(loadingElement);
            } else {
                // Update existing loading message if needed
                const messageElement = document.getElementById('loading-message');
                if (messageElement) {
                    messageElement.textContent = message;
                }
                loadingElement.style.display = 'flex';
            }
        } else if (loadingElement) {
            // Hide loading overlay
            loadingElement.style.display = 'none';
        }
    }
    
    /**
     * Get the last viewed page from localStorage
     * @returns {string} The name of the last viewed page, or 'import' if not set
     */
    getLastView() {
        try {
            return localStorage.getItem('currentView') || 'import';
        } catch (e) {
            console.warn('Could not read view from localStorage:', e);
            return 'import';
        }
    }
}

// Export the UIManager class as a named export
module.exports = { UIManager };

},{}],10:[function(require,module,exports){
class VersionManager {
    constructor() {
        this.version = '1.1.2'; // Update this with each new version
        console.log(`Version Manager initialized with version ${this.version}`);
    }

    getVersion() {
        return this.version;
    }

    getFormattedVersion() {
        return `v${this.version}`;
    }

    updateTitle() {
        // Update the main title
        const title = document.querySelector('h1');
        if (title) {
            // Remove any existing version number
            const baseTitle = title.textContent.replace(/\s*\(v\d+\.\d+\.\d+\)\s*$/, '').trim();
            title.textContent = `${baseTitle} (${this.getFormattedVersion()})`;
        }

        // Update the document title
        document.title = `PingOne User Import ${this.getFormattedVersion()}`;

        // Update the import button text
        this.updateImportButton();

        // Add version badge to the UI
        this.addVersionBadge();
    }
    
    updateImportButton() {
        const importButton = document.getElementById('start-import-btn');
        if (importButton) {
            const baseText = importButton.textContent.replace(/\s*\(v\d+\.\d+\.\d+\)\s*$/, '').trim();
            importButton.innerHTML = `<i class="pi pi-upload"></i> ${baseText} (${this.getFormattedVersion()})`;
        }
    }

    addVersionBadge() {
        // Check if badge already exists
        if (document.getElementById('version-badge')) {
            return;
        }

        // Create version badge
        const badge = document.createElement('div');
        badge.id = 'version-badge';
        badge.textContent = this.getFormattedVersion();
        badge.style.position = 'fixed';
        badge.style.bottom = '10px';
        badge.style.right = '10px';
        badge.style.backgroundColor = '#333';
        badge.style.color = 'white';
        badge.style.padding = '2px 6px';
        badge.style.borderRadius = '3px';
        badge.style.fontSize = '12px';
        badge.style.fontFamily = 'monospace';
        badge.style.zIndex = '1000';
        
        document.body.appendChild(badge);
    }
}

module.exports = VersionManager;

},{}]},{},[1]);
