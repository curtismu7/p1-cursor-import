// Main application entry point
import { Logger } from './modules/logger.js';
import { UIManager } from './modules/ui-manager.js';
import { FileHandler } from './modules/file-handler.js';
import { SettingsManager } from './modules/settings-manager.js';
import { apiFactory, initAPIFactory } from './modules/api-factory.js';
import { VersionManager } from './modules/version-manager.js';

class App {
    constructor() {
        // Initialize logger with the log container
        const logContainer = document.getElementById('logs-container');
        this.logger = new Logger(logContainer);
        
        // Initialize settings manager first as it's used by other components
        this.settingsManager = new SettingsManager(this.logger);
        
        // Initialize API factory with required dependencies
        const factory = initAPIFactory(this.logger, this.settingsManager);
        
        // Initialize API clients
        this.pingOneClient = factory.getPingOneClient();
        this.localClient = factory.getLocalClient();
        
        // Initialize other components
        this.uiManager = new UIManager(this.logger);
        this.fileHandler = new FileHandler(this.logger, this.uiManager);
        
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
            this.logger.fileLogger.info('Application starting...');
            this.logger.fileLogger.debug('Logger initialized');
            this.logger.fileLogger.info('Initializing UI components');
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Check settings and restore previous file if available
            await this.checkSettingsAndRestore();
            
            this.logger.fileLogger.info('Application initialization complete');
        } catch (error) {
            this.logger.fileLogger.error('Error initializing application', { error: error.message });
            console.error('Initialization error:', error);
        }
    }
    
    setupEventListeners() {
        // Listen for file selection events
        window.addEventListener('fileSelected', (event) => {
            this.handleFileSelect(event.detail);
        });
        
        // Listen for settings form submission
        const settingsForm = document.getElementById('settings-form');
        if (settingsForm) {
            settingsForm.addEventListener('submit', async (e) => {
                try {
                    console.log('Settings form submit event triggered');
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Get form data
                    const formData = new FormData(settingsForm);
                    const settings = {
                        environmentId: formData.get('environment-id'),
                        apiClientId: formData.get('api-client-id'),
                        apiSecret: formData.get('api-secret'),
                        populationId: formData.get('population-id'),
                        region: formData.get('region')
                    };
                    
                    console.log('Saving settings:', settings);
                    
                    // Save settings
                    await this.handleSaveSettings(settings);
                    
                    // Show success message
                    this.uiManager.showNotification('Settings saved successfully', 'success');
                    
                } catch (error) {
                    console.error('Error in settings form submission:', error);
                    this.uiManager.showNotification(`Error: ${error.message}`, 'error');
                }
                
                return false; // Prevent form submission
            });
            
            // Also prevent any button clicks from submitting the form traditionally
            const saveButton = settingsForm.querySelector('button[type="submit"]');
            if (saveButton) {
                saveButton.addEventListener('click', (e) => {
                    if (e) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                    settingsForm.dispatchEvent(new Event('submit'));
                    return false;
                });
            }
        }
        
        // Listen for settings save events (for programmatic saves)
        window.addEventListener('saveSettings', (event) => {
            this.handleSaveSettings(event.detail);
        });
        
        // Listen for clear logs events
        window.addEventListener('clearLogs', () => {
            this.logger.clear();
        });
        
        // Listen for test connection events
        window.addEventListener('testConnection', () => {
            this.testPingOneConnection();
        });
        
        // Set up import button click handler
        const importButton = document.getElementById('start-import-btn');
        if (importButton) {
            importButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.startImport();
            });
        }
        
        // Listen for import events (for programmatic triggering)
        window.addEventListener('startImport', () => {
            this.startImport();
        });
        
        // Listen for cancel import events
        window.addEventListener('cancelImport', () => {
            this.cancelImport();
        });
    }
    
    async handleSaveSettings(settings) {
        try {
            console.log('handleSaveSettings called with:', settings);
            this.logger.fileLogger.info('Saving settings', settings);
            
            // Show saving status
            this.uiManager.updateConnectionStatus('connecting', 'Saving settings...', false);
            
            try {
                // Save settings using the local API client
                const response = await this.localClient.post('/api/settings', settings);
                console.log('Settings saved successfully:', response);
                
                // Update settings in the settings manager
                this.settingsManager.updateSettings(settings);
                
                // Update API clients with new settings
                this.pingOneClient = apiFactory.getPingOneClient(this.logger, this.settingsManager);
                
                // Update connection status
                this.uiManager.updateConnectionStatus('connected', 'Settings saved successfully', false);
                
                // Show success notification
                if (this.uiManager.showNotification) {
                    this.uiManager.showNotification('Settings saved successfully', 'success');
                }
                
                // Test the connection with new settings
                try {
                    await this.testPingOneConnection();
                } catch (error) {
                    // Connection test failed, but settings were still saved
                    console.warn('Connection test after save failed:', error);
                    this.logger.fileLogger.warn('Connection test after save failed', { error: error.message });
                    this.uiManager.showNotification('Settings saved but connection test failed', 'warning');
                }
                
                this.logger.fileLogger.info('Settings saved successfully');
                return { success: true };
                
            } catch (error) {
                console.error('Error in handleSaveSettings:', error);
                const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
                this.logger.fileLogger.error('Error saving settings', { error: errorMessage });
                
                // Update connection status to show error
                this.uiManager.updateConnectionStatus('error', `Error: ${errorMessage}`, false);
                
                // Show error notification
                if (this.uiManager.showNotification) {
                    this.uiManager.showNotification(`Error: ${errorMessage}`, 'error');
                }
                
                return { success: false, error: errorMessage };
            }
        } catch (error) {
            console.error('Unexpected error in handleSaveSettings:', error);
            const errorMessage = error.message || 'An unexpected error occurred';
            
            // Show error notification
            if (this.uiManager.showNotification) {
                this.uiManager.showNotification(`Error: ${errorMessage}`, 'error');
            }
            
            return { success: false, error: errorMessage };
        }
    }
    
    async testPingOneConnection() {
        try {
            this.logger.fileLogger.info('Testing PingOne connection');
            
            // Show connecting status in UI
            this.uiManager.updateConnectionStatus('connecting', 'Connecting to PingOne...');
            
            // Test connection by getting the access token
            const token = await this.pingOneClient.getAccessToken();
            
            if (token) {
                // Save the token to localStorage
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem('pingone_worker_token', token);
                    // Set token expiry (1 hour from now)
                    const expiryTime = Date.now() + (60 * 60 * 1000);
                    localStorage.setItem('pingone_token_expiry', expiryTime.toString());
                }
                
                this.logger.fileLogger.info('Successfully connected to PingOne API');
                
                // Update connection status in settings
                const settings = this.settingsManager.getSettings();
                settings.connectionStatus = 'connected';
                settings.connectionMessage = 'Connected';
                settings.lastConnectionTest = new Date().toISOString();
                
                // Save updated settings
                await this.saveSettings(settings);
                
                // Update UI status
                this.uiManager.updateConnectionStatus('connected', 'Connected to PingOne');
                
                return { success: true };
            } else {
                throw new Error('No access token received');
            }
        } catch (error) {
            this.logger.fileLogger.error('Failed to connect to PingOne', { error: error.message });
            
            // Update connection status in settings
            const settings = this.settingsManager.getSettings();
            settings.connectionStatus = 'disconnected';
            settings.connectionMessage = error.message || 'Connection failed';
            settings.lastConnectionTest = new Date().toISOString();
            
            // Save updated settings
            await this.saveSettings(settings);
            
            // Update UI status
            this.uiManager.updateConnectionStatus('error', error.message || 'Connection failed');
            
            return { success: false, error: error.message };
        }
    }
    
    async startImport() {
        if (this.isImporting) {
            this.logger.fileLogger.warn('Import already in progress');
            return;
        }
        
        try {
            this.isImporting = true;
            this.currentImportAbortController = new AbortController();
            
            // Get users from file handler
            const file = this.fileHandler.getCurrentFile();
            const users = this.fileHandler.getUsers();
            
            if (!users || users.length === 0) {
                throw new Error('No users to import');
            }
            
            this.logger.fileLogger.info('Starting import process', { 
                fileName: file ? file.name : 'unknown', 
                userCount: users.length 
            });
            
            // Show import status in UI
            this.uiManager.showImportStatus(users.length);
            
            // Prepare users for import
            const usersToImport = users.map((user, index) => ({
                ...user,
                // Add any additional user properties here
                _index: index // Track original position for progress updates
            }));
            
            // Track import results
            let importResult = {
                success: 0,
                failed: 0,
                skipped: 0
            };
            
            // Import users using the PingOne client
            const result = await this.pingOneClient.importUsers(usersToImport, {
                signal: this.currentImportAbortController.signal,
                continueOnError: true, // Continue on error to import remaining users
                onProgress: (processed, total, currentUser, counts = {}) => {
                    // Update our result counts if provided
                    if (counts) {
                        importResult = {
                            success: counts.success || importResult.success,
                            failed: counts.failed || importResult.failed,
                            skipped: counts.skipped || importResult.skipped
                        };
                    }
                    
                    // Update progress in the UI
                    const status = currentUser 
                        ? `Importing ${currentUser.email || 'user'}` 
                        : `Processing batch ${Math.ceil(processed / 5)} of ${Math.ceil(total / 5)}...`;
                    
                    this.uiManager.updateImportProgress(
                        processed, 
                        total, 
                        status,
                        importResult
                    );
                }
            });
            
            this.logger.fileLogger.info('Import completed', { 
                imported: result.success, 
                failed: result.failed,
                skipped: result.skipped
            });
            
            // Final progress update
            this.uiManager.updateImportProgress(
                users.length, 
                users.length, 
                `Import completed: ${result.success} succeeded, ${result.failed} failed, ${result.skipped} skipped`, 
                {
                    success: result.success,
                    failed: result.failed,
                    skipped: result.skipped
                }
            );
            
            return result;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                this.logger.fileLogger.info('Import canceled by user');
                this.uiManager.updateImportProgress(0, 1, 'Import canceled', { success: 0, failed: 0, skipped: 0 });
            } else {
                this.logger.fileLogger.error('Import failed', { error: error.message });
                console.error('Import error:', error);
                this.uiManager.updateImportProgress(0, 1, `Error: ${error.message}`, { success: 0, failed: 0, skipped: 0 });
            }
            throw error;
        } finally {
            this.isImporting = false;
            this.currentImportAbortController = null;
            this.uiManager.setImporting(false);
        }
    }
    
    cancelImport() {
        if (this.currentImportAbortController) {
            this.currentImportAbortController.abort();
            this.logger.fileLogger.info('Canceling import');
        }
    }
    
    async handleFileSelect(file) {
        try {
            this.logger.fileLogger.debug('File selected', { fileName: file.name, fileSize: file.size });
            
            // Process the file using the file handler
            const result = await this.fileHandler.processCSV(file);
            
            if (result.success) {
                this.logger.fileLogger.info('File processed successfully', { rows: result.count });
                
                // Enable import button if we have users and settings are valid
                this.checkSettings();
            } else {
                throw new Error(result.error || 'Failed to process file');
            }
        } catch (error) {
            this.logger.fileLogger.error('Error processing file', { error: error.message });
            console.error('File processing error:', error);
        }
    }
    
    async checkSettings() {
        try {
            const settings = this.settingsManager.getSettings();
            const hasRequiredSettings = settings.environmentId && settings.region;
            const users = this.fileHandler.getUsers ? this.fileHandler.getUsers() : [];
            const hasUsers = Array.isArray(users) && users.length > 0;

            // Enable Import button only if both users and settings are valid
            const enableImport = hasRequiredSettings && hasUsers;
            this.uiManager.setImportButtonState(enableImport);

            // Optionally update UI for settings status
            this.uiManager.updateSettingsStatus(hasRequiredSettings);

            return enableImport;
        } catch (error) {
            this.logger.fileLogger.error('Error saving settings', { error: error.message });
            this.uiManager.setImportButtonState(false);
            return false;
        }
    }
    
    /**
     * Populate the settings form with the provided settings
     * @param {Object} settings - The settings to populate the form with
     */
    populateSettingsForm(settings) {
        try {
            console.log('Starting to populate settings form with:', settings);
            
            if (!settings) {
                console.warn('No settings provided to populateSettingsForm');
                return;
            }
            
            // Set text inputs with fallback to empty string if undefined
            const fields = {
                'environment-id': settings.environmentId || settings['environment-id'] || '',
                'api-client-id': settings.apiClientId || settings['api-client-id'] || '',
                'api-secret': settings.apiSecret || settings['api-secret'] || '',
                'population-id': settings.populationId || settings['population-id'] || ''
            };
            
            // Set each field
            for (const [id, value] of Object.entries(fields)) {
                const element = document.getElementById(id);
                if (element) {
                    // For API secret, only set if it's not empty (to avoid showing placeholder text as actual value)
                    if (id === 'api-secret' && !value) {
                        console.log(`Skipping empty API secret`);
                        continue;
                    }
                    
                    element.value = value;
                    console.log(`Set ${id} to:`, value ? (id.includes('secret') ? '***' : value) : '(empty)');
                } else {
                    console.warn(`Element not found: ${id}`);
                }
            }
            
            // Handle region dropdown - default to NorthAmerica if not set
            const regionSelect = document.getElementById('region');
            if (regionSelect) {
                // Get the region value, trying both camelCase and kebab-case versions
                let regionValue = settings.region || settings['region'] || 'NorthAmerica';
                console.log('Raw region value:', regionValue);
                
                // Normalize the region value (remove spaces and make lowercase)
                const normalizedRegion = regionValue.replace(/\s+/g, '').toLowerCase();
                console.log('Normalized region:', normalizedRegion);
                
                // Find and select the matching option
                let found = false;
                for (const option of regionSelect.options) {
                    const optionValue = option.value.toLowerCase();
                    if (optionValue === normalizedRegion) {
                        option.selected = true;
                        found = true;
                        console.log('Set region to:', option.value);
                        break;
                    }
                }
                
                if (!found) {
                    console.warn(`Region '${regionValue}' not found in dropdown, defaulting to NorthAmerica`);
                    console.log('Available regions:', Array.from(regionSelect.options).map(o => o.value));
                    
                    // Set default to NorthAmerica if the region is not found
                    for (const option of regionSelect.options) {
                        if (option.value.toLowerCase() === 'northamerica') {
                            option.selected = true;
                            console.log('Defaulted region to NorthAmerica');
                            break;
                        }
                    }
                }
            } else {
                console.warn('Region select element not found');
            }
            
            // Update the connection status display
            const statusElement = document.getElementById('settings-connection-status');
            if (statusElement) {
                const status = (settings.connectionStatus || 'disconnected').toLowerCase();
                const message = settings.connectionMessage || 'Not connected';
                
                // Update status class
                statusElement.className = `connection-status status-${status}`;
                
                // Update status icon and message
                const iconMap = {
                    'connected': '✅',
                    'disconnected': '⚠️',
                    'error': '❌'
                };
                
                const statusIcon = statusElement.querySelector('.status-icon');
                if (statusIcon) {
                    statusIcon.textContent = iconMap[status] || 'ℹ️';
                }
                
                const statusMessage = statusElement.querySelector('.status-message');
                if (statusMessage) {
                    statusMessage.textContent = message;
                }
            }
            
            console.log('Finished populating settings form');
            this.logger.fileLogger.debug('Settings form populated');
        } catch (error) {
            const errorMessage = `Error populating settings form: ${error.message}`;
            this.logger.fileLogger.error(errorMessage, { error: error.message });
            console.error('Error details:', error);
        }
    }
    
    async checkSettingsAndRestore() {
        try {
            console.log('1. Starting checkSettingsAndRestore');
            this.logger.log('Attempting to load settings from API...', 'debug');
            
            // Load settings from the local API
            console.log('2. Fetching settings from /api/settings');
            const response = await this.localClient.get('/api/settings');
            console.log('3. Settings API response:', response);
            
            if (response && response.data) {
                const settings = response.data;
                console.log('4. Settings data received:', settings);
                
                console.log('5. Saving settings to settings manager');
                await this.settingsManager.saveSettings(settings);
                this.logger.log('Settings restored and saved', 'info');
                
                // Populate the settings form
                console.log('6. About to populate settings form with:', settings);
                if (typeof this.populateSettingsForm === 'function') {
                    console.log('7. populateSettingsForm is a function, calling it');
                    this.populateSettingsForm(settings);
                } else {
                    console.error('7. ERROR: populateSettingsForm is not a function on this object');
                    console.log('Available methods on app:', Object.getOwnPropertyNames(Object.getPrototypeOf(this)));
                }
                
                // Check if we have a previous file to restore
                if (settings.lastProcessedFile) {
                    this.logger.log('Restoring previous file...', 'info');
                    // Here you would add logic to restore the previous file
                    // This would depend on how you're handling file persistence
                }
            } else {
                console.warn('No settings data in response:', response);
                this.logger.warn('No settings data received from server', 'warning');
            }
            
            // Update UI based on settings
            console.log('8. Calling checkSettings');
            await this.checkSettings();
            
        } catch (error) {
            const errorMessage = error.message || 'Unknown error';
            console.error('ERROR in checkSettingsAndRestore:', error);
            console.error('Error stack:', error.stack);
            this.logger.warn(`Error loading settings: ${errorMessage}`, 'warning');
        }
    }
}

// Initialize the application when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    console.log(`PingOne Import Tool ${app.versionManager.getFormattedVersion()} initialized`);
    
    // Expose app to window for debugging and global access
    window.app = app;
});
