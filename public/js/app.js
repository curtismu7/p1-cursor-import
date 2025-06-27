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
