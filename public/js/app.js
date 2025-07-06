// Main application entry point
import { Logger } from './modules/logger.js';
import { UIManager } from './modules/ui-manager.js';
import { FileHandler } from './modules/file-handler.js';
import { SettingsManager } from './modules/settings-manager.js';
import { apiFactory, initAPIFactory } from './modules/api-factory.js';
import { VersionManager } from './modules/version-manager.js';

class App {
    constructor() {
        try {
            // Initialize logger with the log container
            const logContainer = document.getElementById('logs-container');
            this.logger = new Logger(logContainer);
            
            // Initialize settings manager first as it's used by other components
            this.settingsManager = new SettingsManager(this.logger);
            
            // Initialize UI components
            this.uiManager = new UIManager(this.logger);
            this.fileHandler = new FileHandler(this.logger, this.uiManager);
            
            // Make UI manager available globally for other modules
            window.uiManager = this.uiManager;
            this.versionManager = new VersionManager();
            
            // Track import state
            this.isImporting = false;
            this.currentImportAbortController = null;
            
            // Track delete state
            this.isDeletingCsv = false;
            this.deleteCsvUsers = [];
            
            // Initialize API clients as null - they'll be set in initializeAsync()
            this.pingOneClient = null;
            this.localClient = null;
            this.factory = null;
            
            // Show loading state
            this.uiManager.showLoading('Initializing application...');
            
            // Start async initialization
            this.initializeAsync().catch(error => {
                const errorMsg = `Failed to initialize application: ${error.message}`;
                this.logger.fileLogger.error(errorMsg, { error });
                this.uiManager.showError('Initialization Error', errorMsg);
            });
            
            // Bind methods
            this.handleFileSelect = this.handleFileSelect.bind(this);
            this.handleSaveSettings = this.handleSaveSettings.bind(this);
            this.testPingOneConnection = this.testPingOneConnection.bind(this);
            this.cancelImport = this.cancelImport.bind(this);
            
            // Initialize the application
            this.init();
        } catch (error) {
            console.error('Error initializing application:', error);
            // Try to show error in UI if possible
            const errorContainer = document.getElementById('app-error');
            if (errorContainer) {
                errorContainer.textContent = `Initialization error: ${error.message}`;
                errorContainer.style.display = 'block';
            }
            throw error; // Re-throw to be caught by the global error handler
        }
    }

    async init() {
        try {
            // Add initial test logs
            this.logger.fileLogger.info('Application starting...');
            this.logger.fileLogger.debug('Logger initialized');
            
            // Initialize API factory and clients
            try {
                this.logger.fileLogger.info('Initializing API factory...');
                await initAPIFactory(this.logger, this.settingsManager);
                
                // Now that factory is initialized, get the clients
                this.pingOneClient = apiFactory.getPingOneClient();
                this.localClient = apiFactory.getLocalClient();
                this.logger.fileLogger.info('API clients initialized successfully');
            } catch (error) {
                const errorMsg = `Failed to initialize API: ${error.message}`;
                this.logger.fileLogger.error(errorMsg, { error });
                throw new Error(errorMsg);
            }
            
            this.logger.fileLogger.info('Initializing UI components');
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Check server connection status first
            await this.checkServerConnectionStatus();
            
            // Check settings and restore previous file if available
            await this.checkSettingsAndRestore();
            
            this.logger.fileLogger.info('Application initialization complete');
        } catch (error) {
            const errorMsg = `Error initializing application: ${error.message}`;
            this.logger.fileLogger.error(errorMsg, { error });
            console.error('Initialization error:', error);
            
            // Show error in UI if possible
            if (this.uiManager) {
                this.uiManager.showError('Initialization Error', errorMsg);
            } else {
                // Fallback error display
                const errorDiv = document.createElement('div');
                errorDiv.className = 'error-message';
                errorDiv.style.color = 'red';
                errorDiv.style.padding = '1rem';
                errorDiv.style.margin = '1rem';
                errorDiv.style.border = '1px solid #f5c6cb';
                errorDiv.style.borderRadius = '4px';
                errorDiv.style.backgroundColor = '#f8d7da';
                errorDiv.textContent = errorMsg;
                document.body.prepend(errorDiv);
            }
        }
    }
    
    async checkSettingsAndRestore() {
        try {
            this.logger.fileLogger.info('Checking for saved settings...');
            
            // Get settings from the settings manager
            const settings = await this.settingsManager.getSettings();
            
            if (settings && Object.keys(settings).length > 0) {
                this.logger.fileLogger.info('Found saved settings', { hasSettings: true });
                
                // Update the form with saved settings
                this.populateSettingsForm(settings);
                
                // Check if we have a previously loaded file
                if (settings.lastLoadedFile) {
                    this.logger.fileLogger.info('Found last loaded file in settings', { 
                        fileName: settings.lastLoadedFile.name,
                        size: settings.lastLoadedFile.size
                    });
                    
                    // Update UI to show the loaded file
                    this.uiManager.updateFileInfo(settings.lastLoadedFile);
                }
                
                return true;
            } else {
                this.logger.fileLogger.info('No saved settings found');
                return false;
            }
        } catch (error) {
            const errorMsg = `Error checking/restoring settings: ${error.message}`;
            this.logger.fileLogger.error(errorMsg, { error });
            console.error(errorMsg, error);
            throw error; // Re-throw to be handled by the caller
        }
    }
    
    setupEventListeners() {
        // General navigation event listeners for all nav items
        document.querySelectorAll('.nav-item').forEach(navItem => {
            navItem.addEventListener('click', (e) => {
                e.preventDefault();
                const view = navItem.getAttribute('data-view');
                if (view) {
                    console.log('Nav item clicked:', view);
                    this.showView(view);
                }
            });
        });
        
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

        // Add tab switching for delete-csv
        const deleteCsvNav = document.querySelector('.nav-item[data-view="delete-csv"]');
        if (deleteCsvNav) {
            deleteCsvNav.addEventListener('click', () => {
                this.showView('delete-csv');
            });
        }
        // File input for delete-csv
        const deleteCsvFileInput = document.getElementById('delete-csv-file');
        if (deleteCsvFileInput) {
            deleteCsvFileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                try {
                    this.showDeleteCsvFileInfo(file);
                    const allUsers = await this.parseCsvFile(file, 'delete-csv-preview-container');
                    
                    // Filter users to only include those with username or email
                    const validUsers = allUsers.filter(user => {
                        const hasUsername = user.username && user.username.trim() !== '';
                        const hasEmail = user.email && user.email.trim() !== '';
                        return hasUsername || hasEmail;
                    });
                    
                    this.deleteCsvUsers = validUsers;
                    
                    // Check if we have valid users and valid settings
                    const hasValidUsers = validUsers && validUsers.length > 0;
                    const hasValidSettings = await this.checkSettings();
                    
                    // Enable button only if we have both valid users and valid settings
                    const enableButton = hasValidUsers && hasValidSettings;
                    document.getElementById('start-delete-csv-btn').disabled = !enableButton;
                    
                    if (hasValidUsers) {
                        const skippedCount = allUsers.length - validUsers.length;
                        let message = `Successfully processed ${validUsers.length} users for deletion`;
                        if (skippedCount > 0) {
                            message += ` (${skippedCount} users skipped - missing username or email)`;
                        }
                        this.uiManager.showNotification(message, 'success');
                    } else {
                        this.uiManager.showNotification('No valid users found in CSV file. Users must have username or email.', 'warning');
                    }
                } catch (error) {
                    console.error('Error processing delete CSV file:', error);
                    this.uiManager.showNotification(`Error processing file: ${error.message}`, 'error');
                    document.getElementById('start-delete-csv-btn').disabled = true;
                }
            });
        }
        // Start delete-csv action
        const startDeleteCsvBtn = document.getElementById('start-delete-csv-btn');
        if (startDeleteCsvBtn) {
            startDeleteCsvBtn.addEventListener('click', () => this.startDeleteCsv());
        }
        // Cancel delete-csv action
        const cancelDeleteCsvBtn = document.getElementById('cancel-delete-csv-btn');
        if (cancelDeleteCsvBtn) {
            cancelDeleteCsvBtn.addEventListener('click', () => this.cancelDeleteCsv());
        }
        // Home tab navigation
        const homeNav = document.querySelector('.nav-item[data-view="home"]');
        if (homeNav) {
            homeNav.addEventListener('click', () => {
                this.showView('home');
            });
        }
        // Feature card navigation
        document.querySelectorAll('.feature-card').forEach(card => {
            card.addEventListener('click', () => {
                const view = card.getAttribute('data-view');
                if (view) this.showView(view);
            });
        });
        // Disclaimer acceptance
        const disclaimerBtn = document.getElementById('accept-disclaimer');
        if (disclaimerBtn) {
            disclaimerBtn.addEventListener('click', () => {
                localStorage.setItem('disclaimerAccepted', 'true');
                const disclaimerBox = document.getElementById('disclaimer');
                if (disclaimerBox) disclaimerBox.style.display = 'none';
            });
        }
        // On load, show disclaimer if not accepted
        if (localStorage.getItem('disclaimerAccepted') === 'true') {
            const disclaimerBox = document.getElementById('disclaimer');
            if (disclaimerBox) disclaimerBox.style.display = 'none';
        }
    }

    showView(view) {
        console.log('showView called with:', view);
        
        // Hide all views
        const allViews = document.querySelectorAll('.view');
        console.log('Found views:', allViews.length);
        allViews.forEach(v => {
            v.classList.remove('active');
            console.log('Removed active from:', v.id);
        });
        
        // Remove active from all nav items
        const allNavItems = document.querySelectorAll('.nav-item');
        allNavItems.forEach(n => n.classList.remove('active'));
        
        // Show the target view
        const viewDiv = document.getElementById(`${view}-view`);
        console.log('Target view element:', viewDiv);
        if (viewDiv) {
            viewDiv.classList.add('active');
            console.log('Added active to:', viewDiv.id);
        } else {
            console.error('View element not found:', `${view}-view`);
        }
        
        // Activate the nav item
        const navItem = document.querySelector(`.nav-item[data-view="${view}"]`);
        console.log('Target nav item:', navItem);
        if (navItem) {
            navItem.classList.add('active');
            console.log('Added active to nav item:', navItem);
        } else {
            console.error('Nav item not found for view:', view);
        }
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
    
    /**
     * Check the server's connection status to PingOne
     * @returns {Promise<boolean>} Whether the server is connected to PingOne
     */
    async checkServerConnectionStatus() {
        try {
            this.logger.fileLogger.debug('Checking server connection status...');
            
            // Show connecting status in UI
            this.uiManager.updateConnectionStatus('connecting', 'Checking connection status...');
            
            const response = await this.localClient.get('/api/health');
            
            if (!response || !response.server) {
                throw new Error('Invalid response from server');
            }
            
            const { server } = response;
            
            if (!server) {
                throw new Error('Server status not available');
            }
            
            const { pingOneInitialized, lastError } = server;
            
            if (pingOneInitialized) {
                this.logger.fileLogger.info('Server is connected to PingOne');
                this.uiManager.updateConnectionStatus('connected', 'Connected to PingOne');
                return true;
            } else {
                const errorMessage = lastError || 'Not connected to PingOne';
                this.logger.fileLogger.warn('Server is not connected to PingOne', { error: errorMessage });
                this.uiManager.updateConnectionStatus('disconnected', errorMessage);
                return false;
            }
        } catch (error) {
            const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
            this.logger.fileLogger.error('Error checking server connection status', { error: errorMessage });
            
            // More specific error handling
            let statusMessage = 'Error checking connection status';
            if (error.response) {
                // Server responded with error status
                statusMessage = `Server error: ${error.response.status} ${errorMessage}`;
            } else if (error.request) {
                // Request was made but no response received
                statusMessage = 'No response from server. Please check your connection.';
            }
            
            this.uiManager.updateConnectionStatus('error', statusMessage);
            return false;
        }
    }

    /**
     * Test the PingOne connection by getting an access token
     * @returns {Promise<Object>} Result of the connection test
     */
    async testPingOneConnection() {
        try {
            this.logger.fileLogger.info('Testing PingOne connection');
            
            // Show connecting status in UI
            this.uiManager.updateConnectionStatus('connecting', 'Connecting to PingOne...');
            
            // Get current settings
            const settings = this.settingsManager.getSettings();
            
            if (!settings || !settings.apiClientId || !settings.apiSecret || !settings.environmentId) {
                throw new Error('Missing required settings. Please configure your API credentials first.');
            }
            
            // Use the local client from the factory
            const response = await this.localClient.post('/api/pingone/test-connection', {
                apiClientId: settings.apiClientId,
                apiSecret: settings.apiSecret,
                environmentId: settings.environmentId,
                region: settings.region || 'NorthAmerica'
            });
            
            if (response.success) {
                this.logger.fileLogger.info('Successfully connected to PingOne API');
                
                // Update connection status in settings
                settings.connectionStatus = 'connected';
                settings.connectionMessage = 'Connected';
                settings.lastConnectionTest = new Date().toISOString();
                
                // Save updated settings
                await this.settingsManager.saveSettings(settings);
                
                // Update UI status
                this.uiManager.updateConnectionStatus('connected', 'Connected to PingOne');
                
                return { success: true };
            } else {
                throw new Error(response.message || 'Failed to connect to PingOne API');
            }
        } catch (error) {
            const errorMessage = error.message || 'Connection failed';
            this.logger.fileLogger.error('Failed to connect to PingOne', { error: errorMessage });
            
            // Update connection status in settings
            const settings = this.settingsManager.getSettings() || {};
            settings.connectionStatus = 'disconnected';
            settings.connectionMessage = errorMessage;
            settings.lastConnectionTest = new Date().toISOString();
            
            // Save updated settings
            await this.settingsManager.saveSettings(settings);
            
            // Update UI status
            this.uiManager.updateConnectionStatus('error', errorMessage);
            
            return { success: false, error: errorMessage };
        }
    }
    
    async startImport() {
        console.log('startImport called, isImporting:', this.isImporting);
        
        if (this.isImporting) {
            this.logger.fileLogger.warn('Import already in progress');
            this.uiManager.showNotification('Import already in progress', 'warning');
            return;
        }
        
        // Reset Import Progress screen for new import
        this.uiManager.resetImportProgress();
        
        try {
            this.isImporting = true;
            this.currentImportAbortController = new AbortController();
            
            console.log('Import state set to true');
            
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
            console.error('Import error caught:', error);
            
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
            console.log('Import finally block - resetting state');
            this.isImporting = false;
            this.currentImportAbortController = null;
            this.uiManager.setImporting(false);
            console.log('Import state reset to false');
        }
    }
    
    cancelImport() {
        if (this.currentImportAbortController) {
            this.currentImportAbortController.abort();
            this.logger.fileLogger.info('Canceling import');
        }
        // Force reset import state
        this.resetImportState();
    }

    resetImportState() {
        console.log('Force resetting import state');
        this.isImporting = false;
        this.currentImportAbortController = null;
        this.uiManager.setImporting(false);
        this.uiManager.resetImportState();
    }

    async startDeleteCsv() {
        if (this.isDeletingCsv) return;
        this.isDeletingCsv = true;
        this.uiManager.setDeletingCsv(true);
        this.uiManager.showDeleteCsvStatus(this.deleteCsvUsers.length);
        try {
            const results = await this.pingOneClient.deleteUsersFromCsv(this.deleteCsvUsers, {
                onProgress: (progress) => {
                    this.uiManager.updateDeleteCsvProgress(
                        progress.current,
                        progress.total,
                        `Deleting user ${progress.current} of ${progress.total}...`,
                        progress
                    );
                }
            });
            this.uiManager.updateDeleteCsvProgress(
                results.total,
                results.total,
                `Delete completed. Deleted: ${results.success}, Failed: ${results.failed}, Skipped: ${results.skipped}`,
                results
            );
        } catch (error) {
            this.uiManager.updateDeleteCsvProgress(0, 0, `Delete failed: ${error.message}`);
        } finally {
            this.isDeletingCsv = false;
            this.uiManager.setDeletingCsv(false);
        }
    }

    cancelDeleteCsv() {
        this.isDeletingCsv = false;
        this.uiManager.setDeletingCsv(false);
        this.uiManager.updateDeleteCsvProgress(0, 0, 'Delete cancelled');
    }

    showDeleteCsvFileInfo(file) {
        const infoDiv = document.getElementById('delete-csv-file-info');
        infoDiv.textContent = `${file.name} (${file.size} bytes)`;
    }

    async parseCsvFile(file, previewContainerId) {
        const text = await file.text();
        const lines = text.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        const users = [];
        const previewDiv = document.getElementById(previewContainerId);
        previewDiv.innerHTML = '';
        const table = document.createElement('table');
        table.className = 'table table-sm table-bordered';
        const thead = document.createElement('thead');
        const tr = document.createElement('tr');
        headers.forEach(h => {
            const th = document.createElement('th');
            th.textContent = h;
            tr.appendChild(th);
        });
        thead.appendChild(tr);
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            if (values.length !== headers.length) continue;
            const user = {};
            const row = document.createElement('tr');
            headers.forEach((h, idx) => {
                user[h] = values[idx] || '';
                const td = document.createElement('td');
                td.textContent = values[idx] || '';
                row.appendChild(td);
            });
            users.push(user);
            tbody.appendChild(row);
        }
        table.appendChild(tbody);
        previewDiv.appendChild(table);
        return users;
    }

    updateDeleteCsvProgress(current, total, message, counts = {}) {
        const percent = total ? Math.round((current / total) * 100) : 0;
        document.getElementById('delete-csv-progress').style.width = percent + '%';
        document.getElementById('delete-csv-progress-percent').textContent = percent + '%';
        document.getElementById('delete-csv-progress-text').textContent = message;
        document.getElementById('delete-csv-progress-count').textContent = `${current} of ${total} users`;
        document.getElementById('delete-csv-success-count').textContent = counts.success || 0;
        document.getElementById('delete-csv-failed-count').textContent = counts.failed || 0;
        document.getElementById('delete-csv-skipped-count').textContent = counts.skipped || 0;
    }
    
    async handleFileSelect(file) {
        try {
            this.logger.fileLogger.debug('File selected', { fileName: file.name, fileSize: file.size });
            
            // Show loading state
            this.uiManager.showLoading(true, 'Processing file...');
            
            // Process the file using the file handler
            const result = await this.fileHandler.processCSV(file);
            
            if (result && result.success) {
                const userCount = result.userCount || 0;
                this.logger.fileLogger.info('File processed successfully', { 
                    rows: userCount,
                    headers: result.headers 
                });
                
                // Show success message
                this.uiManager.showNotification(`Successfully processed ${userCount} users`, 'success');
                
                // Enable import button if we have users and settings are valid
                const isValid = await this.checkSettings();
                
                if (isValid) {
                    this.uiManager.showNotification('Ready to import users', 'info');
                }
                
                return result;
            } else {
                const errorMsg = result?.error || 'Failed to process file';
                throw new Error(errorMsg);
            }
        } catch (error) {
            const errorMsg = error.message || 'An unknown error occurred while processing the file';
            this.logger.fileLogger.error('Error processing file', { error: errorMsg });
            this.uiManager.showNotification(errorMsg, 'error');
            console.error('File processing error:', error);
            throw error; // Re-throw to allow caller to handle if needed
        } finally {
            // Always hide loading state
            this.uiManager.showLoading(false);
        }
    }
    
    /**
     * Checks if the current settings are valid and updates the UI accordingly
     * @returns {Promise<boolean>} True if settings are valid, false otherwise
     */
    /**
     * Checks if the current settings are valid and updates the UI accordingly
     * @returns {Promise<boolean>} True if settings are valid, false otherwise
     */
    async checkSettings() {
        try {
            const settings = this.settingsManager.getSettings();
            const hasRequiredSettings = settings.environmentId && settings.region;
            const users = this.fileHandler.getUsers ? this.fileHandler.getUsers() : [];
            const hasUsers = Array.isArray(users) && users.length > 0;

            // Check server connection status if we have required settings
            if (hasRequiredSettings) {
                await this.checkServerConnectionStatus();
            }

            // Enable Import button only if both users and settings are valid
            const enableImport = hasRequiredSettings && hasUsers;
            this.uiManager.setImportButtonState(enableImport);

            // Update UI for settings status
            this.uiManager.updateSettingsStatus(hasRequiredSettings);
            return hasRequiredSettings;
            
        } catch (error) {
            this.logger.fileLogger.error('Error checking settings', { error: error.message });
            this.uiManager.setImportButtonState(false);
            return false;
        }
    }
    
    /**
     * Populates the settings form with the provided settings
     * @param {Object} settings - The settings to populate the form with
     */
    populateSettingsForm(settings) {
        if (!settings) {
            this.logger.warn('No settings provided to populate form');
            return;
        }
        
        this.logger.debug('Populating settings form with:', {
            ...settings,
            apiSecret: settings.apiSecret ? '***' : '[empty]'
        });
        
        try {
            // Define form fields and their corresponding settings keys
            const fields = {
                // API Settings
                'environment-id': settings.environmentId || '',
                'api-client-id': settings.apiClientId || '',
                'api-secret': settings.apiSecret || '',
                'population-id': settings.populationId || '',
                'region': settings.region || 'NorthAmerica',
                
                // Import Settings
                'default-password': settings.defaultPassword || '',
                'send-welcome-email': settings.sendWelcomeEmail || false,
                'update-existing': settings.updateExisting || false
            };
            
            // Track which fields were actually set
            const setFields = [];
            const missingFields = [];
            
            // Set each field
            for (const [id, value] of Object.entries(fields)) {
                try {
                    const element = document.getElementById(id);
                    if (!element) {
                        missingFields.push(id);
                        continue;
                    }
                    
                    // Handle different input types
                    if (element.type === 'checkbox') {
                        element.checked = Boolean(value);
                    } else if (element.tagName === 'SELECT' && element.multiple) {
                        // Handle multi-select
                        const values = Array.isArray(value) ? value : [value];
                        Array.from(element.options).forEach(option => {
                            option.selected = values.includes(option.value);
                        });
                    } else {
                        // For API secret, only set if it's not empty
                        if (id === 'api-secret' && !value) {
                            continue;
                        }
                        
                        // For password fields, use placeholder
                        if ((id.includes('password') || id.includes('secret')) && value) {
                            element.value = '********'; // Placeholder for passwords
                        } else {
                            element.value = value !== null && value !== undefined ? value : '';
                        }
                    }
                    
                    setFields.push(id);
                    
                } catch (fieldError) {
                    this.logger.error(`Error setting field ${id}:`, fieldError);
                }
            }
            
            // Log results
            if (setFields.length > 0) {
                this.logger.debug(`Successfully set ${setFields.length} form fields`);
            }
            
            if (missingFields.length > 0) {
                this.logger.debug(`Could not find ${missingFields.length} form fields:`, missingFields);
            }
            
            // Update connection status display if status element exists
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
            
            this.logger.debug('Finished populating settings form');
            
        } catch (error) {
            const errorMsg = `Error populating settings form: ${error.message}`;
            this.logger.error(errorMsg, error);
            this.uiManager.showError('Form Error', 'Failed to populate settings form');
            throw error;
        } finally {
            // Always hide loading state
            this.uiManager.showLoading(false);
        }
    }
    
    /**
     * Asynchronously initializes the application
     * @private
     */
    async initializeAsync() {
        try {
            // Load settings first before initializing API factory
            this.logger.fileLogger.info('Loading settings...');
            await this.settingsManager.loadSettings();
            
            // Initialize API factory after settings are loaded
            this.logger.fileLogger.info('Initializing API factory...');
            this.factory = await initAPIFactory(this.logger, this.settingsManager);
            
            // Initialize API clients
            this.pingOneClient = this.factory.getPingOneClient();
            this.localClient = this.factory.getLocalClient();
            this.logger.fileLogger.info('API clients initialized successfully');
            
            // Now that API clients are ready, restore settings to UI
            await this.checkSettingsAndRestore();
            
            // Initialize the rest of the UI
            this.logger.fileLogger.info('Initializing UI components');
            this.setupEventListeners();
            
            // Check server connection status
            await this.checkServerConnectionStatus();
            
            this.logger.fileLogger.info('Application initialization complete');
            console.log(`PingOne Import Tool ${this.versionManager.getFormattedVersion()} initialized`);
        } catch (error) {
            const errorMsg = `Failed to initialize application: ${error.message}`;
            this.logger.fileLogger.error(errorMsg, { error });
            this.uiManager.showError('Initialization Error', errorMsg);
        }
    }
}

// Initialize the application when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    try {
        // Create the app instance - this will start the async initialization
        const app = new App();
        
        // Expose app to window for debugging and global access
        window.app = app;
        
        // Log that the app is initializing
        console.log('PingOne Import Tool initializing...');
    } catch (error) {
        console.error('Failed to initialize application:', error);
        
        // Show error in the UI if possible
        const errorDiv = document.createElement('div');
        errorDiv.style.color = 'red';
        errorDiv.style.padding = '1rem';
        errorDiv.style.margin = '1rem';
        errorDiv.style.border = '1px solid #f5c6cb';
        errorDiv.style.borderRadius = '4px';
        errorDiv.style.backgroundColor = '#f8d7da';
        errorDiv.textContent = `Failed to initialize application: ${error.message}`;
        document.body.prepend(errorDiv);
    }
});