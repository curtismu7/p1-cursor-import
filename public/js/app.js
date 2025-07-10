// Main application entry point
import { Logger } from './modules/logger.js';
import { FileLogger } from './modules/file-logger.js';
import { SettingsManager } from './modules/settings-manager.js';
import { UIManager } from './modules/ui-manager.js';
import { LocalAPIClient } from './modules/local-api-client.js';
import { PingOneClient } from './modules/pingone-client.js';
import { TokenManager } from './modules/token-manager.js';
import { FileHandler } from './modules/file-handler.js';
import { VersionManager } from './modules/version-manager.js';
import { apiFactory } from './modules/api-factory.js';

class App {
    constructor() {
        try {
            // Initialize core components
            this.logger = new Logger();
            this.fileLogger = new FileLogger();
            this.settingsManager = new SettingsManager(this.logger);
            this.uiManager = new UIManager(this.logger);
            this.localClient = new LocalAPIClient();
            this.tokenManager = new TokenManager(this.logger);
            this.fileHandler = new FileHandler(this.logger, this.uiManager);
            this.versionManager = new VersionManager(this.logger);
            
            // Initialize API clients
            this.pingOneClient = apiFactory.getPingOneClient(this.logger, this.settingsManager);
            
            // Initialize state
            this.currentView = 'import';
            this.isImporting = false;
            this.isExporting = false;
            this.isDeleting = false;
            this.isModifying = false;
            
            // Abort controllers
            this.importAbortController = null;
            this.exportAbortController = null;
            this.deleteAbortController = null;
            this.modifyAbortController = null;
            
        } catch (error) {
            console.error('App constructor error:', error);
            throw error;
        }
    }

    async init() {
        try {
            // Initialize components
            await this.settingsManager.init();
            await this.uiManager.init();
            await this.tokenManager.init();
            await this.fileHandler.init();
            await this.versionManager.init();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Check server connection and token status
            await this.checkServerConnectionStatus();
            
            // Load settings from server and populate form
            await this.loadSettings();
            
            // Load initial view
            this.showView('import');
            
        } catch (error) {
            console.error('App initialization error:', error);
            this.uiManager.showError('Failed to initialize application', error.message);
        }
    }

    async loadSettings() {
        try {
            const response = await this.localClient.get('/api/settings');
            
            if (response.success && response.data) {
                // Convert kebab-case to camelCase for the form
                let populationId = response.data['population-id'] || '';
                if (populationId === 'not set') populationId = '';
                const settings = {
                    environmentId: response.data['environment-id'] || '',
                    apiClientId: response.data['api-client-id'] || '',
                    apiSecret: response.data['api-secret'] || '',
                    populationId,
                    region: response.data['region'] || 'NorthAmerica',
                    rateLimit: response.data['rate-limit'] || 90
                };
                
                this.populateSettingsForm(settings);
                this.logger.info('Settings loaded and populated into form');
            } else {
                this.logger.warn('No settings found or failed to load settings');
            }
        } catch (error) {
            this.logger.error('Failed to load settings:', error);
        }
    }

    setupEventListeners() {
        // File upload event listeners
        const csvFileInput = document.getElementById('csv-file');
        if (csvFileInput) {
            csvFileInput.addEventListener('change', (event) => {
                const file = event.target.files[0];
                if (file) {
                    this.handleFileSelect(file);
                }
            });
        }

        // Import event listeners
        const startImportBtn = document.getElementById('start-import-btn');
        if (startImportBtn) {
            startImportBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.startImport();
            });
        }

        const cancelImportBtn = document.getElementById('cancel-import-btn');
        if (cancelImportBtn) {
            cancelImportBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.cancelImport();
            });
        }

        // Export event listeners
        const startExportBtn = document.getElementById('start-export-btn');
        if (startExportBtn) {
            startExportBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.startExport();
            });
        }

        const cancelExportBtn = document.getElementById('cancel-export-btn');
        if (cancelExportBtn) {
            cancelExportBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.cancelExport();
            });
        }

        // Delete event listeners
        const startDeleteBtn = document.getElementById('start-delete-btn');
        if (startDeleteBtn) {
            startDeleteBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.startDelete();
            });
        }

        const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
        if (cancelDeleteBtn) {
            cancelDeleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.cancelDelete();
            });
        }

        // Modify event listeners
        const startModifyBtn = document.getElementById('start-modify-btn');
        if (startModifyBtn) {
            startModifyBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.startModify();
            });
        }

        const cancelModifyBtn = document.getElementById('cancel-modify-btn');
        if (cancelModifyBtn) {
            cancelModifyBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.cancelModify();
            });
        }

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

        // Settings form event listeners
        const settingsForm = document.getElementById('settings-form');
        if (settingsForm) {
            settingsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(settingsForm);
                const settings = {
                    environmentId: formData.get('environment-id'),
                    apiClientId: formData.get('api-client-id'),
                    apiSecret: formData.get('api-secret'),
                    populationId: formData.get('population-id'),
                    region: formData.get('region'),
                    rateLimit: parseInt(formData.get('rate-limit')) || 90
                };
                await this.handleSaveSettings(settings);
            });
        }

        // Test connection button
        const testConnectionBtn = document.getElementById('test-connection-btn');
        if (testConnectionBtn) {
            testConnectionBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.testConnection();
            });
        }

        // Get token button
        const getTokenBtn = document.getElementById('get-token-btn');
        if (getTokenBtn) {
            getTokenBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.getToken();
            });
        }

        // Navigation event listeners
        const navItems = document.querySelectorAll('[data-view]');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const view = item.getAttribute('data-view');
                this.showView(view);
            });
        });

        // API secret eye button
        const apiSecretInputEl = document.getElementById('api-secret');
        const eyeBtnEl = document.getElementById('toggle-api-secret-visibility');
        if (apiSecretInputEl && eyeBtnEl && !eyeBtnEl.hasAttribute('data-listener')) {
            eyeBtnEl.setAttribute('data-listener', 'true');
            eyeBtnEl.addEventListener('click', () => {
                if (apiSecretInputEl.getAttribute('data-masked') === 'true') {
                    return;
                }
                if (apiSecretInputEl.type === 'password') {
                    apiSecretInputEl.type = 'text';
                    eyeBtnEl.querySelector('i').classList.remove('fa-eye');
                    eyeBtnEl.querySelector('i').classList.add('fa-eye-slash');
                } else {
                    apiSecretInputEl.type = 'password';
                    eyeBtnEl.querySelector('i').classList.remove('fa-eye-slash');
                    eyeBtnEl.querySelector('i').classList.add('fa-eye');
                }
            });
        }

        // Feature flags panel toggle
        const featureFlagsToggle = document.getElementById('feature-flags-toggle');
        if (featureFlagsToggle) {
            featureFlagsToggle.addEventListener('click', () => {
                const panel = document.getElementById('feature-flags-panel');
                if (panel) {
                    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
                }
            });
        }

        // Feature flag toggles
        const featureFlagToggles = document.querySelectorAll('[data-feature-flag]');
        featureFlagToggles.forEach(toggle => {
            toggle.addEventListener('change', async (e) => {
                const flag = e.target.getAttribute('data-feature-flag');
                const enabled = e.target.checked;
                await this.toggleFeatureFlag(flag, enabled);
            });
        });
    }

    async checkServerConnectionStatus() {
        try {
            const response = await this.localClient.get('/api/health');
            const { pingOneInitialized, lastError } = response;
            
            if (pingOneInitialized) {
                this.logger.fileLogger.info('Server is connected to PingOne');
                this.uiManager.updateConnectionStatus('connected', 'Connected to PingOne');
                
                // Check if we have a valid cached token before hiding home token status
                let hasValidToken = false;
                if (this.pingOneClient) {
                    const cachedToken = this.pingOneClient.getCachedToken();
                    if (cachedToken) {
                        if (typeof localStorage !== 'undefined') {
                            const expiry = localStorage.getItem('pingone_token_expiry');
                            if (expiry) {
                                const expiryTime = parseInt(expiry);
                                if (Date.now() < expiryTime) {
                                    hasValidToken = true;
                                }
                            }
                        }
                    }
                }
                
                if (hasValidToken) {
                    this.uiManager.updateHomeTokenStatus(false);
                } else {
                    this.uiManager.updateHomeTokenStatus(true, 'You need to configure your PingOne API credentials and get a token before using this tool.');
                }
                return true;
            } else {
                const errorMessage = lastError || 'Not connected to PingOne';
                this.logger.fileLogger.warn('Server is not connected to PingOne', { error: errorMessage });
                this.uiManager.updateConnectionStatus('disconnected', errorMessage);
                
                // Check if we have a valid cached token before showing home token status
                let hasValidToken = false;
                if (this.pingOneClient) {
                    const cachedToken = this.pingOneClient.getCachedToken();
                    if (cachedToken) {
                        if (typeof localStorage !== 'undefined') {
                            const expiry = localStorage.getItem('pingone_token_expiry');
                            if (expiry) {
                                const expiryTime = parseInt(expiry);
                                if (Date.now() < expiryTime) {
                                    hasValidToken = true;
                                }
                            }
                        }
                    }
                }
                
                if (hasValidToken) {
                    this.uiManager.updateHomeTokenStatus(false);
                } else {
                    this.uiManager.updateHomeTokenStatus(true, 'You need to configure your PingOne API credentials and get a token before using this tool.');
                }
                return false;
            }
        } catch (error) {
            const statusMessage = `Failed to check server status: ${error.message}`;
            this.logger.fileLogger.error('Server connection check failed', { error: error.message });
            this.uiManager.updateConnectionStatus('error', statusMessage);
            
            // Check if we have a valid cached token before showing home token status
            let hasValidToken = false;
            if (this.pingOneClient) {
                const cachedToken = this.pingOneClient.getCachedToken();
                if (cachedToken) {
                    if (typeof localStorage !== 'undefined') {
                        const expiry = localStorage.getItem('pingone_token_expiry');
                        if (expiry) {
                            const expiryTime = parseInt(expiry);
                            if (Date.now() < expiryTime) {
                                hasValidToken = true;
                            }
                        }
                    }
                }
            }
            
            if (hasValidToken) {
                this.uiManager.updateHomeTokenStatus(false);
            } else {
                this.uiManager.updateHomeTokenStatus(true, 'You need to configure your PingOne API credentials and get a token before using this tool.');
            }
            return false;
        }
    }

    showView(view) {
        if (!view) return;
        
        // Hide all views
        const views = document.querySelectorAll('.view');
        views.forEach(v => v.style.display = 'none');
        
        // Show selected view
        const selectedView = document.getElementById(`${view}-view`);
        if (selectedView) {
            selectedView.style.display = 'block';
            this.currentView = view;
            
            // Refresh progress page when progress view is shown
            if (view === 'progress') {
                this.refreshProgressPage();
            }
            
            // Load settings when navigating to settings view
            if (view === 'settings') {
                this.loadSettings();
                this.uiManager.updateSettingsSaveStatus('Please configure your API credentials and test the connection.', 'info');
            }
            
            // Update navigation
            this.uiManager.navItems.forEach(item => {
                item.classList.remove('active');
                if (item.getAttribute('data-view') === view) {
                    item.classList.add('active');
                }
            });
        }
    }

    async handleSaveSettings(settings) {
        try {
            this.logger.fileLogger.info('Saving settings', settings);
            
            // Update settings save status to show saving
            this.uiManager.updateSettingsSaveStatus('Saving settings...', 'info');
            
            // Just save settings without testing connections
            const response = await this.localClient.post('/api/settings', settings);
            
            // Update settings manager
            this.settingsManager.updateSettings(settings);
            
            // Update API clients with new settings
            this.pingOneClient = apiFactory.getPingOneClient(this.logger, this.settingsManager);
            
            // Update settings save status to show success
            this.uiManager.updateSettingsSaveStatus('✅ Settings saved successfully', 'success');
            // Show green notification
            this.uiManager.showSuccess('Settings saved for PingOne');
            
        } catch (error) {
            this.logger.fileLogger.error('Failed to save settings', { error: error.message });
            this.uiManager.updateSettingsSaveStatus('❌ Failed to save settings: ' + error.message, 'error');
        }
    }

    populateSettingsForm(settings) {
        if (!settings) {
            this.logger.warn('No settings provided to populate form');
            return;
        }
        
        const fields = {
            'environment-id': settings.environmentId || '',
            'api-client-id': settings.apiClientId || '',
            'api-secret': settings.apiSecret || '',
            'population-id': settings.populationId || '',
            'region': settings.region || 'NorthAmerica',
            'rate-limit': settings.rateLimit || 90
        };
        
        const missingFields = [];
        
        for (const [id, value] of Object.entries(fields)) {
            try {
                const element = document.getElementById(id);
                if (!element) {
                    missingFields.push(id);
                    continue;
                }
                
                // For API secret, only set if it's not empty
                if (id === 'api-secret') {
                    if (value) {
                        element.value = '********';
                        element.setAttribute('data-masked', 'true');
                    } else {
                        element.value = '';
                        element.removeAttribute('data-masked');
                    }
                } else {
                    element.value = value;
                }
            } catch (error) {
                this.logger.error(`Error setting field ${id}`, { error: error.message });
                missingFields.push(id);
            }
        }
        
        if (missingFields.length > 0) {
            this.logger.warn('Missing form fields', { missingFields });
        }
    }

    async startImport() {
        if (this.isImporting) {
            this.logger.warn('Import already in progress');
            return;
        }
        
        try {
            this.isImporting = true;
            this.importAbortController = new AbortController();
            
            const importOptions = this.getImportOptions();
            if (!importOptions) return;
            
            const { selectedPopulationName } = importOptions;
            
            // Show import status
            this.uiManager.showImportStatus(importOptions.totalUsers, selectedPopulationName);
            
            // Start import process
            const response = await this.localClient.post('/api/import', importOptions, {
                signal: this.importAbortController.signal,
                onProgress: (current, total, message, counts) => {
                    // Always fetch the latest population name from the dropdown
                    const currentPopulationName = document.getElementById('import-population-select')?.selectedOptions[0]?.text || '';
                    this.uiManager.updateImportProgress(current, total, message, counts, currentPopulationName);
                }
            });
            
            // Handle completion
            if (response.success) {
                const currentPopulationName = document.getElementById('import-population-select')?.selectedOptions[0]?.text || '';
                this.uiManager.updateImportProgress(importOptions.totalUsers, importOptions.totalUsers, 'Import completed successfully', response.counts, currentPopulationName);
                this.uiManager.showSuccess('Import completed successfully', response.message);
            } else {
                const currentPopulationName = document.getElementById('import-population-select')?.selectedOptions[0]?.text || '';
                this.uiManager.updateImportProgress(0, importOptions.totalUsers, 'Import failed', response.counts, currentPopulationName);
                this.uiManager.showError('Import failed', response.error);
            }
            
        } catch (error) {
            const currentPopulationName = document.getElementById('import-population-select')?.selectedOptions[0]?.text || '';
            if (error.name === 'AbortError') {
                this.uiManager.updateImportProgress(0, 0, 'Import cancelled', {}, currentPopulationName);
                this.uiManager.showInfo('Import cancelled');
            } else {
                this.uiManager.updateImportProgress(0, 0, 'Import failed: ' + error.message, {}, currentPopulationName);
                this.uiManager.showError('Import failed', error.message);
            }
        } finally {
            this.isImporting = false;
            this.importAbortController = null;
        }
    }

    getImportOptions() {
        const selectedPopulationId = document.getElementById('import-population-select')?.value;
        const selectedPopulationName = document.getElementById('import-population-select')?.selectedOptions[0]?.text || '';
        
        if (!selectedPopulationId) {
            this.uiManager.showError('No population selected', 'Please select a population before starting the import.');
            return null;
        }
        
        const totalUsers = this.fileHandler.getTotalUsers();
        if (!totalUsers || totalUsers === 0) {
            this.uiManager.showError('No users to import', 'Please select a CSV file with users to import.');
            return null;
        }
        
        return {
            selectedPopulationId,
            selectedPopulationName,
            totalUsers,
            file: this.fileHandler.getCurrentFile()
        };
    }

    cancelImport() {
        if (this.importAbortController) {
            this.importAbortController.abort();
        }
    }

    async startExport() {
        if (this.isExporting) {
            this.logger.warn('Export already in progress');
            return;
        }
        
        try {
            this.isExporting = true;
            this.exportAbortController = new AbortController();
            
            const exportOptions = this.getExportOptions();
            if (!exportOptions) return;
            
            // Show export status
            this.uiManager.showExportStatus();
            
            // Start export process
            const response = await this.localClient.post('/api/export-users', exportOptions, {
                signal: this.exportAbortController.signal,
                onProgress: (current, total, message, counts) => {
                    this.uiManager.updateExportProgress(current, total, message, counts);
                }
            });
            
            // Handle completion
            if (response.success) {
                this.uiManager.updateExportProgress(exportOptions.totalUsers, exportOptions.totalUsers, 'Export completed successfully', response.counts);
                this.uiManager.showSuccess('Export completed successfully', response.message);
            } else {
                this.uiManager.updateExportProgress(0, exportOptions.totalUsers, 'Export failed', response.counts);
                this.uiManager.showError('Export failed', response.error);
            }
            
        } catch (error) {
            if (error.name === 'AbortError') {
                this.uiManager.updateExportProgress(0, 0, 'Export cancelled');
                this.uiManager.showInfo('Export cancelled');
            } else {
                this.uiManager.updateExportProgress(0, 0, 'Export failed: ' + error.message);
                this.uiManager.showError('Export failed', error.message);
            }
        } finally {
            this.isExporting = false;
            this.exportAbortController = null;
        }
    }

    getExportOptions() {
        const selectedPopulationId = document.getElementById('export-population-select')?.value;
        const selectedPopulationName = document.getElementById('export-population-select')?.selectedOptions[0]?.text || '';
        
        if (!selectedPopulationId) {
            this.uiManager.showError('No population selected', 'Please select a population before starting the export.');
            return null;
        }
        
        return {
            selectedPopulationId,
            selectedPopulationName,
            fields: document.getElementById('export-fields-select')?.value || 'all',
            format: document.getElementById('export-format-select')?.value || 'csv',
            ignoreDisabledUsers: document.getElementById('export-ignore-disabled')?.checked || false
        };
    }

    cancelExport() {
        if (this.exportAbortController) {
            this.exportAbortController.abort();
        }
    }

    async startDelete() {
        if (this.isDeleting) {
            this.logger.warn('Delete already in progress');
            return;
        }
        
        try {
            this.isDeleting = true;
            this.deleteAbortController = new AbortController();
            
            const deleteOptions = this.getDeleteOptions();
            if (!deleteOptions) return;
            
            // Show delete status
            this.uiManager.showDeleteStatus(deleteOptions.totalUsers);
            
            // Start delete process
            const response = await this.localClient.post('/api/delete-users', deleteOptions, {
                signal: this.deleteAbortController.signal,
                onProgress: (current, total, message, counts) => {
                    this.uiManager.updateDeleteProgress(current, total, message, counts);
                }
            });
            
            // Handle completion
            if (response.success) {
                this.uiManager.updateDeleteProgress(deleteOptions.totalUsers, deleteOptions.totalUsers, 'Delete completed successfully', response.counts);
                this.uiManager.showSuccess('Delete completed successfully', response.message);
            } else {
                this.uiManager.updateDeleteProgress(0, deleteOptions.totalUsers, 'Delete failed', response.counts);
                this.uiManager.showError('Delete failed', response.error);
            }
            
        } catch (error) {
            if (error.name === 'AbortError') {
                this.uiManager.updateDeleteProgress(0, 0, 'Delete cancelled');
                this.uiManager.showInfo('Delete cancelled');
            } else {
                this.uiManager.updateDeleteProgress(0, 0, 'Delete failed: ' + error.message);
                this.uiManager.showError('Delete failed', error.message);
            }
        } finally {
            this.isDeleting = false;
            this.deleteAbortController = null;
        }
    }

    getDeleteOptions() {
        const selectedPopulationId = document.getElementById('delete-population-select')?.value;
        const selectedPopulationName = document.getElementById('delete-population-select')?.selectedOptions[0]?.text || '';
        
        if (!selectedPopulationId) {
            this.uiManager.showError('No population selected', 'Please select a population before starting the delete.');
            return null;
        }
        
        const totalUsers = this.fileHandler.getTotalUsers();
        if (!totalUsers || totalUsers === 0) {
            this.uiManager.showError('No users to delete', 'Please select a CSV file with users to delete.');
            return null;
        }
        
        return {
            selectedPopulationId,
            selectedPopulationName,
            totalUsers,
            file: this.fileHandler.getCurrentFile()
        };
    }

    cancelDelete() {
        if (this.deleteAbortController) {
            this.deleteAbortController.abort();
        }
    }

    async startModify() {
        if (this.isModifying) {
            this.logger.warn('Modify already in progress');
            return;
        }
        
        try {
            this.isModifying = true;
            this.modifyAbortController = new AbortController();
            
            const modifyOptions = this.getModifyOptions();
            if (!modifyOptions) return;
            
            // Show modify status
            this.uiManager.showModifyStatus(modifyOptions.totalUsers);
            
            // Start modify process
            const response = await this.localClient.post('/api/modify-users', modifyOptions, {
                signal: this.modifyAbortController.signal,
                onProgress: (current, total, message, counts) => {
                    this.uiManager.updateModifyProgress(current, total, message, counts);
                }
            });
            
            // Handle completion
            if (response.success) {
                this.uiManager.updateModifyProgress(modifyOptions.totalUsers, modifyOptions.totalUsers, 'Modify completed successfully', response.counts);
                this.uiManager.showSuccess('Modify completed successfully', response.message);
            } else {
                this.uiManager.updateModifyProgress(0, modifyOptions.totalUsers, 'Modify failed', response.counts);
                this.uiManager.showError('Modify failed', response.error);
            }
            
        } catch (error) {
            if (error.name === 'AbortError') {
                this.uiManager.updateModifyProgress(0, 0, 'Modify cancelled');
                this.uiManager.showInfo('Modify cancelled');
            } else {
                this.uiManager.updateModifyProgress(0, 0, 'Modify failed: ' + error.message);
                this.uiManager.showError('Modify failed', error.message);
            }
        } finally {
            this.isModifying = false;
            this.modifyAbortController = null;
        }
    }

    getModifyOptions() {
        const selectedPopulationId = document.getElementById('modify-population-select')?.value;
        const selectedPopulationName = document.getElementById('modify-population-select')?.selectedOptions[0]?.text || '';
        
        if (!selectedPopulationId) {
            this.uiManager.showError('No population selected', 'Please select a population before starting the modify.');
            return null;
        }
        
        const totalUsers = this.fileHandler.getTotalUsers();
        if (!totalUsers || totalUsers === 0) {
            this.uiManager.showError('No users to modify', 'Please select a CSV file with users to modify.');
            return null;
        }
        
        return {
            selectedPopulationId,
            selectedPopulationName,
            totalUsers,
            file: this.fileHandler.getCurrentFile()
        };
    }

    cancelModify() {
        if (this.modifyAbortController) {
            this.modifyAbortController.abort();
        }
    }

    async startPopulationDelete() {
        try {
            const selectedPopulationId = document.getElementById('population-delete-select')?.value;
            const selectedPopulationName = document.getElementById('population-delete-select')?.selectedOptions[0]?.text || '';
            
            if (!selectedPopulationId) {
                this.uiManager.showError('No population selected', 'Please select a population to delete.');
                return;
            }
            
            // Show population delete status
            this.uiManager.showPopulationDeleteStatus(selectedPopulationName);
            
            // Start population delete process
            const response = await this.localClient.post('/api/population-delete', {
                populationId: selectedPopulationId,
                populationName: selectedPopulationName
            });
            
            // Handle completion
            if (response.success) {
                this.uiManager.updatePopulationDeleteProgress(1, 1, 'Population delete completed successfully');
                this.uiManager.showSuccess('Population delete completed successfully', response.message);
            } else {
                this.uiManager.updatePopulationDeleteProgress(0, 1, 'Population delete failed');
                this.uiManager.showError('Population delete failed', response.error);
            }
            
        } catch (error) {
            this.uiManager.updatePopulationDeleteProgress(0, 1, 'Population delete failed: ' + error.message);
            this.uiManager.showError('Population delete failed', error.message);
        }
    }

    cancelPopulationDelete() {
        this.uiManager.updatePopulationDeleteProgress(0, 0, 'Population delete cancelled');
        this.uiManager.showInfo('Population delete cancelled');
    }

    async testConnection() {
        try {
            // Set button loading state
            this.uiManager.setButtonLoading('test-connection-btn', true);
            this.uiManager.updateConnectionStatus('connecting', 'Testing connection...');
            
            const response = await this.localClient.post('/api/pingone/test-connection');
            
            if (response.success) {
                this.uiManager.updateConnectionStatus('connected', 'Connection test successful');
                this.uiManager.showSuccess('Connection test successful', response.message);
            } else {
                this.uiManager.updateConnectionStatus('error', 'Connection test failed');
                this.uiManager.showError('Connection test failed', response.error);
            }
            
        } catch (error) {
            this.uiManager.updateConnectionStatus('error', 'Connection test failed: ' + error.message);
            this.uiManager.showError('Connection test failed', error.message);
        } finally {
            // Always reset button loading state
            this.uiManager.setButtonLoading('test-connection-btn', false);
        }
    }

    async getToken() {
        try {
            // Set button loading state
            this.uiManager.setButtonLoading('get-token-btn', true);
            this.uiManager.updateConnectionStatus('connecting', 'Getting token...');
            
            const response = await this.localClient.post('/api/pingone/get-token');
            
            if (response.success) {
                this.uiManager.updateConnectionStatus('connected', 'Token retrieved successfully');
                this.uiManager.showSuccess('Token retrieved successfully', response.message);
                this.uiManager.updateHomeTokenStatus(false);
            } else {
                this.uiManager.updateConnectionStatus('error', 'Failed to get token');
                this.uiManager.showError('Failed to get token', response.error);
            }
            
        } catch (error) {
            this.uiManager.updateConnectionStatus('error', 'Failed to get token: ' + error.message);
            this.uiManager.showError('Failed to get token', error.message);
        } finally {
            // Always reset button loading state
            this.uiManager.setButtonLoading('get-token-btn', false);
        }
    }

    async toggleFeatureFlag(flag, enabled) {
        try {
            const response = await this.localClient.post(`/api/feature-flags/${flag}`, { enabled });
            
            if (response.success) {
                this.uiManager.showSuccess(`Feature flag ${flag} ${enabled ? 'enabled' : 'disabled'}`);
            } else {
                this.uiManager.showError(`Failed to toggle feature flag ${flag}`, response.error);
            }
            
        } catch (error) {
            this.uiManager.showError(`Failed to toggle feature flag ${flag}`, error.message);
        }
    }

    handleFileSelect(file) {
        try {
            this.fileHandler.setFile(file);
            this.uiManager.showSuccess('File selected successfully', `Selected file: ${file.name}`);
        } catch (error) {
            this.uiManager.showError('Failed to select file', error.message);
        }
    }

    refreshProgressPage() {
        // Refresh progress data if needed
        this.uiManager.refreshProgressData();
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const app = new App();
        await app.init();
        
        // Make app globally available for debugging
        window.app = app;
        
    } catch (error) {
        console.error('Failed to initialize app:', error);
    }
});