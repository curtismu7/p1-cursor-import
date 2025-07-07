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
            console.log('App constructor starting...');
            
            // Initialize logger with the log container
            const logContainer = document.getElementById('logs-container');
            console.log('Log container found:', !!logContainer);
            this.logger = new Logger(logContainer);
            
            // Initialize settings manager first as it's used by other components
            this.settingsManager = new SettingsManager(this.logger);
            
            // Initialize UI components
            this.uiManager = new UIManager(this.logger);
            this.fileHandler = new FileHandler(this.logger, this.uiManager);
            
            // Call disclaimer setup immediately after UI is ready
            this.setupDisclaimerAgreement();
            
            console.log('Core components initialized:', {
                logger: !!this.logger,
                settingsManager: !!this.settingsManager,
                uiManager: !!this.uiManager,
                fileHandler: !!this.fileHandler
            });
            
            // Make UI manager available globally for other modules
            window.uiManager = this.uiManager;
            this.versionManager = new VersionManager();
            
            // Track import state
            this.isImporting = false;
            this.isDeletingCsv = false;
            this.isModifying = false;
            this.isExporting = false;
            this.currentImportAbortController = null;
            this.currentDeleteAbortController = null;
            this.currentModifyAbortController = null;
            this.currentExportAbortController = null;
            
            // Track delete state
            this.deleteCsvUsers = [];
            this.modifyCsvUsers = [];
            
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
            this.handleDeleteCsvFileSelect = this.handleDeleteCsvFileSelect.bind(this);
            this.handleModifyCsvFileSelect = this.handleModifyCsvFileSelect.bind(this);
            
            // Initialize the application
            this.init();
            
            console.log('App constructor completed');
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
                
                // Patch localClient to show UI warning on 429 errors
                if (this.localClient && this.localClient.post) {
                    const origPost = this.localClient.post.bind(this.localClient);
                    this.localClient.post = async (...args) => {
                        try {
                            return await origPost(...args);
                        } catch (error) {
                            if (error?.response?.status === 429 && this.uiManager) {
                                this.uiManager.showRateLimitWarning('You are being rate limited. Please wait and try again.');
                            }
                            throw error;
                        }
                    };
                }
                
                this.logger.fileLogger.info('API clients initialized successfully');
                
                // Patch fetch to show UI warning on 429 errors
                const originalFetch = window.fetch;
                window.fetch = async (...args) => {
                    try {
                        const response = await originalFetch(...args);
                        if (response.status === 429 && this.uiManager) {
                            this.uiManager.showRateLimitWarning('You are being rate limited. Please wait and try again.');
                        }
                        return response;
                    } catch (error) {
                        if (error?.response?.status === 429 && this.uiManager) {
                            this.uiManager.showRateLimitWarning('You are being rate limited. Please wait and try again.');
                        }
                        throw error;
                    }
                };
                
                this.logger.fileLogger.info('Fetch patched for rate limit warnings');
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
        console.log('Setting up event listeners...');
        
        // General navigation event listeners for all nav items
        document.querySelectorAll('.nav-item').forEach(navItem => {
            navItem.addEventListener('click', (e) => {
                e.preventDefault();
                const view = navItem.getAttribute('data-view');
                if (view) {
                    this.showView(view);
                }
            });
        });

        // Feature card navigation event listeners
        document.querySelectorAll('.feature-card').forEach(featureCard => {
            featureCard.addEventListener('click', (e) => {
                e.preventDefault();
                const view = featureCard.getAttribute('data-view');
                if (view) {
                    this.showView(view);
                }
            });
        });

        // Settings form submission
        const settingsForm = document.getElementById('settings-form');
        if (settingsForm) {
            settingsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(settingsForm);
                const settings = Object.fromEntries(formData.entries());
                await this.handleSaveSettings(settings);
            });
        }

        // Get token button
        const getTokenBtn = document.getElementById('get-token-btn');
        if (getTokenBtn) {
            getTokenBtn.addEventListener('click', async () => {
                try {
                    await this.getToken();
                } catch (error) {
                    this.logger.fileLogger.error('Error getting token', { error: error.message });
                    this.uiManager.showNotification('Failed to get token: ' + error.message, 'error');
                }
            });
        }

        // Refresh token button
        const refreshTokenBtn = document.getElementById('refresh-token-btn');
        if (refreshTokenBtn) {
            refreshTokenBtn.addEventListener('click', async () => {
                try {
                    await this.refreshToken();
                } catch (error) {
                    this.logger.fileLogger.error('Error refreshing token', { error: error.message });
                    this.uiManager.showNotification('Failed to refresh token: ' + error.message, 'error');
                }
            });
        }

        // Export button
        const exportBtn = document.getElementById('start-export-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.startExport();
            });
        }

        // Cancel export button
        const cancelExportBtn = document.getElementById('cancel-export-btn');
        if (cancelExportBtn) {
            cancelExportBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.cancelExport();
            });
        }

        // Delete CSV button
        const deleteCsvBtn = document.getElementById('start-delete-csv-btn');
        if (deleteCsvBtn) {
            deleteCsvBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.startDeleteCsv();
            });
        }

        // Cancel delete CSV button
        const cancelDeleteCsvBtn = document.getElementById('cancel-delete-csv-btn');
        if (cancelDeleteCsvBtn) {
            cancelDeleteCsvBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.cancelDeleteCsv();
            });
        }

        // Modify CSV button
        const modifyCsvBtn = document.getElementById('start-modify-csv-btn');
        if (modifyCsvBtn) {
            modifyCsvBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.startModifyCsv();
            });
        }

        // Cancel modify CSV button
        const cancelModifyCsvBtn = document.getElementById('cancel-modify-csv-btn');
        if (cancelModifyCsvBtn) {
            cancelModifyCsvBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.cancelModifyCsv();
            });
        }

        // Eye icon toggle for API secret visibility
        const apiSecretInput = document.getElementById('api-secret');
        const toggleApiSecretBtn = document.getElementById('toggle-api-secret-visibility');
        console.log('API Secret toggle setup:', { apiSecretInput: !!apiSecretInput, toggleApiSecretBtn: !!toggleApiSecretBtn });
        if (apiSecretInput && toggleApiSecretBtn) {
            toggleApiSecretBtn.addEventListener('click', function () {
                console.log('API Secret toggle clicked');
                const icon = document.getElementById('api-secret-eye');
                console.log('Icon element:', icon);
                if (apiSecretInput.type === 'password') {
                    console.log('Changing to text type');
                    apiSecretInput.type = 'text';
                    if (icon) {
                        icon.classList.remove('fa-eye');
                        icon.classList.add('fa-eye-slash');
                        console.log('Changed icon to eye-slash');
                    }
                } else {
                    console.log('Changing to password type');
                    apiSecretInput.type = 'password';
                    if (icon) {
                        icon.classList.remove('fa-eye-slash');
                        icon.classList.add('fa-eye');
                        console.log('Changed icon to eye');
                    }
                }
            });
            console.log('API Secret toggle event listener attached');
        } else {
            console.error('API Secret toggle elements not found:', { apiSecretInput: !!apiSecretInput, toggleApiSecretBtn: !!toggleApiSecretBtn });
        }

        // File upload event listeners
        const csvFileInput = document.getElementById('csv-file');
        console.log('CSV file input element:', csvFileInput);
        
        if (csvFileInput) {
            csvFileInput.addEventListener('change', (event) => {
                console.log('CSV file input change event triggered');
                const file = event.target.files[0];
                console.log('Selected file:', file);
                if (file) {
                    console.log('Calling handleFileSelect with file:', file.name);
                    this.handleFileSelect(file);
                } else {
                    console.log('No file selected');
                }
            });
            console.log('CSV file input event listener attached');
        } else {
            console.error('CSV file input element not found');
        }
        
        document.getElementById('delete-csv-file').addEventListener('change', this.handleDeleteCsvFileSelect);
        document.getElementById('modify-csv-file').addEventListener('change', this.handleModifyCsvFileSelect);

        // Population delete event listeners
        const startPopulationDeleteBtn = document.getElementById('start-population-delete-btn');
        if (startPopulationDeleteBtn) {
            startPopulationDeleteBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.startPopulationDelete();
            });
        }

        const cancelPopulationDeleteBtn = document.getElementById('cancel-population-delete-btn');
        if (cancelPopulationDeleteBtn) {
            cancelPopulationDeleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.cancelPopulationDelete();
            });
        }

        const populationDeleteSelect = document.getElementById('population-delete-select');
        if (populationDeleteSelect) {
            populationDeleteSelect.addEventListener('change', () => {
                this.updatePopulationDeleteButtonState();
            });
        }

        const cancelPopulationDeleteProgressBtn = document.getElementById('cancel-population-delete-progress');
        if (cancelPopulationDeleteProgressBtn) {
            cancelPopulationDeleteProgressBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.cancelPopulationDelete();
            });
        }

        // Cancel delete CSV progress button
        const cancelDeleteCsvProgressBtn = document.getElementById('cancel-delete-csv-progress');
        if (cancelDeleteCsvProgressBtn) {
            cancelDeleteCsvProgressBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.cancelDeleteCsv();
            });
        }

        // Cancel import progress button
        const cancelImportProgressBtn = document.getElementById('cancel-import-progress');
        if (cancelImportProgressBtn) {
            cancelImportProgressBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.cancelImport();
            });
        }

        // Cancel export progress button
        const cancelExportProgressBtn = document.getElementById('cancel-export-progress');
        if (cancelExportProgressBtn) {
            cancelExportProgressBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.cancelExport();
            });
        }

        // Cancel modify progress button
        const cancelModifyProgressBtn = document.getElementById('cancel-modify-progress');
        if (cancelModifyProgressBtn) {
            cancelModifyProgressBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.cancelModifyCsv();
            });
        }

        const closePopulationDeleteStatusBtn = document.getElementById('close-population-delete-status');
        if (closePopulationDeleteStatusBtn) {
            closePopulationDeleteStatusBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.uiManager.hidePopulationDeleteStatus();
            });
        }

        // Import button event listeners (top and bottom)
        const importButton = document.getElementById('start-import-btn');
        const importButtonBottom = document.getElementById('start-import-btn-bottom');
        
        if (importButton) {
            importButton.addEventListener('click', (e) => {
                console.log('Top import button clicked');
                e.preventDefault();
                this.startImport();
            });
            console.log('Top import button event listener attached');
        } else {
            console.error('Top import button not found');
        }
        
        if (importButtonBottom) {
            importButtonBottom.addEventListener('click', (e) => {
                console.log('Bottom import button clicked');
                e.preventDefault();
                this.startImport();
            });
            console.log('Bottom import button event listener attached');
        } else {
            console.error('Bottom import button not found');
        }

        // Cancel import button event listeners (top and bottom)
        const cancelImportButton = document.getElementById('cancel-import-btn');
        const cancelImportButtonBottom = document.getElementById('cancel-import-btn-bottom');
        
        if (cancelImportButton) {
            cancelImportButton.addEventListener('click', (e) => {
                console.log('Top cancel import button clicked');
                e.preventDefault();
                this.cancelImport();
            });
            console.log('Top cancel import button event listener attached');
        } else {
            console.error('Top cancel import button not found');
        }
        
        if (cancelImportButtonBottom) {
            cancelImportButtonBottom.addEventListener('click', (e) => {
                console.log('Bottom cancel import button clicked');
                e.preventDefault();
                this.cancelImport();
            });
            console.log('Bottom cancel import button event listener attached');
        } else {
            console.error('Bottom cancel import button not found');
        }

        // Refresh populations button
        document.getElementById('refresh-export-populations').addEventListener('click', async () => {
            try {
                const button = document.getElementById('refresh-export-populations');
                const icon = button.querySelector('i');
                
                // Show loading state
                icon.classList.add('fa-spin');
                button.disabled = true;
                
                // Reload populations
                await this.loadPopulationsForExport();
                
                // Show success message
                this.uiManager.showNotification('Populations refreshed successfully', 'success');
                
            } catch (error) {
                this.logger.fileLogger.error('Failed to refresh populations', { error: error.message });
                this.uiManager.showNotification('Failed to refresh populations: ' + error.message, 'error');
            } finally {
                // Reset button state
                const button = document.getElementById('refresh-export-populations');
                const icon = button.querySelector('i');
                icon.classList.remove('fa-spin');
                button.disabled = false;
            }
        });

        // Population selection change listeners for import
        const importPopulationSelect = document.getElementById('import-population-select');
        const useCsvPopulationIdCheckbox = document.getElementById('use-csv-population-id');
        const useDefaultPopulationCheckbox = document.getElementById('use-default-population');
        
        if (importPopulationSelect) {
            importPopulationSelect.addEventListener('change', () => {
                this.updateImportButtonState();
            });
        }
        
        if (useCsvPopulationIdCheckbox) {
            useCsvPopulationIdCheckbox.addEventListener('change', () => {
                this.updateImportButtonState();
            });
        }
        
        if (useDefaultPopulationCheckbox) {
            useDefaultPopulationCheckbox.addEventListener('change', () => {
                this.updateImportButtonState();
            });
        }
        
        // Setup delete page functionality
        this.setupDeletePage();
        
        // Setup delete warning modal
        this.setupDeleteWarningModal();

        console.log('Event listeners setup complete');
    }

    async showView(view) {
        try {
            // Hide all views
            Object.values(this.uiManager.views).forEach(viewElement => {
                if (viewElement) {
                    viewElement.style.display = 'none';
                }
            });

            // Show the selected view
            const selectedView = this.uiManager.views[view];
            if (selectedView) {
                selectedView.style.display = 'block';
                this.uiManager.currentView = view;
                
                // Load populations for export when export view is shown
                if (view === 'export') {
                    await this.loadPopulationsForExport();
                }
                
                // Load populations for import when import view is shown
                if (view === 'import') {
                    await this.loadPopulationsForImport();
                }
                
                // Load populations for modify when modify view is shown
                if (view === 'modify') {
                    await this.loadModifyPopulations();
                }
                
                // Load populations for delete when delete view is shown
                if (view === 'delete') {
                    await this.loadPopulationsForDeletion();
                }
                
                // Load logs when logs view is shown
                if (view === 'logs') {
                    await this.uiManager.loadAndDisplayLogs();
                }
                
                // Update navigation
                this.uiManager.navItems.forEach(item => {
                    item.classList.remove('active');
                    if (item.getAttribute('data-view') === view) {
                        item.classList.add('active');
                    }
                });
                
                // Update last view in localStorage
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem('lastView', view);
                }
                
                console.log(`Switched to view: ${view}`);
            } else {
                console.error(`View not found: ${view}`);
            }
        } catch (error) {
            console.error('Error showing view:', error);
            this.logger.fileLogger.error('Error showing view', { view, error: error.message });
        }
    }
    
    async handleSaveSettings(settings) {
        try {
            console.log('handleSaveSettings called with:', settings);
            this.logger.fileLogger.info('Saving settings', settings);
            this.uiManager.updateConnectionStatus('connecting', 'Saving settings...', false);
            
            // Just save settings without testing connections
            const response = await this.localClient.post('/api/settings', settings);
            console.log('Settings saved successfully:', response);
            
            // Update settings manager
            this.settingsManager.updateSettings(settings);
            
            // Update API clients with new settings
            this.pingOneClient = apiFactory.getPingOneClient(this.logger, this.settingsManager);
            
            // Update UI status
            this.uiManager.updateConnectionStatus('connected', '✅ Settings saved successfully', false);
            
            // Show success notification
            if (this.uiManager.showNotification) {
                this.uiManager.showNotification('✅ Settings saved successfully', 'success');
            }
            
            // Fetch and repopulate latest settings
            const latest = await this.localClient.get('/api/settings');
            if (latest && latest.environmentId) {
                this.populateSettingsForm(latest);
            }
            
            this.logger.fileLogger.info('Settings saved successfully');
            return { success: true };
        } catch (error) {
            const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
            this.logger.fileLogger.error('Error saving settings', { error: errorMessage });
            this.uiManager.updateConnectionStatus('error', `❌ Error: ${errorMessage}`, false);
            if (this.uiManager.showNotification) {
                this.uiManager.showNotification(`Error: ${errorMessage}`, 'error');
            }
            this.uiManager.updateSettingsSaveStatus(`❌ Error saving settings: ${errorMessage}`, 'error');
            return { success: false, error: errorMessage };
        }
    }
    
    /**
     * Get or refresh token with current settings
     * @returns {Promise<Object>} Result of the token request
     */
    async getToken() {
        try {
            this.logger.fileLogger.info('Getting token with current settings');
            
            // Get current settings from the form
            const settingsForm = document.getElementById('settings-form');
            if (!settingsForm) {
                throw new Error('Settings form not found');
            }
            
            const formData = new FormData(settingsForm);
            const currentSettings = {
                environmentId: formData.get('environment-id'),
                apiClientId: formData.get('api-client-id'),
                apiSecret: formData.get('api-secret'),
                populationId: formData.get('population-id'),
                region: formData.get('region')
            };
            
            this.uiManager.updateConnectionStatus('connecting', 'Getting token...', false);
            
            // Check if settings have changed and clear token if needed
            await this.checkSettingsAndRefreshToken(currentSettings);
            
            // Test the connection with current settings
            const result = await this.testPingOneConnection(currentSettings);
            
            if (result.success) {
                this.logger.fileLogger.info('Successfully obtained token');
                let message = '✅ Token obtained successfully';
                if (result.warning) {
                    message += ' - ' + result.warning;
                }
                this.uiManager.updateConnectionStatus('connected', message, false);
                if (this.uiManager.showNotification) {
                    this.uiManager.showNotification(message, result.warning ? 'warning' : 'success');
                }
            } else {
                throw new Error(result.error || 'Failed to get token');
            }
            
            return result;
        } catch (error) {
            const errorMessage = error.message || 'Failed to get token';
            this.logger.fileLogger.error('Error getting token', { error: errorMessage });
            this.uiManager.updateConnectionStatus('error', `❌ Error: ${errorMessage}`, false);
            if (this.uiManager.showNotification) {
                this.uiManager.showNotification(`Error getting token: ${errorMessage}`, 'error');
            }
            return { success: false, error: errorMessage };
        }
    }
    
    /**
     * Check if UI settings match stored settings and refresh token if they don't match
     * @param {Object} newSettings - The new settings from the UI
     * @returns {Promise<void>}
     */
    async checkSettingsAndRefreshToken(newSettings) {
        try {
            // Get current stored settings
            const storedSettings = this.settingsManager.getSettings();
            
            if (!storedSettings) {
                // No stored settings, will get new token with new settings
                this.logger.fileLogger.info('No stored settings found, will get new token with new settings');
                return;
            }
            
            // Check if any critical settings have changed
            const settingsChanged = 
                storedSettings.environmentId !== newSettings.environmentId ||
                storedSettings.apiClientId !== newSettings.apiClientId ||
                storedSettings.apiSecret !== newSettings.apiSecret ||
                storedSettings.populationId !== newSettings.populationId ||
                storedSettings.region !== newSettings.region;
            
            if (settingsChanged) {
                this.logger.fileLogger.info('Settings have changed, clearing cached token and getting new one');
                
                // Clear the cached token
                if (typeof localStorage !== 'undefined') {
                    localStorage.removeItem('pingone_worker_token');
                    localStorage.removeItem('pingone_token_expiry');
                    this.logger.fileLogger.info('Cleared cached token due to settings change');
                }
                
                // Update UI to show that we're getting a new token
                this.uiManager.updateConnectionStatus('connecting', 'Settings changed - Getting new token...', false);
                this.uiManager.updateSettingsSaveStatus('Settings changed - Getting new token...', 'info');
                
                // Get a new token with the new settings
                const result = await this.testPingOneConnection(newSettings);
                
                let combinedMsg = '';
                let type = 'success';
                if (result.success) {
                    this.logger.fileLogger.info('Successfully obtained new token with updated settings');
                    combinedMsg = '✅ Settings saved successfully. New token obtained with updated settings.';
                    if (result.warning) {
                        combinedMsg += '<br>' + result.warning;
                        type = 'warning';
                    }
                } else {
                    this.logger.fileLogger.warn('Failed to get new token with updated settings', { error: result.error });
                    combinedMsg = `⚠️ Settings saved but new token request failed: ${result.error}`;
                    if (result.warning) {
                        combinedMsg += '<br>' + result.warning;
                    }
                    type = 'warning';
                }
                this.uiManager.updateSettingsSaveStatus(combinedMsg, type);
            } else {
                this.logger.fileLogger.info('Settings unchanged, using existing token');
                this.uiManager.updateSettingsSaveStatus('✅ Settings saved successfully. Using existing token.', 'success');
            }
        } catch (error) {
            this.logger.fileLogger.error('Error checking settings and refreshing token', { error: error.message });
            // Don't throw here - we still want to save the settings even if token refresh fails
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
     * @param {Object} customSettings - Optional custom settings to use instead of stored settings
     * @returns {Promise<Object>} Result of the connection test
     */
    async testPingOneConnection(customSettings = null) {
        try {
            this.logger.fileLogger.info('Testing PingOne connection');
            
            // Show connecting status in UI
            this.uiManager.updateConnectionStatus('connecting', 'Connecting to PingOne...');
            
            // Use custom settings if provided, otherwise get current settings
            const settings = customSettings || this.settingsManager.getSettings();
            
            if (!settings || !settings.apiClientId || !settings.apiSecret || !settings.environmentId) {
                throw new Error('Missing required settings. Please configure your API credentials first.');
            }
            
            // Use the local client from the factory
            const response = await this.localClient.post('/api/pingone/test-connection', {
                apiClientId: settings.apiClientId,
                apiSecret: settings.apiSecret,
                environmentId: settings.environmentId,
                region: settings.region || 'NorthAmerica',
                populationId: settings.populationId
            });
            
            let warning = '';
            if (response.success) {
                this.logger.fileLogger.info('Successfully connected to PingOne API');
                
                // Update connection status in settings
                settings.connectionStatus = 'connected';
                settings.connectionMessage = 'Connected';
                settings.lastConnectionTest = new Date().toISOString();
                
                // Save updated settings
                await this.settingsManager.saveSettings(settings);
                
                // Update UI status
                this.uiManager.updateConnectionStatus('connected', '✅ PingOne Worker token still valid');
                
                // Show population validation message if present
                if (response.message && response.message.includes('⚠️ Warning:')) {
                    warning = response.message;
                } else if (response.message && response.message.includes('✅ Population ID')) {
                    warning = response.message;
                }
                
                return { success: true, warning };
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
    
    /**
     * Refresh the PingOne worker token by clearing the cache and getting a new one
     * @returns {Promise<Object>} Result of the token refresh
     */
    async refreshToken() {
        try {
            this.logger.fileLogger.info('Refreshing PingOne worker token');
            
            // Show refreshing status in UI
            this.uiManager.updateConnectionStatus('connecting', 'Refreshing token...');
            
            // Clear the cached token
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem('pingone_worker_token');
                localStorage.removeItem('pingone_token_expiry');
                this.logger.fileLogger.info('Cleared cached token');
            }
            
            // Get current settings
            const settings = this.settingsManager.getSettings();
            
            if (!settings || !settings.apiClientId || !settings.apiSecret || !settings.environmentId) {
                throw new Error('Missing required settings. Please configure your API credentials first.');
            }
            
            // Use the dedicated refresh token endpoint that bypasses population validation
            const response = await fetch('/api/pingone/refresh-token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
                throw new Error(errorData.message || `Token refresh failed: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.success) {
                this.logger.fileLogger.info('Successfully refreshed PingOne worker token');
                this.uiManager.updateConnectionStatus('connected', result.message || '✅ Token refreshed successfully');
                this.uiManager.showNotification('✅ Token refreshed successfully', 'success');
                return { success: true };
            } else {
                throw new Error(result.message || 'Failed to refresh token');
            }
        } catch (error) {
            const errorMessage = error.message || 'Token refresh failed';
            this.logger.fileLogger.error('Failed to refresh token', { error: errorMessage });
            
            // Update UI status
            this.uiManager.updateConnectionStatus('error', errorMessage);
            this.uiManager.showNotification(`❌ Token refresh failed: ${errorMessage}`, 'error');
            
            return { success: false, error: errorMessage };
        }
    }
    
    async startImport() {
        if (this.isImporting) return;
        this.isImporting = true;
        this.uiManager.setImporting(true);
        
        // Create AbortController for cancellation
        this.currentImportAbortController = new AbortController();
        
        try {
            // Get the parsed users from the file handler
            const users = this.fileHandler.getParsedUsers();
            if (!users || users.length === 0) {
                throw new Error('No users found in CSV file. Please check your file and try again.');
            }

            // Show import progress with population name
            this.uiManager.showImportStatus(users.length, importOptions.selectedPopulationName);
            this.uiManager.updateImportProgress(0, 0, 'Starting import...', {
                success: 0,
                failed: 0,
                skipped: 0
            }, importOptions.selectedPopulationName);

            // Get import options
            const importOptions = this.getImportOptions();
            this.logger.fileLogger.info('Import options', importOptions);

            // Validate population selection
            const hasSelectedPopulation = importOptions.selectedPopulationId && importOptions.selectedPopulationId.trim() !== '';
            const useDefaultPopulation = importOptions.useDefaultPopulation;
            const useCsvPopulationId = importOptions.useCsvPopulationId;
            
            // Check if user has made a population choice
            if (!hasSelectedPopulation && !useDefaultPopulation && !useCsvPopulationId) {
                throw new Error('Please select a population or choose "Use default population from settings" before importing users.');
            }

            // Check if CSV population ID is enabled but not available
            if (importOptions.useCsvPopulationId) {
                const hasCsvPopulationId = await this.checkCsvPopulationIdAvailability(users);
                if (!hasCsvPopulationId) {
                    // Show modal to ask user what to do
                    const modalResult = await this.handlePopulationIdMissing();
                    if (modalResult.action === 'back') {
                        this.isImporting = false;
                        this.currentImportAbortController = null;
                        return; // User chose to go back
                    }
                    // User chose to continue with fallback
                    this.logger.fileLogger.info('User chose to continue with fallback population');
                }
            }

            this.logger.fileLogger.info('Starting import process', {
                totalUsers: users.length,
                hasUsers: !!users,
                userSample: users.slice(0, 3).map(u => ({ email: u.email, username: u.username })),
                importOptions
            });

            // Validate users before starting import
            const validationResults = this.validateUsersForImport(users);
            if (validationResults.invalidUsers.length > 0) {
                this.logger.fileLogger.warn('Some users failed validation', {
                    totalUsers: users.length,
                    validUsers: validationResults.validUsers.length,
                    invalidUsers: validationResults.invalidUsers.length,
                    validationErrors: validationResults.errors
                });
                
                // Show warning but continue with valid users
                this.uiManager.showNotification(
                    `${validationResults.invalidUsers.length} users failed validation and will be skipped. ${validationResults.validUsers.length} users will be imported.`,
                    'warning'
                );
            }

            // Use only valid users for import
            const validUsers = validationResults.validUsers;
            if (validUsers.length === 0) {
                throw new Error('No valid users found in CSV file. Please check your data and try again.');
            }

            // Start the import process with improved options and AbortController
            const pingOneImportOptions = {
                onProgress: (current, total, user, counts) => {
                    // Check if import was cancelled
                    if (this.currentImportAbortController.signal.aborted) {
                        throw new Error('Import cancelled by user');
                    }
                    
                    this.uiManager.updateImportProgress(current, total, `Importing user ${current}/${total}...`, counts, importOptions.selectedPopulationName);
                    
                    // Log progress for debugging
                    if (current % 10 === 0 || current === total) {
                        this.logger.fileLogger.info('Import progress', {
                            current,
                            total,
                            success: counts.success,
                            failed: counts.failed,
                            skipped: counts.skipped,
                            retries: counts.retries || 0
                        });
                    }
                },
                retryAttempts: 3,
                delayBetweenRetries: 1000,
                continueOnError: true,
                importOptions, // Pass population selection options
                abortController: this.currentImportAbortController // Pass AbortController for cancellation
            };

            this.logger.fileLogger.info('Starting PingOne import', {
                totalUsers: validUsers.length,
                pingOneImportOptions
            });

            const results = await this.pingOneClient.importUsers(validUsers, pingOneImportOptions);

            // Log final results
            this.logger.fileLogger.info('Import completed', {
                total: results.total,
                success: results.success,
                failed: results.failed,
                skipped: results.skipped,
                retries: results.retries || 0
            });

            // Show final progress
            this.uiManager.updateImportProgress(results.total, results.total, 'Import completed!', {
                success: results.success,
                failed: results.failed,
                skipped: results.skipped
            }, importOptions.selectedPopulationName);

            // Show completion message
            let message = `Import completed! Successfully imported ${results.success} users.`;
            if (results.failed > 0) {
                message += ` ${results.failed} users failed.`;
            }
            if (results.skipped > 0) {
                message += ` ${results.skipped} users were skipped.`;
            }
            if (results.retries > 0) {
                message += ` ${results.retries} retries were performed.`;
            }

            this.uiManager.showNotification(message, results.failed > 0 ? 'warning' : 'success');

            // Log detailed results for debugging
            if (results.results && results.results.length > 0) {
                const failedResults = results.results.filter(r => !r.success && !r.skipped);
                if (failedResults.length > 0) {
                    this.logger.fileLogger.warn('Failed imports', {
                        failedCount: failedResults.length,
                        failures: failedResults.map(r => ({
                            user: r.user.email || r.user.username,
                            error: r.error
                        }))
                    });
                }
            }

        } catch (error) {
            // Check if this was a cancellation
            if (error.message === 'Import cancelled by user' || error.name === 'AbortError') {
                this.logger.fileLogger.info('Import cancelled by user');
                this.uiManager.updateImportProgress(0, 0, 'Import cancelled', {
                    success: 0,
                    failed: 0,
                    skipped: 0
                }, importOptions.selectedPopulationName);
                this.uiManager.showNotification('Import cancelled by user', 'warning');
                return;
            }
            
            this.logger.fileLogger.error('Import failed', {
                error: error.message,
                stack: error.stack
            });

            let errorMessage = 'Import failed. ';
            if (error.message.includes('No users found')) {
                errorMessage += 'Please check your CSV file and ensure it contains valid user data.';
            } else if (error.message.includes('Environment ID not configured')) {
                errorMessage += 'Please configure your PingOne settings first.';
            } else if (error.message.includes('No populations found')) {
                errorMessage += 'No populations found in PingOne. Please create a population first.';
            } else if (error.message.includes('rate limit')) {
                errorMessage += 'Rate limit exceeded. Please wait a moment and try again.';
            } else {
                errorMessage += error.message;
            }

            this.uiManager.showNotification(errorMessage, 'error');
            this.uiManager.updateImportProgress(0, 0, 'Import failed', {
                success: 0,
                failed: 0,
                skipped: 0
            }, importOptions.selectedPopulationName);

        } finally {
            this.isImporting = false;
            this.currentImportAbortController = null;
            
            // Import status will persist until user manually closes it
            this.uiManager.setImporting(false);
            this.uiManager.showLoading(false); // Hide spinner
        }
    }

    /**
     * Validate users for import
     * @param {Array<Object>} users - Users to validate
     * @returns {Object} Validation results
     * @private
     */
    validateUsersForImport(users) {
        const validUsers = [];
        const invalidUsers = [];
        const errors = [];

        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            const validationError = this.validateUser(user, i + 1);
            
            if (validationError) {
                invalidUsers.push(user);
                errors.push({
                    row: i + 1,
                    user: user.email || user.username || `Row ${i + 1}`,
                    error: validationError
                });
            } else {
                validUsers.push(user);
            }
        }

        return {
            validUsers,
            invalidUsers,
            errors
        };
    }

    /**
     * Validate a single user
     * @param {Object} user - User to validate
     * @param {number} rowNumber - Row number for error reporting
     * @returns {string|null} Error message or null if valid
     * @private
     */
    validateUser(user, rowNumber) {
        // Check required fields
        if (!user.username) {
            return `Row ${rowNumber}: User must have a username`;
        }

        // Validate email format if provided
        if (user.email && !this.isValidEmail(user.email)) {
            return `Row ${rowNumber}: Invalid email format '${user.email}'`;
        }

        // Validate username format if provided
        if (user.username && !this.isValidUsername(user.username)) {
            return `Row ${rowNumber}: Invalid username format '${user.username}' (no spaces or special characters)`;
        }

        // Validate enabled field if provided
        if (user.enabled !== undefined && user.enabled !== null) {
            const enabledValue = String(user.enabled).toLowerCase();
            if (enabledValue !== 'true' && enabledValue !== 'false' && enabledValue !== '1' && enabledValue !== '0') {
                return `Row ${rowNumber}: Enabled field must be true/false or 1/0, got '${user.enabled}'`;
            }
        }

        return null;
    }

    /**
     * Check if email is valid
     * @param {string} email - Email to validate
     * @returns {boolean} True if valid
     * @private
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Check if username is valid
     * @param {string} username - Username to validate
     * @returns {boolean} True if valid
     * @private
     */
    isValidUsername(username) {
        // Username should not contain spaces or special characters
        const usernameRegex = /^[a-zA-Z0-9._-]+$/;
        return usernameRegex.test(username);
    }

    cancelImport() {
        if (this.currentImportAbortController) {
            this.currentImportAbortController.abort();
            this.logger.fileLogger.info('Canceling import');
        }
        
        // Update UI to show "Stopped" state
        this.uiManager.setImportButtonText('Stopped');
        this.uiManager.showNotification('Import cancelled by user', 'warning');
        
        // Update progress screen cancel button text
        const cancelProgressBtn = document.getElementById('cancel-import-progress');
        if (cancelProgressBtn) {
            cancelProgressBtn.innerHTML = '<i class="fas fa-stop"></i> Stopped';
            cancelProgressBtn.disabled = true;
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
        const confirmed = await this.confirmDeleteAction('<strong>⚠️ WARNING:</strong> This will permanently delete the selected users from PingOne. This action cannot be undone.<br><br>Type <b>DELETE</b> to confirm.');
        if (!confirmed) return;
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
            this.uiManager.showLoading(false); // Hide spinner
        }
    }

    cancelDeleteCsv() {
        this.isDeletingCsv = false;
        this.uiManager.setDeletingCsv(false);
        this.uiManager.updateDeleteCsvProgress(0, 0, 'Delete cancelled');
    }

    showDeleteCsvFileInfo(file) {
        // Use the enhanced file info display from file handler
        this.fileHandler.updateFileInfoForElement(file, 'delete-csv-file-info');
    }

    showModifyCsvFileInfo(file) {
        // Use the enhanced file info display from file handler
        this.fileHandler.updateFileInfoForElement(file, 'modify-file-info');
    }

    async parseCsvFile(file, previewContainerId) {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
        
        if (lines.length < 2) {
            throw new Error('CSV must contain at least a header row and one data row');
        }
        
        // Parse headers using proper CSV parsing
        const headers = this.parseCSVLine(lines[0]);
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
            const values = this.parseCSVLine(lines[i]);
            if (values.length !== headers.length) {
                console.warn(`Row ${i + 1} has ${values.length} values but expected ${headers.length}, skipping`);
                continue;
            }
            
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

    parseCSVLine(line, delimiter = ',') {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];
            
            if (char === '"') {
                if (nextChar === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === delimiter && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current);
        return result.map(field => field.trim());
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
            
            // Use the file handler's handleFileObject method
            await this.fileHandler.handleFileObject(file);
            
        } catch (error) {
            const errorMsg = error.message || 'An unknown error occurred while processing the file';
            this.logger.fileLogger.error('Error processing file', { error: errorMsg });
            this.uiManager.showNotification(errorMsg, 'error');
            console.error('File processing error:', error);
            throw error; // Re-throw to allow caller to handle if needed
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
     * Updates the delete CSV button state based on settings and users
     */
    updateDeleteCsvButtonState() {
        try {
            const settings = this.settingsManager.getSettings();
            const hasRequiredSettings = settings.environmentId && settings.region;
            const hasDeleteUsers = Array.isArray(this.deleteCsvUsers) && this.deleteCsvUsers.length > 0;

            // Enable Delete button only if both settings and delete users are valid
            const enableDelete = hasRequiredSettings && hasDeleteUsers;
            this.uiManager.setDeleteCsvButtonState(enableDelete);

            return enableDelete;
        } catch (error) {
            this.logger.fileLogger.error('Error updating delete button state', { error: error.message });
            this.uiManager.setDeleteCsvButtonState(false);
            return false;
        }
    }

    /**
     * Updates the modify CSV button state based on settings and users
     */
    updateModifyCsvButtonState() {
        try {
            const settings = this.settingsManager.getSettings();
            const hasRequiredSettings = settings.environmentId && settings.region;
            const hasModifyUsers = Array.isArray(this.modifyCsvUsers) && this.modifyCsvUsers.length > 0;

            // Add debugging
            console.log('updateModifyCsvButtonState called:', {
                settings: settings,
                hasRequiredSettings: hasRequiredSettings,
                modifyCsvUsers: this.modifyCsvUsers,
                hasModifyUsers: hasModifyUsers
            });

            // Enable Modify button only if both settings and modify users are valid
            const enableModify = hasRequiredSettings && hasModifyUsers;
            this.uiManager.setModifyCsvButtonState(enableModify);

            console.log('Modify button state set to:', enableModify);
            return enableModify;
        } catch (error) {
            this.logger.fileLogger.error('Error updating modify button state', { error: error.message });
            this.uiManager.setModifyCsvButtonState(false);
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
                'rate-limit': settings.rateLimit || 50
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
    
    setupDisclaimerAgreement() {
        const acceptButton = document.getElementById('accept-disclaimer');
        const agreementCheckboxes = [
            document.getElementById('disclaimer-agreement'),
            document.getElementById('risk-acceptance')
        ];
        
        console.log('[DEBUG] Disclaimer setup: acceptButton', !!acceptButton, 'checkboxes', agreementCheckboxes.map(cb => !!cb));
        if (!acceptButton) {
            console.error('[ERROR] Disclaimer accept button not found');
            return;
        }
        if (agreementCheckboxes.every(cb => !cb)) {
            console.error('[ERROR] Disclaimer checkboxes not found');
        }
        
        // Always enable the button
        acceptButton.disabled = false;
        
        // Add event listeners to checkboxes for debugging
        agreementCheckboxes.forEach(checkbox => {
            if (checkbox) {
                checkbox.addEventListener('change', () => {
                    console.log('[DEBUG] Checkbox changed:', checkbox.id, 'checked:', checkbox.checked);
                });
            }
        });
        
        // Add event listener to accept button
        acceptButton.addEventListener('click', () => {
            console.log('[DEBUG] Disclaimer accept button clicked.');
            // Store agreement in localStorage
            localStorage.setItem('disclaimer-agreed', 'true');
            localStorage.setItem('disclaimer-agreed-date', new Date().toISOString());
            // Hide disclaimer and show feature cards
            const disclaimer = document.getElementById('disclaimer');
            const featureCards = document.querySelector('.feature-cards');
            if (disclaimer) {
                disclaimer.style.display = 'none';
            }
            if (featureCards) {
                featureCards.style.display = 'grid';
            }
            // Make button green and keep it green
            acceptButton.classList.add('btn-success');
            acceptButton.classList.remove('btn-danger');
            acceptButton.innerHTML = '<i class="fas fa-check-circle"></i> I UNDERSTAND AND ACCEPT ALL RISKS';
            this.uiManager.showNotification('Disclaimer accepted. You can now use the tool.', 'success');
            this.logger.fileLogger.info('User accepted disclaimer agreement');
        });
        // Check if user has already agreed
        const hasAgreed = localStorage.getItem('disclaimer-agreed');
        const disclaimer = document.getElementById('disclaimer');
        const featureCards = document.querySelector('.feature-cards');
        if (hasAgreed === 'true') {
            if (disclaimer) {
                disclaimer.style.display = 'none';
            }
            if (featureCards) {
                featureCards.style.display = 'grid';
            }
            // Make button green and keep it green
            acceptButton.classList.add('btn-success');
            acceptButton.classList.remove('btn-danger');
            acceptButton.innerHTML = '<i class="fas fa-check-circle"></i> I UNDERSTAND AND ACCEPT ALL RISKS';
        } else {
            if (disclaimer) {
                disclaimer.style.display = 'block';
            }
            if (featureCards) {
                featureCards.style.display = 'none';
            }
        }
    }

    async startModifyCsv() {
        if (this.isModifying) return;
        this.isModifying = true;
        this.uiManager.setModifying(true);
        try {
            // Get modify options from UI
            const modifyOptions = this.getModifyOptions();
            
            this.logger.fileLogger.info('Starting modify operation with options', {
                totalUsers: this.modifyCsvUsers.length,
                createIfNotExists: modifyOptions.createIfNotExists,
                updateUserStatus: modifyOptions.updateUserStatus,
                defaultPopulationId: modifyOptions.defaultPopulationId,
                defaultEnabled: modifyOptions.defaultEnabled,
                generatePasswords: modifyOptions.generatePasswords
            });

            const results = await this.pingOneClient.modifyUsersFromCsv(this.modifyCsvUsers, {
                onProgress: (progress) => {
                    this.uiManager.updateModifyProgress(
                        progress.current,
                        progress.total,
                        `Modifying user ${progress.current} of ${progress.total}...`,
                        progress
                    );
                },
                createIfNotExists: modifyOptions.createIfNotExists,
                updateUserStatus: modifyOptions.updateUserStatus,
                defaultPopulationId: modifyOptions.defaultPopulationId,
                defaultEnabled: modifyOptions.defaultEnabled,
                generatePasswords: modifyOptions.generatePasswords
            });
            
            this.uiManager.updateModifyProgress(
                results.total,
                results.total,
                `Modify completed. Modified: ${results.modified}, Created: ${results.created || 0}, Failed: ${results.failed}, Skipped: ${results.skipped}, No Changes: ${results.noChanges}`,
                results
            );
        } catch (error) {
            this.uiManager.updateModifyProgress(0, 0, `Modify failed: ${error.message}`);
        } finally {
            this.isModifying = false;
            this.uiManager.setModifying(false);
            this.uiManager.showLoading(false); // Hide spinner
        }
    }

    cancelModifyCsv() {
        if (this.currentModifyAbortController) {
            this.currentModifyAbortController.abort();
            this.logger.fileLogger.info('Canceling modify operation');
        }
        this.isModifying = false;
        this.uiManager.resetModifyState();
    }

    /**
     * Generate a sequential filename for exports
     * @param {string} baseName - Base filename without extension
     * @param {string} extension - File extension (e.g., 'csv', 'json')
     * @returns {string} Filename with sequential number
     */
    generateSequentialFilename(baseName, extension) {
        // Get the current counter from localStorage or start at 1
        const counterKey = `export_counter_${baseName}`;
        let counter = parseInt(localStorage.getItem(counterKey) || '0') + 1;
        
        // Save the updated counter
        localStorage.setItem(counterKey, counter.toString());
        
        // Generate filename with sequential number
        const date = new Date().toISOString().split('T')[0];
        return `${baseName}-${date}-${counter.toString().padStart(3, '0')}.${extension}`;
    }

    // Export functionality
    async startExport() {
        if (this.isExporting) return;
        this.isExporting = true;
        this.currentExportAbortController = new AbortController(); // Always initialize
        this.uiManager.setExporting(true);
        try {
            // Set export button to show "Exporting..." state
            this.uiManager.showExportStatus();
            this.uiManager.updateExportProgress(0, 0, 'Preparing export...');

            // Get export options
            const populationSelect = document.getElementById('export-population-select');
            const populationIdInput = document.getElementById('export-population-id');
            const fieldsSelect = document.getElementById('export-fields-select');
            const formatSelect = document.getElementById('export-format-select');
            const ignoreDisabledUsersCheckbox = document.getElementById('ignore-disabled-users');

            // Check if manual population ID is provided, otherwise use dropdown selection
            const populationId = populationIdInput.value.trim() || populationSelect.value;
            const fields = fieldsSelect.value;
            const format = formatSelect.value;
            const ignoreDisabledUsers = ignoreDisabledUsersCheckbox.checked;

            this.logger.fileLogger.info('Starting user export', {
                populationId: populationId || 'all',
                fields,
                format,
                ignoreDisabledUsers
            });

            // Make export request
            const response = await fetch('/api/export-users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    populationId: populationId || '',
                    fields,
                    format,
                    ignoreDisabledUsers
                }),
                signal: this.currentExportAbortController ? this.currentExportAbortController.signal : undefined
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `Export failed with status ${response.status}`);
            }

            if (format === 'json') {
                // Handle JSON response
                const data = await response.json();
                this.uiManager.updateExportProgress(data.total, data.total, 'Export completed');
                this.uiManager.updateExportStats({
                    exported: data.total,
                    failed: 0,
                    skipped: 0,
                    ignored: data.ignored || 0
                });

                // Log ignored users if any
                if ((data.ignored || 0) > 0) {
                    const msg = `Ignored ${data.ignored} disabled user(s) during export.`;
                    this.logger.info(msg);
                    this.logger.fileLogger.info(msg);
                    this.uiManager.showInfo(msg);
                }

                // Create JSON file content
                const jsonContent = JSON.stringify(data.users, null, 2);
                const fileName = this.generateSequentialFilename('pingone-users-export', 'json');
                
                // Try to use File System Access API for save dialog, fallback to download
                await this.saveFileWithDialog(jsonContent, fileName, 'application/json');

                this.logger.fileLogger.info('Export completed successfully', {
                    total: data.total,
                    format: 'json',
                    filename: fileName
                });
            } else {
                // Handle CSV response
                const csvContent = await response.text();
                const userCount = csvContent.split('\n').length - 1; // Subtract header row
                this.uiManager.updateExportProgress(userCount, userCount, 'Export completed');
                
                // For CSV, we need to get the ignored count from response headers or make a separate call
                const ignoredCount = parseInt(response.headers.get('X-Ignored-Count') || '0');
                this.uiManager.updateExportStats({
                    exported: userCount,
                    failed: 0,
                    skipped: 0,
                    ignored: ignoredCount
                });

                // Log ignored users if any
                if (ignoredCount > 0) {
                    const msg = `Ignored ${ignoredCount} disabled user(s) during export.`;
                    this.logger.info(msg);
                    this.logger.fileLogger.info(msg);
                    this.uiManager.showInfo(msg);
                }

                // Create CSV file
                const fileName = this.generateSequentialFilename('pingone-users-export', 'csv');
                
                // Try to use File System Access API for save dialog, fallback to download
                await this.saveFileWithDialog(csvContent, fileName, 'text/csv');

                this.logger.fileLogger.info('Export completed successfully', {
                    total: userCount,
                    format: 'csv',
                    filename: fileName
                });
            }

            this.uiManager.showSuccess('Export completed successfully');
            this.isExporting = false;
            this.currentExportAbortController = null;
            
            // Reset export button back to "Export Users"
            this.uiManager.setExporting(false);

        } catch (error) {
            if (error.name === 'AbortError') {
                this.logger.fileLogger.info('Export cancelled by user');
                this.uiManager.showInfo('Export cancelled');
            } else {
                const errorMsg = `Export failed: ${error.message}`;
                this.logger.fileLogger.error(errorMsg, { error });
                this.uiManager.showError('Export Error', errorMsg);
            }
            this.isExporting = false;
            this.currentExportAbortController = null;
            
            // Reset export button back to "Export Users" even on error
            this.uiManager.setExporting(false);
        } finally {
            this.isExporting = false;
            this.currentExportAbortController = null;
            this.uiManager.setExporting(false);
            this.uiManager.showLoading(false); // Hide spinner
            this.uiManager.showExportButton(); // <-- Ensure export button is visible after export
        }
    }

    cancelExport() {
        if (this.currentExportAbortController) {
            this.currentExportAbortController.abort();
            this.currentExportAbortController = null;
        }
        this.isExporting = false;
        this.uiManager.hideExportStatus();
        this.uiManager.showExportButton();
        
        // Reset export button back to "Export Users"
        this.uiManager.setExporting(false);
    }

    async saveFileWithDialog(content, fileName, mimeType) {
        let fileSaved = false;
        
        try {
            // Check if File System Access API is supported
            if ('showSaveFilePicker' in window) {
                try {
                    // Use File System Access API for save dialog
                    const options = {
                        suggestedName: fileName,
                        types: [{
                            description: mimeType === 'application/json' ? 'JSON File' : 'CSV File',
                            accept: {
                                [mimeType]: [`.${fileName.split('.').pop()}`]
                            }
                        }]
                    };

                    const fileHandle = await window.showSaveFilePicker(options);
                    const writable = await fileHandle.createWritable();
                    await writable.write(content);
                    await writable.close();
                    
                    this.logger.fileLogger.info('File saved using File System Access API', {
                        fileName,
                        mimeType
                    });
                    
                    fileSaved = true;
                    
                    // Show success message to user
                    this.uiManager.showSuccess(`File saved successfully: ${fileName}`);
                    
                } catch (fsError) {
                    // If File System Access API fails, fall back to download
                    this.logger.fileLogger.warn('File System Access API failed, falling back to download', { 
                        error: fsError.message,
                        fileName,
                        mimeType 
                    });
                }
            }
            
            // Fallback to traditional download if not already saved
            if (!fileSaved) {
                const blob = new Blob([content], { type: mimeType });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                this.logger.fileLogger.info('File downloaded using fallback method', {
                    fileName,
                    mimeType
                });
                
                fileSaved = true;
                
                // Show success message to user
                this.uiManager.showSuccess(`File downloaded successfully: ${fileName}`);
            }
            
            // After successful save, attempt to open the file with preferred application
            if (fileSaved) {
                await this.openFileAfterExport(content, fileName, mimeType);
            }
            
        } catch (error) {
            this.logger.fileLogger.error('Error saving file', { error, fileName, mimeType });
            throw new Error(`Failed to save file: ${error.message}`);
        }
    }

    async loadPopulationsForExport() {
        try {
            console.log('Loading populations for export...');
            
            // First check if PingOne is connected
            const healthResponse = await fetch('/api/health');
            if (healthResponse.ok) {
                const healthData = await healthResponse.json();
                if (healthData.server && !healthData.server.pingOne) {
                    // PingOne is not connected, show warning but allow export
                    this.uiManager.showWarning('Export Warning', 'PingOne is not connected. You can still export users, but you may need to configure your settings first.');
                    
                    // Set default option for all populations
                    const populationSelect = document.getElementById('export-population-select');
                    populationSelect.innerHTML = '<option value="">All Populations (PingOne not connected)</option>';
                    
                    // Enable export button even when PingOne is not connected (users can manually enter population ID)
                    const exportBtn = document.getElementById('start-export-btn');
                    if (exportBtn) {
                        exportBtn.disabled = false;
                    }
                    return;
                }
            }

            // Get populations from PingOne
            const response = await fetch('/api/pingone/populations');
            if (!response.ok) {
                throw new Error(`Failed to fetch populations: ${response.status}`);
            }

            const populations = await response.json();
            console.log('Populations loaded:', populations);

            // Update export population select
            const exportPopulationSelect = document.getElementById('export-population-select');
            if (exportPopulationSelect) {
                exportPopulationSelect.innerHTML = '<option value="">All Populations</option>';
                populations.forEach(population => {
                    const option = document.createElement('option');
                    option.value = population.id;
                    option.textContent = population.name;
                    exportPopulationSelect.appendChild(option);
                });
            }

            // Update import population select
            const importPopulationSelect = document.getElementById('import-population-select');
            if (importPopulationSelect) {
                importPopulationSelect.innerHTML = '<option value="">Select a population...</option>';
                populations.forEach(population => {
                    const option = document.createElement('option');
                    option.value = population.id;
                    option.textContent = population.name;
                    importPopulationSelect.appendChild(option);
                });
            }

            // Enable export button
            const exportBtn = document.getElementById('start-export-btn');
            if (exportBtn) {
                exportBtn.disabled = false;
            }

        } catch (error) {
            console.error('Error loading populations:', error);
            this.logger.fileLogger.error('Failed to load populations', { error: error.message });
            
            // Show error but don't block the UI
            this.uiManager.showWarning('Population Loading Warning', 
                'Failed to load populations from PingOne. You can still use manual population ID entry.');
            
            // Set default options
            const exportPopulationSelect = document.getElementById('export-population-select');
            const importPopulationSelect = document.getElementById('import-population-select');
            
            if (exportPopulationSelect) {
                exportPopulationSelect.innerHTML = '<option value="">All Populations (Error loading)</option>';
            }
            if (importPopulationSelect) {
                importPopulationSelect.innerHTML = '<option value="">Select a population... (Error loading)</option>';
            }
        }
    }

    async loadPopulationsForImport() {
        try {
            console.log('Loading populations for import...');
            
            // First check if PingOne is connected
            const healthResponse = await fetch('/api/health');
            if (healthResponse.ok) {
                const healthData = await healthResponse.json();
                if (healthData.server && !healthData.server.pingOne) {
                    // PingOne is not connected, show warning
                    this.uiManager.showWarning('Import Warning', 'PingOne is not connected. Please configure your settings first.');
                    
                    // Set default option
                    const importPopulationSelect = document.getElementById('import-population-select');
                    if (importPopulationSelect) {
                        importPopulationSelect.innerHTML = '<option value="">PingOne not connected</option>';
                    }
                    return;
                }
            }

            // Get populations from PingOne
            const response = await fetch('/api/pingone/populations');
            if (!response.ok) {
                throw new Error(`Failed to fetch populations: ${response.status}`);
            }

            const populations = await response.json();
            console.log('Import populations loaded:', populations);

            // Update import population select
            const importPopulationSelect = document.getElementById('import-population-select');
            if (importPopulationSelect) {
                importPopulationSelect.innerHTML = '<option value="">Select a population...</option>';
                populations.forEach(population => {
                    const option = document.createElement('option');
                    option.value = population.id;
                    option.textContent = population.name;
                    importPopulationSelect.appendChild(option);
                });
            }

        } catch (error) {
            console.error('Error loading populations for import:', error);
            this.logger.fileLogger.error('Failed to load populations for import', { error: error.message });
            
            // Show error but don't block the UI
            this.uiManager.showWarning('Population Loading Warning', 
                'Failed to load populations from PingOne. You can still use default population or manual entry.');
            
            // Set default option
            const importPopulationSelect = document.getElementById('import-population-select');
            if (importPopulationSelect) {
                importPopulationSelect.innerHTML = '<option value="">Error loading populations</option>';
            }
        }
    }

    /**
     * Save export preferences to localStorage
     */
    saveExportPreferences() {
        const openAfterExport = document.getElementById('open-after-export')?.checked || false;
        const preferredCsvApp = document.getElementById('preferred-csv-app')?.value || '';
        const customAppPath = document.getElementById('custom-app-path')?.value || '';
        
        const preferences = {
            openAfterExport,
            preferredCsvApp,
            customAppPath
        };
        
        localStorage.setItem('exportPreferences', JSON.stringify(preferences));
        
        this.logger.fileLogger.info('Export preferences saved', preferences);
    }

    /**
     * Load export preferences from localStorage
     */
    loadExportPreferences() {
        try {
            const savedPreferences = localStorage.getItem('exportPreferences');
            if (savedPreferences) {
                const preferences = JSON.parse(savedPreferences);
                
                const openAfterExport = document.getElementById('open-after-export');
                const preferredCsvApp = document.getElementById('preferred-csv-app');
                const customAppPath = document.getElementById('custom-app-path');
                const customAppPathGroup = document.getElementById('custom-app-path-group');
                
                if (openAfterExport) {
                    openAfterExport.checked = false; // Always unchecked on load
                }
                
                if (preferredCsvApp) {
                    preferredCsvApp.value = preferences.preferredCsvApp || '';
                }
                
                if (customAppPath) {
                    customAppPath.value = preferences.customAppPath || '';
                }
                
                // Show/hide custom app path group based on selection
                if (customAppPathGroup) {
                    customAppPathGroup.style.display = preferences.preferredCsvApp === 'custom' ? 'block' : 'none';
                }
                
                this.logger.fileLogger.info('Export preferences loaded', preferences);
            }
        } catch (error) {
            this.logger.fileLogger.error('Failed to load export preferences', { error });
        }
    }

    /**
     * Open file with preferred application after export
     */
    async openFileAfterExport(content, fileName, mimeType) {
        try {
            const preferences = JSON.parse(localStorage.getItem('exportPreferences') || '{}');
            
            if (!preferences.openAfterExport) {
                return; // User doesn't want to open file after export
            }
            
            // Create a blob URL for the file
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            
            const preferredApp = preferences.preferredCsvApp || '';
            
            // Handle different preferred applications
            switch (preferredApp) {
                case 'excel':
                    await this.openWithExcel(url, fileName);
                    break;
                case 'sheets':
                    await this.openWithGoogleSheets(content, fileName);
                    break;
                case 'calc':
                    await this.openWithLibreOffice(url, fileName);
                    break;
                case 'numbers':
                    await this.openWithNumbers(url, fileName);
                    break;
                case 'notepad':
                    await this.openWithTextEditor(url, fileName);
                    break;
                case 'custom':
                    await this.openWithCustomApp(url, fileName, preferences.customAppPath);
                    break;
                default:
                    // Open with system default
                    await this.openWithSystemDefault(url, fileName);
                    break;
            }
            
            // Clean up blob URL after a delay
            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 10000);
            
            this.logger.fileLogger.info('File opened with preferred application', {
                fileName,
                preferredApp: preferredApp || 'system default'
            });
            
        } catch (error) {
            this.logger.fileLogger.error('Failed to open file with preferred application', { 
                error, 
                fileName 
            });
            this.uiManager.showWarning('File Open Warning', 
                `Could not open file with preferred application: ${error.message}. File was saved successfully.`);
        }
    }

    /**
     * Open file with system default application
     */
    async openWithSystemDefault(url, fileName) {
        // Detect macOS
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        
        if (isMac) {
            // On macOS, browsers can't directly launch applications due to security restrictions
            // Show macOS-specific instructions
            this.uiManager.showInfo('File Download Complete (macOS)', 
                `File ${fileName} has been downloaded successfully.\n\n` +
                `To open the file on macOS:\n` +
                `1. Check your Downloads folder\n` +
                `2. Double-click the file to open with your default application\n` +
                `3. Or right-click and select "Open with" to choose a specific application\n` +
                `4. If the file doesn't open, right-click and select "Open" (this bypasses Gatekeeper)\n\n` +
                `💡 Tip: You can also drag the file to your preferred application's icon in the Dock.`
            );
            return;
        }
        
        // For non-macOS systems, try using window.open first
        try {
            const newWindow = window.open(url, '_blank');
            if (newWindow) {
                this.uiManager.showSuccess(`File opened in new tab: ${fileName}`);
                return;
            }
        } catch (error) {
            this.logger.fileLogger.warn('Failed to open with window.open', { error });
        }
        
        // Fallback: Show instructions
        this.showFileOpenInstructions(fileName);
    }

    /**
     * Open file with Microsoft Excel
     */
    async openWithExcel(url, fileName) {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        
        if (isMac) {
            // On macOS, provide specific instructions for Excel
            this.uiManager.showInfo('Microsoft Excel (macOS)', 
                `File ${fileName} has been downloaded successfully.\n\n` +
                `To open with Microsoft Excel on macOS:\n` +
                `1. Open Microsoft Excel\n` +
                `2. Click "File" > "Open"\n` +
                `3. Navigate to your Downloads folder\n` +
                `4. Select the file and click "Open"\n\n` +
                `💡 Alternative: Right-click the file and select "Open with" > "Microsoft Excel"`
            );
            return;
        }
        
        // For non-macOS systems, try to use the ms-excel protocol
        try {
            const excelUrl = `ms-excel:ofe|u|${url}`;
            window.location.href = excelUrl;
            this.uiManager.showSuccess(`Opening ${fileName} with Microsoft Excel`);
        } catch (error) {
            this.logger.fileLogger.warn('Failed to open with Excel protocol', { error });
            await this.openWithSystemDefault(url, fileName);
        }
    }

    /**
     * Open file with Google Sheets
     */
    async openWithGoogleSheets(content, fileName) {
        try {
            // For Google Sheets, we need to upload the file or provide instructions
            this.uiManager.showInfo('Google Sheets Integration', 
                `File ${fileName} has been downloaded. To open in Google Sheets:\n\n` +
                `1. Go to sheets.google.com\n` +
                `2. Click "File" > "Import"\n` +
                `3. Select the downloaded file\n` +
                `4. Choose your import settings and click "Import data"`
            );
        } catch (error) {
            this.logger.fileLogger.warn('Failed to provide Google Sheets instructions', { error });
            this.showFileOpenInstructions(fileName);
        }
    }

    /**
     * Open file with LibreOffice Calc
     */
    async openWithLibreOffice(url, fileName) {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        
        if (isMac) {
            // On macOS, provide specific instructions for LibreOffice
            this.uiManager.showInfo('LibreOffice Calc (macOS)', 
                `File ${fileName} has been downloaded successfully.\n\n` +
                `To open with LibreOffice Calc on macOS:\n` +
                `1. Open LibreOffice Calc (from Applications folder)\n` +
                `2. Click "File" > "Open"\n` +
                `3. Navigate to your Downloads folder\n` +
                `4. Select the file and click "Open"\n\n` +
                `💡 Alternative: Right-click the file and select "Open with" > "LibreOffice Calc"\n` +
                `💡 Note: If LibreOffice isn't installed, you can download it from libreoffice.org`
            );
            return;
        }
        
        // For non-macOS systems, try to open with system default first
        try {
            await this.openWithSystemDefault(url, fileName);
            
            // Show additional instructions for LibreOffice
            this.uiManager.showInfo('LibreOffice Calc', 
                `File ${fileName} has been downloaded. If LibreOffice Calc doesn't open automatically:\n\n` +
                `1. Open LibreOffice Calc\n` +
                `2. Click "File" > "Open"\n` +
                `3. Select the downloaded file\n` +
                `4. Choose your import settings if prompted`
            );
        } catch (error) {
            this.logger.fileLogger.warn('Failed to open with LibreOffice', { error });
            this.showFileOpenInstructions(fileName);
        }
    }

    /**
     * Open file with Apple Numbers
     */
    async openWithNumbers(url, fileName) {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        
        if (isMac) {
            // On macOS, provide specific instructions for Numbers
            this.uiManager.showInfo('Apple Numbers (macOS)', 
                `File ${fileName} has been downloaded successfully.\n\n` +
                `To open with Apple Numbers on macOS:\n` +
                `1. Open Numbers (from Applications folder or Spotlight)\n` +
                `2. Click "File" > "Open"\n` +
                `3. Navigate to your Downloads folder\n` +
                `4. Select the file and click "Open"\n\n` +
                `💡 Alternative: Right-click the file and select "Open with" > "Numbers"\n` +
                `💡 Tip: You can also drag the file to the Numbers icon in your Dock`
            );
            return;
        }
        
        // For non-macOS systems, try to open with system default first
        try {
            await this.openWithSystemDefault(url, fileName);
            
            // Show additional instructions for Numbers
            this.uiManager.showInfo('Apple Numbers', 
                `File ${fileName} has been downloaded. If Numbers doesn't open automatically:\n\n` +
                `1. Open Numbers\n` +
                `2. Click "File" > "Open"\n` +
                `3. Select the downloaded file\n` +
                `4. Choose your import settings if prompted`
            );
        } catch (error) {
            this.logger.fileLogger.warn('Failed to open with Numbers', { error });
            this.showFileOpenInstructions(fileName);
        }
    }

    /**
     * Open file with text editor
     */
    async openWithTextEditor(url, fileName) {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        
        if (isMac) {
            // On macOS, provide specific instructions for text editors
            this.uiManager.showInfo('Text Editor (macOS)', 
                `File ${fileName} has been downloaded successfully.\n\n` +
                `To open with a text editor on macOS:\n` +
                `1. Right-click the file in Finder\n` +
                `2. Select "Open with" > "TextEdit" (or your preferred editor)\n` +
                `3. Or drag the file to TextEdit in your Applications folder\n\n` +
                `💡 Popular text editors on macOS:\n` +
                `• TextEdit (built-in)\n` +
                `• Visual Studio Code\n` +
                `• Sublime Text\n` +
                `• BBEdit`
            );
            return;
        }
        
        // For non-macOS systems, try to open in a new tab/window as text
        try {
            const newWindow = window.open(url, '_blank');
            if (newWindow) {
                this.uiManager.showSuccess(`File opened in text editor: ${fileName}`);
                return;
            }
        } catch (error) {
            this.logger.fileLogger.warn('Failed to open with text editor', { error });
        }
        
        // Show instructions
        this.uiManager.showInfo('Text Editor', 
            `File ${fileName} has been downloaded. To open in your preferred text editor:\n\n` +
            `1. Right-click the downloaded file\n` +
            `2. Select "Open with" > "Text Editor" (or your preferred editor)\n` +
            `3. The CSV data will be displayed as plain text`
        );
    }

    /**
     * Open file with custom application
     */
    async openWithCustomApp(url, fileName, customPath) {
        try {
            if (!customPath) {
                throw new Error('Custom application path not specified');
            }
            
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            
            if (isMac) {
                // On macOS, provide specific instructions for custom applications
                this.uiManager.showInfo('Custom Application (macOS)', 
                    `File ${fileName} has been downloaded successfully.\n\n` +
                    `To open with your custom application on macOS:\n` +
                    `1. Right-click the file in Finder\n` +
                    `2. Select "Open with" > "Choose another app"\n` +
                    `3. Navigate to: ${customPath}\n` +
                    `4. Select your application and click "Open"\n\n` +
                    `💡 Alternative: Drag the file to your application's icon in the Dock\n` +
                    `💡 Note: You may need to hold Option (⌥) when selecting "Open with" to see all applications`
                );
                return;
            }
            
            // For non-macOS systems, show instructions
            this.uiManager.showInfo('Custom Application', 
                `File ${fileName} has been downloaded. To open with your custom application:\n\n` +
                `1. Locate the downloaded file\n` +
                `2. Right-click and select "Open with" > "Choose another app"\n` +
                `3. Navigate to: ${customPath}\n` +
                `4. Select your application and click "Open"`
            );
        } catch (error) {
            this.logger.fileLogger.warn('Failed to open with custom app', { error });
            this.showFileOpenInstructions(fileName);
        }
    }

    /**
     * Show general file open instructions
     */
    showFileOpenInstructions(fileName) {
        this.uiManager.showInfo('File Download Complete', 
            `File ${fileName} has been downloaded successfully.\n\n` +
            `To open the file:\n` +
            `1. Check your Downloads folder\n` +
            `2. Double-click the file to open with your default application\n` +
            `3. Or right-click and select "Open with" to choose a specific application`
        );
    }

    /**
     * Handle the "create if not exists" checkbox change
     */
    handleCreateIfNotExistsChange() {
        const createIfNotExistsCheckbox = document.getElementById('create-if-not-exists');
        const createOptions = document.getElementById('create-options');
        
        if (createIfNotExistsCheckbox && createOptions) {
            if (createIfNotExistsCheckbox.checked) {
                createOptions.style.display = 'block';
                this.uiManager.showNotification('Users that don\'t exist will be created with the specified options.', 'info');
            } else {
                createOptions.style.display = 'none';
                this.uiManager.showNotification('Users that don\'t exist will be skipped.', 'info');
            }
        }
    }

    /**
     * Load populations for modify options
     */
    async loadModifyPopulations() {
        try {
            const populationSelect = document.getElementById('default-population-select');
            if (!populationSelect) {
                console.warn('Default population select not found');
                return;
            }

            // Clear existing options
            populationSelect.innerHTML = '<option value="">Loading populations...</option>';

            // Get populations from PingOne
            const populations = await this.pingOneClient.getPopulations();
            
            if (populations && populations._embedded && populations._embedded.populations) {
                // Clear loading option
                populationSelect.innerHTML = '';
                
                // Add populations to select
                populations._embedded.populations.forEach(population => {
                    const option = document.createElement('option');
                    option.value = population.id;
                    option.textContent = population.name || population.id;
                    populationSelect.appendChild(option);
                });

                // Set default to first population if available
                if (populations._embedded.populations.length > 0) {
                    populationSelect.value = populations._embedded.populations[0].id;
                }

                console.log('Loaded populations for modify options:', populations._embedded.populations.length);
            } else {
                populationSelect.innerHTML = '<option value="">No populations found</option>';
                console.warn('No populations found for modify options');
            }
        } catch (error) {
            console.error('Failed to load populations for modify options:', error);
            const populationSelect = document.getElementById('default-population-select');
            if (populationSelect) {
                populationSelect.innerHTML = '<option value="">Error loading populations</option>';
            }
        }
    }

    /**
     * Get modify options from UI
     */
    getModifyOptions() {
        const createIfNotExists = document.getElementById('create-if-not-exists')?.checked || false;
        const updateUserStatus = document.getElementById('update-user-status')?.checked || false;
        const defaultPopulationId = document.getElementById('default-population-select')?.value || '';
        const defaultEnabled = document.getElementById('default-enabled-status')?.value || 'true';
        const generatePasswords = document.getElementById('generate-passwords')?.checked || true;

        return {
            createIfNotExists,
            updateUserStatus,
            defaultPopulationId,
            defaultEnabled,
            generatePasswords
        };
    }

    getImportOptions() {
        const selectedPopulationId = document.getElementById('import-population-select')?.value || '';
        const useCsvPopulationId = document.getElementById('use-csv-population-id')?.checked || false;
        const useDefaultPopulation = document.getElementById('use-default-population')?.checked || true;

        // Get the population name from the selected option
        let selectedPopulationName = '';
        if (selectedPopulationId) {
            const selectedOption = document.getElementById('import-population-select')?.querySelector(`option[value="${selectedPopulationId}"]`);
            selectedPopulationName = selectedOption?.textContent || '';
        }

        return {
            selectedPopulationId,
            selectedPopulationName,
            useCsvPopulationId,
            useDefaultPopulation
        };
    }

    async checkCsvPopulationIdAvailability(users) {
        // Check if any user has a populationId field
        const hasPopulationId = users.some(user => user.populationId !== undefined && user.populationId !== '');
        return hasPopulationId;
    }

    async handlePopulationIdMissing() {
        return new Promise((resolve) => {
            const modal = document.getElementById('population-id-modal');
            const backBtn = document.getElementById('population-modal-back');
            const continueBtn = document.getElementById('population-modal-continue');

            // Show modal
            modal.style.display = 'block';
            modal.classList.add('show');

            // Handle back button
            backBtn.onclick = () => {
                modal.style.display = 'none';
                modal.classList.remove('show');
                resolve({ action: 'back' });
            };

            // Handle continue button
            continueBtn.onclick = () => {
                modal.style.display = 'none';
                modal.classList.remove('show');
                resolve({ action: 'continue' });
            };

            // Handle close button
            const closeBtn = modal.querySelector('.close');
            if (closeBtn) {
                closeBtn.onclick = () => {
                    modal.style.display = 'none';
                    modal.classList.remove('show');
                    resolve({ action: 'back' });
                };
            }
        });
    }

    async handleDeleteCsvFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            this.logger.fileLogger.info('Processing delete CSV file', { fileName: file.name, fileSize: file.size });
            
            // Show loading state
            this.uiManager.showLoading(true, 'Processing delete file...');
            
            // Parse the CSV file
            const users = await this.parseCsvFile(file, 'delete-csv-preview-container');
            
            // Store the users for deletion
            this.deleteCsvUsers = users;
            
            // Show file info
            this.showDeleteCsvFileInfo(file);
            
            // Update button state
            this.updateDeleteCsvButtonState();
            
            // Show success message
            this.uiManager.showNotification(`✅ Successfully processed ${users.length} users for deletion`, 'success');
            
        } catch (error) {
            this.logger.fileLogger.error('Error processing delete CSV file', { error: error.message });
            this.uiManager.showNotification(`Error processing file: ${error.message}`, 'error');
        } finally {
            this.uiManager.showLoading(false);
        }
    }

    async handleModifyCsvFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            this.logger.fileLogger.info('Processing modify CSV file', { fileName: file.name, fileSize: file.size });
            
            // Show loading state
            this.uiManager.showLoading(true, 'Processing modify file...');
            
            // Parse the CSV file
            const users = await this.parseCsvFile(file, 'modify-csv-preview-container');
            
            // Store the users for modification
            this.modifyCsvUsers = users;
            
            // Show file info
            this.showModifyCsvFileInfo(file);
            
            // Update button state
            this.updateModifyCsvButtonState();
            
            // Show success message
            this.uiManager.showNotification(`✅ Successfully processed ${users.length} users for modification`, 'success');
            
        } catch (error) {
            this.logger.fileLogger.error('Error processing modify CSV file', { error: error.message });
            this.uiManager.showNotification(`Error processing file: ${error.message}`, 'error');
        } finally {
            this.uiManager.showLoading(false);
        }
    }

    updateImportButtonState() {
        // Check if we have users to import
        const users = this.fileHandler.getParsedUsers();
        const hasUsers = users && users.length > 0;
        
        // Check if population choice has been made
        const selectedPopulationId = document.getElementById('import-population-select')?.value || '';
        const useDefaultPopulation = document.getElementById('use-default-population')?.checked || false;
        const useCsvPopulationId = document.getElementById('use-csv-population-id')?.checked || false;
        
        const hasSelectedPopulation = selectedPopulationId && selectedPopulationId.trim() !== '';
        const hasPopulationChoice = hasSelectedPopulation || useDefaultPopulation || useCsvPopulationId;
        
        // Enable buttons only if we have users AND a population choice
        const shouldEnable = hasUsers && hasPopulationChoice;
        
        // Update both import buttons
        const importBtn = document.getElementById('start-import-btn');
        const importBtnBottom = document.getElementById('start-import-btn-bottom');
        
        if (importBtn) {
            importBtn.disabled = !shouldEnable;
        }
        
        if (importBtnBottom) {
            importBtnBottom.disabled = !shouldEnable;
        }
        
        this.logger.fileLogger.info('Import button state updated', {
            hasUsers,
            hasPopulationChoice,
            shouldEnable,
            selectedPopulationId: hasSelectedPopulation ? 'selected' : 'none',
            useDefaultPopulation,
            useCsvPopulationId
        });
    }

    /**
     * Update delete CSV button state
     */
    updateDeleteCsvButtonState() {
        const startDeleteBtn = document.getElementById('start-delete-csv-btn');
        const cancelDeleteBtn = document.getElementById('cancel-delete-csv-btn');
        
        if (startDeleteBtn) {
            startDeleteBtn.disabled = !this.deleteCsvUsers || this.deleteCsvUsers.length === 0;
        }
        
        if (cancelDeleteBtn) {
            cancelDeleteBtn.style.display = this.isDeletingCsv ? 'inline-block' : 'none';
        }
    }

    /**
     * Load populations for deletion dropdown
     */
    async loadPopulationsForDeletion() {
        try {
            const populationSelect = document.getElementById('population-delete-select');
            if (!populationSelect) {
                console.warn('Population delete select not found');
                return;
            }

            // Clear existing options
            populationSelect.innerHTML = '<option value="">Loading populations...</option>';

            // Get populations from PingOne
            const populations = await this.pingOneClient.getPopulations();
            
            if (populations && populations._embedded && populations._embedded.populations) {
                // Clear loading option
                populationSelect.innerHTML = '<option value="">Select a population...</option>';
                
                // Add populations to select
                populations._embedded.populations.forEach(population => {
                    const option = document.createElement('option');
                    option.value = population.id;
                    option.textContent = population.name || population.id;
                    populationSelect.appendChild(option);
                });

                console.log('Loaded populations for deletion:', populations._embedded.populations.length);
            } else {
                populationSelect.innerHTML = '<option value="">No populations found</option>';
                console.warn('No populations found for deletion');
            }
        } catch (error) {
            console.error('Failed to load populations for deletion:', error);
            const populationSelect = document.getElementById('population-delete-select');
            if (populationSelect) {
                populationSelect.innerHTML = '<option value="">Error loading populations</option>';
            }
        }
    }

    /**
     * Update population delete button state
     */
    updatePopulationDeleteButtonState() {
        const startDeleteBtn = document.getElementById('start-population-delete-btn');
        const cancelDeleteBtn = document.getElementById('cancel-population-delete-btn');
        const populationSelect = document.getElementById('population-delete-select');
        
        if (startDeleteBtn && populationSelect) {
            startDeleteBtn.disabled = !populationSelect.value || this.isDeletingPopulation;
        }
        
        if (cancelDeleteBtn) {
            cancelDeleteBtn.style.display = this.isDeletingPopulation ? 'inline-block' : 'none';
        }
    }

    /**
     * Start population deletion process
     */
    async startPopulationDelete() {
        const populationSelect = document.getElementById('population-delete-select');
        if (!populationSelect || !populationSelect.value) {
            this.uiManager.showNotification('Please select a population to delete users from.', 'warning');
            return;
        }
        const populationId = populationSelect.value;
        const populationName = populationSelect.options[populationSelect.selectedIndex].text;
        // Use modal instead of confirm
        const confirmed = await this.confirmDeleteAction(`<strong>⚠️ WARNING:</strong> This will permanently delete <b>ALL</b> users in the population <b>"${populationName}"</b>. This action cannot be undone.<br><br>Type <b>DELETE</b> to confirm.`);
        if (!confirmed) return;
        this.isDeletingPopulation = true;
        this.updatePopulationDeleteButtonState();

        try {
            // Show progress UI
            this.uiManager.showPopulationDeleteStatus();

            // Get all users in the population
            this.logger.fileLogger.info('Starting population deletion', { 
                populationId, 
                populationName 
            });

            const users = await this.pingOneClient.getUsersByPopulation(populationId);
            
            if (!users || users.length === 0) {
                this.uiManager.showNotification(`No users found in population: ${populationName}`, 'info');
                this.resetPopulationDeleteState();
                return;
            }

            this.logger.fileLogger.info('Found users to delete', { 
                populationId, 
                populationName, 
                userCount: users.length 
            });

            // Start deletion process
            await this.deleteUsersFromPopulation(users, populationName);

        } catch (error) {
            console.error('Population deletion failed:', error);
            this.logger.fileLogger.error('Population deletion failed', { 
                populationId, 
                populationName, 
                error: error.message 
            });
            this.uiManager.showNotification(`Failed to delete users from population: ${error.message}`, 'error');
            this.resetPopulationDeleteState();
        }
    }

    /**
     * Show population delete confirmation dialog
     */
    async showPopulationDeleteConfirmation(populationName) {
        return new Promise((resolve) => {
            const confirmed = confirm(
                `⚠️ WARNING: This action will permanently delete ALL users in the population "${populationName}".\n\n` +
                `This action cannot be undone. Are you absolutely sure you want to proceed?\n\n` +
                `Type "DELETE" to confirm:`
            );

            if (confirmed) {
                const userInput = prompt('Type "DELETE" to confirm the deletion of all users:');
                resolve(userInput === 'DELETE');
            } else {
                resolve(false);
            }
        });
    }

    /**
     * Delete users from a population
     */
    async deleteUsersFromPopulation(users, populationName) {
        const totalUsers = users.length;
        let deletedCount = 0;
        let failedCount = 0;
        let skippedCount = 0;

        this.logger.fileLogger.info('Starting user deletion from population', { 
            populationName, 
            totalUsers 
        });

        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            
            try {
                // Check if we should cancel
                if (this.cancelPopulationDelete) {
                    this.logger.fileLogger.info('Population deletion cancelled by user');
                    break;
                }

                // Update progress
                const progress = ((i + 1) / totalUsers) * 100;
                this.updatePopulationDeleteProgress(i + 1, totalUsers, `Deleting user ${i + 1} of ${totalUsers}...`, {
                    success: deletedCount,
                    failed: failedCount,
                    skipped: skippedCount
                });

                // Delete the user
                await this.pingOneClient.deleteUser(user.id);
                deletedCount++;

                this.logger.fileLogger.info('User deleted successfully', { 
                    userId: user.id, 
                    username: user.username,
                    populationName 
                });

                // Rate limiting
                await this.delay(1000 / this.settings.rateLimit);

            } catch (error) {
                console.error(`Failed to delete user ${user.username}:`, error);
                this.logger.fileLogger.error('Failed to delete user', { 
                    userId: user.id, 
                    username: user.username,
                    populationName,
                    error: error.message 
                });
                failedCount++;
            }
        }

        // Final progress update
        this.updatePopulationDeleteProgress(totalUsers, totalUsers, 'Deletion completed', {
            success: deletedCount,
            failed: failedCount,
            skipped: skippedCount
        });

        // Show completion message
        const message = `Population deletion completed: ${deletedCount} deleted, ${failedCount} failed, ${skippedCount} skipped`;
        this.uiManager.showNotification(message, deletedCount > 0 ? 'success' : 'warning');

        this.logger.fileLogger.info('Population deletion completed', { 
            populationName,
            deleted: deletedCount,
            failed: failedCount,
            skipped: skippedCount
        });

        this.resetPopulationDeleteState();
    }

    /**
     * Update population delete progress
     */
    updatePopulationDeleteProgress(current, total, message, counts = {}) {
        const progressBar = document.getElementById('population-delete-progress');
        const progressPercent = document.getElementById('population-delete-progress-percent');
        const progressText = document.getElementById('population-delete-progress-text');
        const progressCount = document.getElementById('population-delete-progress-count');
        const successCount = document.getElementById('population-delete-success-count');
        const failedCount = document.getElementById('population-delete-failed-count');
        const skippedCount = document.getElementById('population-delete-skipped-count');

        if (progressBar) {
            const percent = total > 0 ? (current / total) * 100 : 0;
            progressBar.style.width = `${percent}%`;
            progressBar.setAttribute('aria-valuenow', percent);
        }

        if (progressPercent) progressPercent.textContent = `${Math.round((current / total) * 100)}%`;
        if (progressText) progressText.textContent = message;
        if (progressCount) progressCount.textContent = `${current} of ${total} users`;
        if (successCount) successCount.textContent = counts.success || 0;
        if (failedCount) failedCount.textContent = counts.failed || 0;
        if (skippedCount) skippedCount.textContent = counts.skipped || 0;
    }

    /**
     * Cancel population deletion
     */
    cancelPopulationDelete() {
        this.cancelPopulationDelete = true;
        this.uiManager.showNotification('Population deletion cancelled', 'info');
        this.resetPopulationDeleteState();
    }

    /**
     * Reset population delete state
     */
    resetPopulationDeleteState() {
        this.isDeletingPopulation = false;
        this.cancelPopulationDelete = false;
        this.updatePopulationDeleteButtonState();
        this.uiManager.hidePopulationDeleteStatus();
    }

    // Add after constructor/init
    setupDeleteWarningModal() {
        this.deleteWarningModal = document.getElementById('delete-warning-modal');
        this.deleteWarningContinue = document.getElementById('delete-warning-continue');
        this.deleteWarningCancel = document.getElementById('delete-warning-cancel');
        this.deleteConfirmInput = document.getElementById('delete-confirm-input');
        this.deleteWarningMessage = document.getElementById('delete-warning-message');
        
        if (!this.deleteWarningModal) return;
        // Hide modal utility
        this.hideDeleteWarningModal = () => {
            this.deleteWarningModal.style.display = 'none';
            this.deleteConfirmInput.value = '';
            this.deleteWarningContinue.disabled = true;
        };
        // Show modal utility
        this.showDeleteWarningModal = (message) => {
            this.deleteWarningMessage.innerHTML = message || '<strong>⚠️ WARNING:</strong> This action will permanently delete users from PingOne. This cannot be undone.<br><br>Are you absolutely sure you want to continue?';
            this.deleteWarningModal.style.display = 'flex';
            this.deleteConfirmInput.value = '';
            this.deleteWarningContinue.disabled = true;
            this.deleteConfirmInput.focus();
        };
        // Enable Continue only if DELETE is typed
        this.deleteConfirmInput.addEventListener('input', () => {
            this.deleteWarningContinue.disabled = this.deleteConfirmInput.value !== 'DELETE';
        });
        // Cancel button
        this.deleteWarningCancel.addEventListener('click', () => {
            this.hideDeleteWarningModal();
            if (this._deleteActionReject) this._deleteActionReject(false);
        });
        // Continue button
        this.deleteWarningContinue.addEventListener('click', () => {
            this.hideDeleteWarningModal();
            if (this._deleteActionResolve) this._deleteActionResolve(true);
        });
    }
    // Utility to show modal and return a promise
    confirmDeleteAction(message) {
        return new Promise((resolve, reject) => {
            this._deleteActionResolve = resolve;
            this._deleteActionReject = reject;
            this.showDeleteWarningModal(message);
        });
    }

    async startDeleteAllUsersInEnvironment() {
        // Fetch all users in the environment
        this.uiManager.showLoading(true, 'Fetching all users in environment...');
        let users;
        try {
            users = await this.pingOneClient.getAllUsersInEnvironment();
        } catch (err) {
            this.uiManager.showLoading(false);
            this.uiManager.showNotification('Failed to fetch users: ' + err.message, 'error');
            return;
        }
        this.uiManager.showLoading(false);
        if (!users || users.length === 0) {
            this.uiManager.showNotification('No users found in environment.', 'info');
            return;
        }
        // Confirm again before proceeding
        const confirmed = await this.confirmDeleteAction(`<strong>⚠️ FINAL WARNING:</strong> This will permanently delete <b>ALL</b> users in your PingOne environment (${users.length} users). This action cannot be undone.<br><br>Type <b>DELETE</b> to confirm.`);
        if (!confirmed) return;
        // Show progress UI
        this.uiManager.showLoading(true, 'Deleting all users in environment...');
        let deleted = 0, failed = 0;
        for (let i = 0; i < users.length; i++) {
            try {
                await this.pingOneClient.deleteUser(users[i].id);
                deleted++;
            } catch (err) {
                failed++;
            }
            this.uiManager.showLoading(true, `Deleting user ${i+1} of ${users.length}... (${deleted} deleted, ${failed} failed)`);
        }
        this.uiManager.showLoading(false);
        this.uiManager.showNotification(`Environment delete completed: ${deleted} deleted, ${failed} failed`, deleted > 0 ? 'success' : 'warning');
    }

    setupDeletePage() {
        // CSV Delete Section
        const deleteCsvCheckbox = document.getElementById('delete-csv-checkbox');
        const csvDeleteControls = document.getElementById('csv-delete-controls');
        const deleteCsvBtn = document.getElementById('deleteCsvBtn');
        const csvFileInput = document.getElementById('csvFile');

        if (deleteCsvCheckbox) {
            deleteCsvCheckbox.addEventListener('change', (e) => {
                csvDeleteControls.style.display = e.target.checked ? 'block' : 'none';
                if (!e.target.checked) {
                    csvFileInput.value = '';
                }
            });
        }

        if (deleteCsvBtn) {
            deleteCsvBtn.addEventListener('click', () => {
                if (!csvFileInput.files[0]) {
                    this.uiManager.showNotification('Please select a CSV file first.', 'error');
                    return;
                }
                this.showDeleteWarning('CSV', () => {
                    this.startDeleteUsersFromCsv();
                });
            });
        }

        // Population Delete Section
        const deletePopulationCheckbox = document.getElementById('delete-all-users-population-checkbox');
        const populationDeleteControls = document.getElementById('population-delete-controls');
        const deletePopulationBtn = document.getElementById('delete-all-users-population-btn');
        const populationSelect = document.getElementById('population-delete-select');

        if (deletePopulationCheckbox) {
            deletePopulationCheckbox.addEventListener('change', (e) => {
                populationDeleteControls.style.display = e.target.checked ? 'block' : 'none';
                if (e.target.checked) {
                    this.loadPopulationsForDeletion();
                }
            });
        }

        if (deletePopulationBtn) {
            deletePopulationBtn.addEventListener('click', () => {
                if (!populationSelect.value) {
                    this.uiManager.showNotification('Please select a population first.', 'error');
                    return;
                }
                this.showDeleteWarning('Population', () => {
                    this.startDeleteAllUsersInPopulation();
                });
            });
        }

        // Environment Delete Section
        const deleteEnvironmentCheckbox = document.getElementById('delete-all-users-env-checkbox');
        const environmentDeleteControls = document.getElementById('environment-delete-controls');
        const deleteEnvironmentBtn = document.getElementById('deleteEnvironmentBtn');

        if (deleteEnvironmentCheckbox) {
            deleteEnvironmentCheckbox.addEventListener('change', (e) => {
                environmentDeleteControls.style.display = e.target.checked ? 'block' : 'none';
            });
        }

        if (deleteEnvironmentBtn) {
            deleteEnvironmentBtn.addEventListener('click', () => {
                this.showDeleteWarning('Environment', () => {
                    this.startDeleteAllUsersInEnvironment();
                });
            });
        }
    }

    showDeleteWarning(type, onConfirm) {
        const modal = document.getElementById('delete-warning-modal');
        const message = document.getElementById('delete-warning-message');
        const confirmInput = document.getElementById('delete-confirm-input');
        const continueBtn = document.getElementById('delete-warning-continue');
        const cancelBtn = document.getElementById('delete-warning-cancel');

        if (!modal || !message || !confirmInput || !continueBtn || !cancelBtn) return;

        // Set warning message based on type
        let warningText = '';
        switch (type) {
            case 'CSV':
                warningText = 'Are you sure you want to delete users from the CSV file? This action cannot be undone.';
                break;
            case 'Population':
                warningText = 'Are you sure you want to delete ALL users in the selected population? This action cannot be undone.';
                break;
            case 'Environment':
                warningText = 'Are you sure you want to delete ALL users in the entire environment? This is a destructive action that cannot be undone.';
                break;
            default:
                warningText = 'Are you sure you want to proceed with this deletion? This action cannot be undone.';
        }

        message.textContent = warningText;
        confirmInput.value = '';
        continueBtn.disabled = true;

        // Show modal
        modal.style.display = 'flex';

        // Handle input validation
        confirmInput.addEventListener('input', () => {
            continueBtn.disabled = confirmInput.value !== 'DELETE';
        });

        // Handle continue button
        continueBtn.onclick = () => {
            if (confirmInput.value === 'DELETE') {
                this.hideDeleteWarning();
                onConfirm();
            }
        };

        // Handle cancel button
        cancelBtn.onclick = () => {
            this.hideDeleteWarning();
        };

        // Handle escape key
        modal.onclick = (e) => {
            if (e.target === modal) {
                this.hideDeleteWarning();
            }
        };

        // Focus on input
        confirmInput.focus();
    }

    hideDeleteWarning() {
        const modal = document.getElementById('delete-warning-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    async startDeleteUsersFromCsv() {
        const fileInput = document.getElementById('csvFile');
        const file = fileInput.files[0];
        
        if (!file) {
            this.uiManager.showNotification('Please select a CSV file first.', 'error');
            return;
        }

        try {
            const csvData = await this.readCsvFile(file);
            const users = this.parseCsvData(csvData);
            
            if (users.length === 0) {
                this.uiManager.showNotification('No valid users found in CSV file.', 'error');
                return;
            }

            this.uiManager.showLoading(true, `Deleting ${users.length} users...`);
            
            let deletedCount = 0;
            let errorCount = 0;
            const errors = [];

            for (let i = 0; i < users.length; i++) {
                const user = users[i];
                try {
                    await this.pingOneClient.deleteUser(user.username);
                    deletedCount++;
                    this.uiManager.showLoading(true, `Deleted ${deletedCount}/${users.length} users...`);
                } catch (error) {
                    errorCount++;
                    errors.push(`Failed to delete ${user.username}: ${error.message}`);
                }
            }

            this.uiManager.showLoading(false);
            
            if (errorCount === 0) {
                this.uiManager.showNotification(`Successfully deleted ${deletedCount} users.`, 'success');
            } else {
                this.uiManager.showNotification(`Deleted ${deletedCount} users. ${errorCount} errors occurred.`, 'warning');
                console.error('Delete errors:', errors);
            }

        } catch (error) {
            this.uiManager.showLoading(false);
            this.uiManager.showNotification('Error processing CSV file: ' + error.message, 'error');
        }
    }

    async startDeleteAllUsersInPopulation() {
        const populationSelect = document.getElementById('population-delete-select');
        const populationId = populationSelect.value;
        
        if (!populationId) {
            this.uiManager.showNotification('Please select a population first.', 'error');
            return;
        }

        this.uiManager.showLoading(true, 'Fetching users in population...');
        
        try {
            const users = await this.pingOneClient.getAllUsersInPopulation(populationId);
            
            if (users.length === 0) {
                this.uiManager.showLoading(false);
                this.uiManager.showNotification('No users found in the selected population.', 'info');
                return;
            }

            this.uiManager.showLoading(true, `Deleting ${users.length} users from population...`);
            
            let deletedCount = 0;
            let errorCount = 0;
            const errors = [];

            for (let i = 0; i < users.length; i++) {
                const user = users[i];
                try {
                    await this.pingOneClient.deleteUser(user.id);
                    deletedCount++;
                    this.uiManager.showLoading(true, `Deleted ${deletedCount}/${users.length} users...`);
                } catch (error) {
                    errorCount++;
                    errors.push(`Failed to delete ${user.username || user.id}: ${error.message}`);
                }
            }

            this.uiManager.showLoading(false);
            
            if (errorCount === 0) {
                this.uiManager.showNotification(`Successfully deleted ${deletedCount} users from population.`, 'success');
            } else {
                this.uiManager.showNotification(`Deleted ${deletedCount} users. ${errorCount} errors occurred.`, 'warning');
                console.error('Delete errors:', errors);
            }

        } catch (error) {
            this.uiManager.showLoading(false);
            this.uiManager.showNotification('Error deleting users from population: ' + error.message, 'error');
        }
    }

    async loadPopulations() {
        const populationSelect = document.getElementById('populationSelect');
        if (!populationSelect) return;

        try {
            const populationsResp = await this.pingOneClient.getPopulations();
            const populations = populationsResp && populationsResp._embedded && populationsResp._embedded.populations
                ? populationsResp._embedded.populations
                : [];
            populationSelect.innerHTML = '<option value="">Select a population...</option>';
            populations.forEach(population => {
                const option = document.createElement('option');
                option.value = population.id;
                option.textContent = population.name;
                populationSelect.appendChild(option);
            });
        } catch (error) {
            this.uiManager.showNotification('Error loading populations: ' + error.message, 'error');
            populationSelect.innerHTML = '<option value="">Error loading populations</option>';
        }
    }

    readCsvFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    parseCsvData(csvData) {
        const lines = csvData.split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        const users = [];

        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim()) {
                const values = lines[i].split(',').map(v => v.trim());
                const user = {};
                headers.forEach((header, index) => {
                    user[header] = values[index] || '';
                });
                users.push(user);
            }
        }

        return users;
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