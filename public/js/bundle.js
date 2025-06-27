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
            
            // Show the last viewed page or default to 'import'
            const lastView = this.uiManager.getLastView();
            this.uiManager.showView(lastView);
            
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
                this.logger.log('Found previously loaded file. Restoring...', 'info');
                
                // Create a dummy file to represent the previously loaded file
                const file = new File(
                    [''], // Empty content since we can't restore the actual content
                    this.fileHandler.lastFileInfo.name,
                    {
                        type: this.fileHandler.lastFileInfo.type || 'text/csv',
                        lastModified: this.fileHandler.lastFileInfo.lastModified || Date.now()
                    }
                );
                
                // Update file info in the UI
                this.fileHandler.updateFileInfo(file);
                
                // Process the file
                this.uiManager.setImportButtonState(false, 'Processing...');
                
                try {
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
                        this.logger.log(`Restored ${rows.length} users from previous session`, 'success');
                    } else {
                        this.uiManager.setImportButtonState(false, 'No Valid Data');
                        this.logger.warn('No valid user data found in the restored file');
                    }
                } catch (error) {
                    this.logger.error(`Error processing restored file: ${error.message}`);
                    this.uiManager.setImportButtonState(false, 'Error Processing File');
                    this.fileHandler.clearFileInfo();
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
            
            // Import users one by one
            for (let i = 0; i < rows.length; i++) {
                if (this.currentImportAbortController.signal.aborted) {
                    this.logger.log('Import cancelled by user', 'warning');
                    break;
                }
                
                const user = rows[i];
                const currentIndex = i + 1;
                const currentProcessed = successfulImports + failedImports + skippedUsers + 1;
                
                try {
                    // Check if user already exists
                    const userExists = await this.pingOneAPI.userExists(user.email);
                    
                    if (userExists) {
                        // Skip existing users
                        skippedUsers++;
                        this.logger.log(`Skipping existing user: ${user.email} (${currentIndex}/${totalUsers})`, 'info');
                        // Update progress with skipped count
                        this.uiManager.updateImportProgress(
                            currentProcessed,
                            totalUsers,
                            `Skipped existing user: ${user.email} (${skippedUsers} skipped)`,
                            {
                                success: successfulImports,
                                failed: failedImports,
                                skipped: skippedUsers
                            }
                        );
                        continue;
                    }
                    
                    // Update progress with current counts
                    this.uiManager.updateImportProgress(
                        currentProcessed,
                        totalUsers,
                        `Importing user ${currentProcessed} of ${totalUsers}: ${user.email}`,
                        {
                            success: successfulImports,
                            failed: failedImports,
                            skipped: skippedUsers
                        }
                    );
                    
                    // Import the user
                    await this.pingOneAPI.importUsers([user], {
                        signal: this.currentImportAbortController.signal,
                        skipExisting: true // Just in case, though we already checked
                    });
                    
                    successfulImports++;
                    this.logger.log(`Imported user: ${user.email} (${currentProcessed}/${totalUsers})`, 'success');
                    
                } catch (error) {
                    failedImports++;
                    const errorMsg = `Error importing user ${user.email}: ${error.message}`;
                    this.logger.error(errorMsg);
                    // Continue with next user even if one fails
                }
                
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 200));
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
                    this.previewContainer.innerHTML = `
                        <div class="preview-header">
                            <h3>File Preview (first 100 characters)</h3>
                        </div>
                        <div class="preview-content">
                            <pre>${content.substring(0, 100)}</pre>
                        </div>
                    `;
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
        this.logger.log(`Processing file: ${file.name}`, 'info');
        
        // Save file info for persistence
        this.saveFileInfo(file);
        
        // Update UI with file info
        this.updateFileInfo(file);
        
        // Show loading state for preview
        if (this.uiManager.previewContainer) {
            this.uiManager.previewContainer.innerHTML = `
                <div class="loading">
                    <div class="spinner"></div>
                    <div>Processing file...</div>
                </div>`;
        }
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (event) => {
                try {
                    const text = event.target.result;
                    const lines = text.split('\n').filter(line => line.trim() !== '');
                    
                    if (lines.length < 2) {
                        throw new Error('CSV file must contain at least one data row');
                    }
                    
                    // Parse headers and normalize them
                    const headers = this.parseCSVLine(lines[0]).map(h => h.trim());
                    
                    // Define required fields and their aliases
                    const fieldMapping = {
                        'username': 'username',
                        'email': 'email',
                        'firstname': 'firstName',
                        'first name': 'firstName',
                        'first_name': 'firstName',
                        'lastname': 'lastName',
                        'last name': 'lastName',
                        'last_name': 'lastName',
                        'password': 'password',
                        'active': 'active',
                        'enabled': 'active'
                    };
                    
                    // Normalize headers
                    const normalizedHeaders = headers.map(header => {
                        const lowerHeader = header.toLowerCase();
                        return fieldMapping[lowerHeader] || header;
                    });
                    
                    // Check if email column exists
                    if (!normalizedHeaders.includes('email')) {
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
                            
                            // Map values to normalized headers
                            normalizedHeaders.forEach((header, index) => {
                                if (values[index] !== undefined) {
                                    let value = values[index] ? values[index].trim() : '';
                                    
                                    // Convert string 'true'/'false' to boolean for active field
                                    if (header === 'active') {
                                        value = value.toLowerCase() === 'true';
                                    }
                                    
                                    row[header] = value;
                                }
                            });
                            
                            // Skip rows without email (required field)
                            if (!row.email || row.email.trim() === '') {
                                this.logger.warn(`Skipping row ${lineNumber}: Missing email address`);
                                lineNumber++;
                                continue;
                            }
                            
                            // Validate required fields for PingOne
                            const requiredFields = ['email', 'username'];
                            const missingFields = requiredFields.filter(field => !row[field]);
                            
                            if (missingFields.length > 0) {
                                this.logger.warn(`Skipping row ${lineNumber}: Missing required fields - ${missingFields.join(', ')}`);
                                lineNumber++;
                                continue;
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
                            
                            // Format user data for PingOne API
                            const userData = {
                                username: row.username,
                                email: row.email,
                                name: {
                                    given: row.firstName || '',
                                    family: row.lastName || ''
                                },
                                password: row.password,
                                enabled: row.active !== false // Default to true if not specified
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
                        throw new Error('No valid user records found in the file');
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
                // Clear saved file info on error
                this.clearFileInfo();
                reject(new Error(`Error reading file: ${error.message}`));
            };
            
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
                } else {
                    inQuotes = !inQuotes;
                    i++;
                }
            } else if (char === delimiter && !inQuotes) {
                // End of field
                values.push(currentValue);
                currentValue = '';
                i++;
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
     * Process a CSV file with validation and detailed reporting
     * @param {File} file - The CSV file to process
     * @returns {Promise<{headers: Array<string>, rows: Array<Object>, validation: Object}>} - Processed and validated data
     */
    async processCSV(file) {
        this.validationResults = {
            total: 0,
            valid: 0,
            errors: 0,
            warnings: 0,
            details: []
        };
        
        if (!file) {
            throw new Error('No file provided');
        }

        this.logger.log(`Processing file: ${file.name} (${this.formatFileSize(file.size)})`, 'info');
        this.uiManager.showLoading(true, 'Reading file...');

        try {
            // Read the file as text
            const text = await this.readFileAsText(file);
            
            // Parse CSV text to JSON
            const { headers, rows } = this.parseCSV(text);
            this.validationResults.total = rows.length;
            
            this.logger.log(`Successfully parsed ${rows.length} rows with ${headers.length} columns`, 'success');
            
            // Validate each row
            rows.forEach((row, index) => {
                const validation = this.validateUser(row, headers);
                const rowNum = index + 2; // +2 because of 1-based index and header row
                
                if (validation.valid) {
                    this.validationResults.valid++;
                    this.logger.log(`✓ Row ${rowNum}: Valid user data`, 'success');
                } else {
                    this.validationResults.errors++;
                    this.logger.error(`✗ Row ${rowNum}: ${validation.errors.join('; ')}`);
                }
                
                if (validation.warnings.length > 0) {
                    this.validationResults.warnings += validation.warnings.length;
                    validation.warnings.forEach(warning => {
                        this.logger.warn(`! Row ${rowNum}: ${warning}`);
                    });
                }
                
                // Store validation details
                this.validationResults.details.push({
                    row: rowNum,
                    valid: validation.valid,
                    errors: validation.errors,
                    warnings: validation.warnings,
                    data: row
                });
            });
            
            // Log summary
            this.logger.log('\n=== Validation Complete ===', 'info');
            this.logger.log(`Total rows: ${this.validationResults.total}`, 'info');
            this.logger.log(`Valid rows: ${this.validationResults.valid}`, this.validationResults.valid === this.validationResults.total ? 'success' : 'info');
            
            if (this.validationResults.errors > 0) {
                this.logger.error(`Rows with errors: ${this.validationResults.errors}`);
            }
            
            if (this.validationResults.warnings > 0) {
                this.logger.warn(`Total warnings: ${this.validationResults.warnings}`);
            }
            
            return { 
                headers, 
                rows,
                validation: this.validationResults
            };
            
        } catch (error) {
            this.logger.error(`Error processing CSV: ${error.message}`);
            throw error;
        } finally {
            this.uiManager.showLoading(false);
        }
    }

    /**
     * Read a file as text
     * @param {File} file - The file to read
     * @returns {Promise<string>} - The file contents as text
     */
    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (event) => {
                resolve(event.target.result);
            };
            
            reader.onerror = (error) => {
                reject(new Error(`Error reading file: ${error.message}`));
            };
            
            reader.readAsText(file);
        });
    }

    /**
     * Parse CSV text into headers and rows
     * @param {string} csvText - The CSV text to parse
     * @returns {{headers: Array<string>, rows: Array<Object>}} - Parsed data
     */
    parseCSV(csvText) {
        // Split into lines and filter out empty lines
        const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
        
        if (lines.length === 0) {
            throw new Error('CSV file is empty');
        }

        // Parse headers (first line)
        const headers = this.parseCSVLine(lines[0]);
        
        // Parse data rows
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            const row = {};
            
            // Map values to headers
            headers.forEach((header, index) => {
                row[header] = values[index] || '';
            });
            
            rows.push(row);
        }
        
        return { headers, rows };
    }

    /**
     * Parse a single CSV line, handling quoted values and commas within quotes
     * @param {string} line - The CSV line to parse
     * @returns {Array<string>} - Array of values
     */
    parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;
        let escapeNext = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (escapeNext) {
                current += char;
                escapeNext = false;
                continue;
            }
            
            if (char === '\\') {
                escapeNext = true;
                continue;
            }
            
            if (char === '"') {
                if (i + 1 < line.length && line[i + 1] === '"' && inQuotes) {
                    // Handle escaped quote inside quoted field
                    current += '"';
                    i++; // Skip the next quote
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        // Add the last value
        values.push(current);
        
        // Trim whitespace from non-quoted values
        return values.map((val, index) => {
            // Only trim if the value wasn't quoted (doesn't start with a quote)
            if (val.length > 0 && val[0] !== '"') {
                return val.trim();
            }
            return val;
        });
    }

    /**
     * Format file size in human-readable format
     * @param {number} bytes - File size in bytes
     * @returns {string} - Formatted file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Validate CSV structure before import
     * @param {Array<string>} headers - CSV headers
     * @param {Array<Object>} rows - CSV rows
     * @returns {{valid: boolean, errors: Array<string>}} - Validation result
     */
    validateCSV(headers, rows) {
        const errors = [];
        
        // Check for required columns (customize based on your requirements)
        const requiredColumns = ['email', 'givenName', 'surname'];
        const missingColumns = requiredColumns.filter(col => !headers.includes(col));
        
        if (missingColumns.length > 0) {
            errors.push(`Missing required columns: ${missingColumns.join(', ')}`);
        }
        
        // Validate each row
        rows.forEach((row, index) => {
            // Check for required fields
            requiredColumns.forEach(col => {
                if (!row[col] || row[col].trim() === '') {
                    errors.push(`Row ${index + 2}: Missing required value for '${col}'`);
                }
            });
            
            // Validate email format if email column exists
            if (row.email && !this.isValidEmail(row.email)) {
                errors.push(`Row ${index + 2}: Invalid email format '${row.email}'`);
            }
        });
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
    
    /**
     * Simple email validation
     * @param {string} email - Email to validate
     * @returns {boolean} - True if email is valid
     */
    isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(String(email).toLowerCase());
    }
    
    /**
     * Get file extension from filename
     * @param {string} filename - The filename to get extension from
     * @returns {string} The file extension (without dot) or empty string if no extension
     */
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
        if (Object.keys(data).length > 0) {
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
    
    async log(message, level = 'info', data = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = { message, level, data, timestamp };
        
        this.logs.push(logEntry);
        
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }
        
        const consoleMethod = console[level] || console.log;
        if (typeof message === 'string') {
            consoleMethod(`[${level.toUpperCase()}] ${message}`, data);
        } else {
            consoleMethod(message, data);
        }
        
        if (this.fileLogger) {
            try {
                await this.fileLogger.log(level, message, data);
            } catch (error) {
                console.error('Error logging to file:', error);
                if (!this.isOnline) {
                    this.offlineLogs.push({ level, message, data });
                }
            }
        }
        
        if (this.logContainer) {
            this.renderLogs();
        }
        
        return logEntry;
    }
    
    renderLogs() {
        if (!this.logContainer) return;
        
        this.logContainer.innerHTML = '';
        
        this.logs.forEach(entry => {
            const logElement = document.createElement('div');
            logElement.className = `log-entry log-${entry.level}`;
            logElement.innerHTML = `
                <span class="log-timestamp">${new Date(entry.timestamp).toLocaleString()}</span>
                <span class="log-level ${entry.level}">${entry.level.toUpperCase()}</span>
                <span class="log-message">${entry.message}</span>
            `;
            
            if (entry.data && Object.keys(entry.data).length > 0) {
                const dataElement = document.createElement('pre');
                dataElement.className = 'log-data';
                dataElement.textContent = JSON.stringify(entry.data, null, 2);
                logElement.appendChild(dataElement);
            }
            
            this.logContainer.appendChild(logElement);
        });
        
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
            const requestContentType = options.contentType || 'application/json';
            
            // Make the request to our proxy
            const headers = {
                'Accept': 'application/json',
                ...options.headers
            };
            
            // Prepare the request body
            let requestBody = null;
            if (data) {
                // Set Content-Type header based on the content type
                headers['Content-Type'] = requestContentType;
                
                // For user import, we need to send the exact JSON string without additional processing
                if (requestContentType === 'application/vnd.pingone.import.users+json') {
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
                let responseText = '';
                
                try {
                    // First try to get the response as text
                    responseText = await response.text();
                    
                    // Try to parse as JSON if possible
                    if (responseText) {
                        try {
                            const errorData = JSON.parse(responseText);
                            errorMessage = errorData.error || errorData.message || errorMessage;
                            errorDetails = errorData;
                            
                            // For 400 Bad Request, include validation errors if available
                            if (response.status === 400 && errorData.details) {
                                errorMessage += ': ' + JSON.stringify(errorData.details);
                            }
                        } catch (e) {
                            // If not JSON, use the raw text as the error message
                            errorMessage += `: ${responseText}`;
                        }
                    }
                } catch (e) {
                    // If we can't get the response text, just use the status
                    console.error('Error reading error response:', e);
                }
                
                const error = new Error(errorMessage);
                error.status = response.status;
                error.details = errorDetails || responseText;
                throw error;
            }
            
            // For successful responses, handle based on content type
            const responseContentType = response.headers.get('content-type') || '';
            
            // For user import endpoint, we expect a JSON response
            if (responseContentType.includes('application/json') || endpoint.includes('/users/import')) {
                try {
                    const responseData = await response.json();
                    return responseData;
                } catch (e) {
                    // If we can't parse as JSON, try to get the text
                    const text = await response.text().catch(() => '');
                    console.error('Failed to parse JSON response:', e, 'Response text:', text);
                    throw new Error(`Invalid JSON response: ${e.message}`);
                }
            } 
            // For text responses
            else if (contentType.includes('text/')) {
                return await response.text();
            }
            // For empty responses
            else if (response.status === 204) {
                return {};
            }
            // For other content types, return as array buffer
            return await response.arrayBuffer();
            
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
        const { apiClientId, apiSecret, environmentId } = this.settings;
        const requestId = `req_${Math.random().toString(36).substr(2, 9)}`;
        
        // Log the environment for debugging
        const envInfo = {
            requestId,
            hasClientId: !!apiClientId,
            clientIdPrefix: apiClientId ? `${apiClientId.substring(0, 4)}...` : 'none',
            hasSecret: !!apiSecret,
            hasEnvId: !!environmentId,
            envId: environmentId || 'none',
            timestamp: new Date().toISOString()
        };
        
        if (!apiClientId || !apiSecret || !environmentId) {
            const error = new Error('Missing required API credentials in settings');
            this.logger.error('Token request failed: Missing credentials', envInfo);
            throw error;
        }

        const tokenUrl = `https://auth.pingone.com/${environmentId}/as/token`;
        
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
                    this.scrollLogsToBottom();
                    await this.loadAndDisplayLogs();
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

        // Show loading indicator
        const loadingElement = document.createElement('div');
        loadingElement.id = 'logs-loading';
        loadingElement.textContent = 'Loading logs...';
        loadingElement.style.padding = '1rem';
        loadingElement.style.textAlign = 'center';
        loadingElement.style.color = '#';
        
        const logEntries = this.logsView.querySelector('.log-entries');
        if (logEntries) {
            logEntries.innerHTML = '';
            logEntries.appendChild(loadingElement);
        }
        
        try {
            // Fetch logs from the UI logs endpoint
            const response = await fetch('/api/logs/ui?limit=200');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const responseData = await response.json();
            console.log('UI logs response:', {
                success: responseData.success,
                count: responseData.count,
                total: responseData.total
            });
            
            // Process logs
            if (this.logger) {
                this.logger.clearLogs();
                
                if (responseData.success === true && Array.isArray(responseData.logs)) {
                    // Process logs in reverse chronological order
                    const logsToProcess = [...responseData.logs].reverse();
                    logsToProcess.forEach((log, index) => {
                        try {
                            if (log && typeof log === 'object') {
                                this.logger._log(
                                    String(log.level || 'info').toLowerCase(),
                                    String(log.message || 'No message'),
                                    typeof log.data === 'object' ? log.data : {}
                                );
                            } else {
                                console.warn(`Skipping invalid log entry at index ${index}:`, log);
                            }
                        } catch (logError) {
                            console.error(`Error processing log entry at index ${index}:`, logError);
                        }
                    });
                } else {
                    console.warn('No valid log entries found in response');
                }
            }
        } catch (error) {
            console.error('Error fetching logs:', error);
            
            // Show error message in the UI
            const errorElement = document.createElement('div');
            errorElement.className = 'log-entry error';
            errorElement.textContent = `Error loading logs: ${error.message}`;
            
            if (logEntries) {
                logEntries.innerHTML = '';
                logEntries.appendChild(errorElement);
            }
        } finally {
            // Remove loading indicator
            const loadingElement = document.getElementById('logs-loading');
            if (loadingElement) {
                loadingElement.remove();
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
        this.version = '1.0.6'; // Update this with each new version
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
