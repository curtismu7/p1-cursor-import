// Main application entry point
import { Logger } from './modules/logger.js';
import { FileLogger } from './modules/file-logger.js';
import { SettingsManager } from './modules/settings-manager.js';
import { UIManager } from './modules/ui-manager.js';
import { LocalAPIClient } from './modules/local-api-client.js';
import { PingOneClient } from './modules/pingone-client.js';
import TokenManager from './modules/token-manager.js';
import { FileHandler } from './modules/file-handler.js';
import { VersionManager } from './modules/version-manager.js';
import { apiFactory, initAPIFactory } from './modules/api-factory.js';

/**
 * Simple Secret Field Toggle - Handles only the eye icon visibility toggle
 */
class SecretFieldToggle {
    constructor() {
        this.inputElement = null;
        this.eyeButton = null;
        this.isVisible = false;
        this.actualValue = '';
        this.isInitialized = false;
    }

    /**
     * Initialize the secret field toggle
     */
    init() {
        if (this.isInitialized) {
            return;
        }

        this.inputElement = document.getElementById('api-secret');
        this.eyeButton = document.getElementById('toggle-api-secret-visibility');

        if (!this.inputElement || !this.eyeButton) {
            console.error('❌ Secret field elements not found');
            console.error('Input element:', !!this.inputElement);
            console.error('Eye button:', !!this.eyeButton);
            return;
        }

        console.log('✅ Secret field elements found');
        console.log('Input element ID:', this.inputElement.id);
        console.log('Eye button ID:', this.eyeButton.id);

        // Set up the eye button click handler
        this.setupToggleHandler();
        
        this.isInitialized = true;
        console.log('✅ Secret field toggle initialized');
    }

    /**
     * Set up the toggle button click handler
     */
    setupToggleHandler() {
        // Remove any existing listeners
        this.eyeButton.removeEventListener('click', this.handleToggleClick);
        
        // Add the click handler
        this.eyeButton.addEventListener('click', this.handleToggleClick.bind(this));
        
        console.log('Secret field toggle handler set up');
    }

    /**
     * Handle the toggle button click
     */
    handleToggleClick(e) {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('🔍 Eye button clicked!');
        console.log('Current visibility:', this.isVisible);
        console.log('Current value length:', this.actualValue.length);
        
        // Toggle visibility
        this.isVisible = !this.isVisible;
        
        // Update the input field
        this.updateInputField();
        
        // Update the eye icon
        this.updateEyeIcon();
        
        console.log('✅ Toggle completed!');
        console.log('New visibility:', this.isVisible);
        console.log('Input type:', this.inputElement.type);
        console.log('Input value length:', this.inputElement.value.length);
    }

    /**
     * Update the input field based on visibility state
     */
    updateInputField() {
        if (!this.inputElement) {
            return;
        }

        if (this.isVisible) {
            // Show the actual value
            this.inputElement.type = 'text';
            this.inputElement.value = this.actualValue;
        } else {
            // Show masked value
            this.inputElement.type = 'password';
            this.inputElement.value = this.actualValue || '';
        }
    }

    /**
     * Update the eye icon to reflect current state
     */
    updateEyeIcon() {
        if (!this.eyeButton) {
            return;
        }

        const iconElement = this.eyeButton.querySelector('i');
        if (!iconElement) {
            return;
        }

        if (this.isVisible) {
            // Show eye (visible state)
            iconElement.classList.remove('fa-eye-slash');
            iconElement.classList.add('fa-eye');
        } else {
            // Show eye-slash (hidden state)
            iconElement.classList.remove('fa-eye');
            iconElement.classList.add('fa-eye-slash');
        }
    }

    /**
     * Set the secret value (called when form is populated)
     */
    setValue(value) {
        this.actualValue = value || '';
        
        // Always start in hidden state
        this.isVisible = false;
        
        // Update the display
        this.updateInputField();
        this.updateEyeIcon();
        
        console.log('Secret field value set, length:', this.actualValue.length);
    }

    /**
     * Get the current secret value
     */
    getValue() {
        return this.actualValue;
    }

    /**
     * Handle input changes (when user types)
     */
    handleInputChange() {
        if (!this.inputElement) {
            return;
        }

        // Add input event listener
        this.inputElement.addEventListener('input', (e) => {
            this.actualValue = e.target.value;
            console.log('Secret field input changed, new length:', this.actualValue.length);
        });
    }
}

class App {
    constructor() {
        // Initialize core components
        this.logger = new Logger();
        this.fileLogger = new FileLogger();
        this.settingsManager = new SettingsManager(this.logger);
        this.uiManager = new UIManager(this.logger);
        this.localClient = new LocalAPIClient();
        this.tokenManager = new TokenManager(this.logger);
        this.fileHandler = new FileHandler(this.logger, this.uiManager);
        this.versionManager = new VersionManager(this.logger);
        
        // Initialize secret field manager
        this.secretFieldToggle = new SecretFieldToggle();
        
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

        this.populationPromptShown = false;
        this.populationChoice = null; // 'override', 'ignore', 'use-csv'
    }

    async init() {
        try {
            console.log('Initializing app...');
            
            // Initialize API Factory first
            await this.initAPIFactory();
            
            // Initialize API clients
            this.pingOneClient = apiFactory.getPingOneClient(this.logger, this.settingsManager);
            
            // Initialize UI manager
            await this.uiManager.init();
            
            // Initialize file handler
            this.fileHandler = new FileHandler(this.logger, this.uiManager);
            
            // Initialize secret field toggle
            this.secretFieldToggle = new SecretFieldToggle();
            this.secretFieldToggle.init();
            
            // Load settings
            await this.loadSettings();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Check disclaimer status and setup if needed
            const disclaimerPreviouslyAccepted = this.checkDisclaimerStatus();
            if (!disclaimerPreviouslyAccepted) {
                console.log('Disclaimer not previously accepted, setting up disclaimer agreement');
                this.setupDisclaimerAgreement();
            } else {
                console.log('Disclaimer previously accepted, tool already enabled');
            }
            
            // Check server connection status
            await this.checkServerConnectionStatus();
            
            console.log('App initialization complete');
            
        } catch (error) {
            console.error('Error initializing app:', error);
            this.logger.error('App initialization failed', error);
        }
    }

    async initAPIFactory() {
        try {
            await initAPIFactory(this.logger, this.settingsManager);
            console.log('✅ API Factory initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize API Factory:', error);
            throw error;
        }
    }

    async loadPopulations() {
        try {
            console.log('🔄 Loading populations from PingOne...');
            
            const response = await this.localClient.get('/api/pingone/populations');
            
            // The populations API returns the data directly as an array
            if (Array.isArray(response)) {
                console.log('✅ Populations loaded successfully:', response.length, 'populations');
                this.populatePopulationDropdown(response);
            } else {
                console.error('❌ Failed to load populations - invalid response format:', response);
                this.showPopulationLoadError();
            }
        } catch (error) {
            console.error('❌ Error loading populations:', error);
            this.showPopulationLoadError();
        }
    }

    populatePopulationDropdown(populations) {
        const populationSelect = document.getElementById('import-population-select');
        if (!populationSelect) {
            console.error('❌ Population select element not found');
            return;
        }

        // Clear existing options
        populationSelect.innerHTML = '';
        
        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select a population...';
        populationSelect.appendChild(defaultOption);
        
        // Add population options
        populations.forEach(population => {
            const option = document.createElement('option');
            option.value = population.id;
            option.textContent = population.name;
            populationSelect.appendChild(option);
        });
        
        console.log('✅ Population dropdown populated with', populations.length, 'populations');
        
        // Enable the select element
        populationSelect.disabled = false;
    }

    showPopulationLoadError() {
        const populationSelect = document.getElementById('import-population-select');
        if (populationSelect) {
            populationSelect.innerHTML = '<option value="">Failed to load populations</option>';
            populationSelect.disabled = true;
        }
        
        this.uiManager.showError('Failed to load populations', 'Please check your PingOne connection and try again.');
    }

    updateImportButtonState() {
        const populationSelect = document.getElementById('import-population-select');
        const hasFile = this.fileHandler.getCurrentFile() !== null;
        const hasPopulation = populationSelect && populationSelect.value && populationSelect.value !== '';
        
        console.log('=== Update Import Button State ===');
        console.log('Has file:', hasFile);
        console.log('Has population:', hasPopulation);
        console.log('Population value:', populationSelect ? populationSelect.value : 'No select element');
        console.log('====================================');
        
        // Get both import buttons
        const topImportBtn = document.getElementById('start-import-btn');
        const bottomImportBtn = document.getElementById('start-import-btn-bottom');
        
        const shouldEnable = hasFile && hasPopulation;
        
        if (topImportBtn) {
            topImportBtn.disabled = !shouldEnable;
        }
        
        if (bottomImportBtn) {
            bottomImportBtn.disabled = !shouldEnable;
        }
        
        console.log('Import buttons enabled:', shouldEnable);
        // At the end, show the population prompt if needed
        this.showPopulationChoicePrompt();
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

        const startImportBtnBottom = document.getElementById('start-import-btn-bottom');
        if (startImportBtnBottom) {
            startImportBtnBottom.addEventListener('click', async (e) => {
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

        const cancelImportBtnBottom = document.getElementById('cancel-import-btn-bottom');
        if (cancelImportBtnBottom) {
            cancelImportBtnBottom.addEventListener('click', (e) => {
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
                
                // Get API secret from SecretFieldManager
                const apiSecret = this.secretFieldToggle.getValue();
                
                const settings = {
                    environmentId: formData.get('environment-id'),
                    apiClientId: formData.get('api-client-id'),
                    apiSecret: apiSecret,
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

        // Population dropdown event listener
        const populationSelect = document.getElementById('import-population-select');
        if (populationSelect) {
            console.log('Setting up population select event listener...');
            populationSelect.addEventListener('change', (e) => {
                const selectedPopulationId = e.target.value;
                const selectedPopulationName = e.target.selectedOptions[0]?.text || '';
                
                console.log('=== Population Selection Changed ===');
                console.log('Selected Population ID:', selectedPopulationId);
                console.log('Selected Population Name:', selectedPopulationName);
                console.log('Event target:', e.target);
                console.log('All options:', Array.from(e.target.options).map(opt => ({ value: opt.value, text: opt.text, selected: opt.selected })));
                console.log('====================================');
                
                // Update the import button state based on population selection
                this.updateImportButtonState();
            });
        } else {
            console.warn('Population select element not found in DOM');
        }

        // Get token button
        const getTokenBtn = document.getElementById('get-token-btn');
        if (getTokenBtn) {
            console.log('Setting up Get Token button event listener...');
            getTokenBtn.addEventListener('click', async (e) => {
                console.log('Get Token button clicked!');
                e.preventDefault();
                e.stopPropagation();
                await this.getToken();
            });
        } else {
            console.warn('Get Token button not found in DOM');
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
            
            // Load populations when navigating to import view
            if (view === 'import') {
                this.loadPopulations();
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
            
            // Repopulate the form (if needed)
            this.populateSettingsForm(settings);
            
            // Now update connection status area with check mark and message
            const connStatus = document.getElementById('settings-connection-status');
            if (connStatus) {
                connStatus.textContent = '✅ Settings saved! Please test the connection.';
                connStatus.classList.remove('status-disconnected', 'status-error');
                connStatus.classList.add('status-success');
                console.log('Updated #settings-connection-status after save (post-populate)');
            }
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
                
                // Handle API secret using SecretFieldManager
                if (id === 'api-secret') {
                    this.secretFieldToggle.setValue(value);
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
            
            // Force refresh population selection to ensure it's current
            const currentPopulation = this.forceRefreshPopulationSelection();
            console.log('=== startImport - Current Population ===');
            console.log('Current population selection:', currentPopulation);
            
            if (!currentPopulation) {
                this.uiManager.showError('No population selected', 'Please select a population before starting the import.');
                return;
            }
            
            // Create import options with the current population selection
            const totalUsers = this.fileHandler.getTotalUsers();
            if (!totalUsers || totalUsers === 0) {
                this.uiManager.showError('No users to import', 'Please select a CSV file with users to import.');
                return;
            }
            
            const importOptions = {
                selectedPopulationId: currentPopulation.id,
                selectedPopulationName: currentPopulation.name,
                totalUsers,
                file: this.fileHandler.getCurrentFile()
            };
            
            // Debug: Log the population being used for import
            console.log('=== startImport Debug ===');
            console.log('Import options:', importOptions);
            console.log('Population ID for this import:', importOptions.selectedPopulationId);
            console.log('Population name for this import:', importOptions.selectedPopulationName);
            console.log('========================');
            
            // Capture the selected population name and ID at the start of the import
            const { selectedPopulationName, selectedPopulationId } = importOptions;
            const populationNameForThisRun = selectedPopulationName;
            const populationIdForThisRun = selectedPopulationId;
            
            // Show import status
            this.uiManager.showImportStatus(importOptions.totalUsers, populationNameForThisRun, populationIdForThisRun);
            
            // Start import process - send file as FormData
            const formData = new FormData();
            formData.append('file', importOptions.file);
            formData.append('selectedPopulationId', importOptions.selectedPopulationId);
            formData.append('selectedPopulationName', importOptions.selectedPopulationName);
            formData.append('totalUsers', importOptions.totalUsers.toString());
            
            // Debug: Log the FormData contents
            console.log('=== FormData Debug ===');
            console.log('File being sent:', importOptions.file);
            console.log('Population ID:', importOptions.selectedPopulationId);
            console.log('Population Name:', importOptions.selectedPopulationName);
            console.log('Total Users:', importOptions.totalUsers);
            console.log('========================');
            
            const response = await this.localClient.postFormData('/api/import', formData, {
                signal: this.importAbortController.signal,
                onProgress: (current, total, message, counts) => {
                    this.uiManager.updateImportProgress(current, total, message, counts, populationNameForThisRun, populationIdForThisRun);
                }
            });
            
            // Handle completion
            if (response.success) {
                this.uiManager.updateImportProgress(importOptions.totalUsers, importOptions.totalUsers, 'Import completed successfully', response.counts, populationNameForThisRun, populationIdForThisRun);
                this.uiManager.showSuccess('Import completed successfully', response.message);
            } else {
                this.uiManager.updateImportProgress(0, importOptions.totalUsers, 'Import failed', response.counts, populationNameForThisRun, populationIdForThisRun);
                this.uiManager.showError('Import failed', response.error);
            }
            
        } catch (error) {
            // Get current population for error handling
            const currentPopulation = this.forceRefreshPopulationSelection();
            const populationNameForThisRun = currentPopulation ? currentPopulation.name : '';
            const populationIdForThisRun = currentPopulation ? currentPopulation.id : '';
            
            if (error.name === 'AbortError') {
                this.uiManager.updateImportProgress(0, 0, 'Import cancelled', {}, populationNameForThisRun, populationIdForThisRun);
                this.uiManager.showInfo('Import cancelled');
            } else {
                this.uiManager.updateImportProgress(0, 0, 'Import failed: ' + error.message, {}, populationNameForThisRun, populationIdForThisRun);
                this.uiManager.showError('Import failed', error.message);
            }
        } finally {
            this.isImporting = false;
            this.importAbortController = null;
        }
    }

    getImportOptions() {
        const populationSelect = document.getElementById('import-population-select');
        const selectedPopulationId = populationSelect?.value;
        const selectedPopulationName = populationSelect?.selectedOptions[0]?.text || '';
        
        // Debug: Log the current population selection
        console.log('=== getImportOptions Debug ===');
        console.log('Population select element:', populationSelect);
        console.log('Selected population ID:', selectedPopulationId);
        console.log('Selected population name:', selectedPopulationName);
        console.log('All options:', populationSelect ? Array.from(populationSelect.options).map(opt => ({ value: opt.value, text: opt.text })) : 'No select element');
        console.log('===========================');
        
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

    // Enhanced method to get current population selection with validation
    getCurrentPopulationSelection() {
        const populationSelect = document.getElementById('import-population-select');
        if (!populationSelect) {
            console.error('Population select element not found');
            return null;
        }
        
        const selectedPopulationId = populationSelect.value;
        const selectedPopulationName = populationSelect.selectedOptions[0]?.text || '';
        
        console.log('=== getCurrentPopulationSelection ===');
        console.log('Population ID:', selectedPopulationId);
        console.log('Population Name:', selectedPopulationName);
        console.log('Select element exists:', !!populationSelect);
        console.log('Select element value:', populationSelect.value);
        console.log('Selected option:', populationSelect.selectedOptions[0]);
        console.log('====================================');
        
        if (!selectedPopulationId) {
            return null;
        }
        
        return {
            id: selectedPopulationId,
            name: selectedPopulationName
        };
    }

    // Force refresh population selection to ensure it's current
    forceRefreshPopulationSelection() {
        const populationSelect = document.getElementById('import-population-select');
        if (!populationSelect) {
            console.error('Population select element not found for refresh');
            return null;
        }
        
        // Force a re-read of the current selection
        const currentValue = populationSelect.value;
        const currentText = populationSelect.selectedOptions[0]?.text || '';
        
        console.log('=== forceRefreshPopulationSelection ===');
        console.log('Forced refresh - Population ID:', currentValue);
        console.log('Forced refresh - Population Name:', currentText);
        console.log('==========================================');
        
        return {
            id: currentValue,
            name: currentText
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
            
            // Capture the selected population name and ID at the start of the delete
            const { selectedPopulationName, selectedPopulationId } = deleteOptions;
            const populationNameForThisRun = selectedPopulationName;
            const populationIdForThisRun = selectedPopulationId;
            
            // Show delete status
            this.uiManager.showDeleteStatus(deleteOptions.totalUsers, populationNameForThisRun, populationIdForThisRun);
            
            // Start delete process
            const response = await this.localClient.post('/api/delete-users', deleteOptions, {
                signal: this.deleteAbortController.signal,
                onProgress: (current, total, message, counts) => {
                    this.uiManager.updateDeleteProgress(current, total, message, counts, populationNameForThisRun, populationIdForThisRun);
                }
            });
            
            // Handle completion
            if (response.success) {
                this.uiManager.updateDeleteProgress(deleteOptions.totalUsers, deleteOptions.totalUsers, 'Delete completed successfully', response.counts, populationNameForThisRun, populationIdForThisRun);
                this.uiManager.showSuccess('Delete completed successfully', response.message);
            } else {
                this.uiManager.updateDeleteProgress(0, deleteOptions.totalUsers, 'Delete failed', response.counts, populationNameForThisRun, populationIdForThisRun);
                this.uiManager.showError('Delete failed', response.error);
            }
            
        } catch (error) {
            const deleteOptions = this.getDeleteOptions();
            const populationNameForThisRun = deleteOptions ? deleteOptions.selectedPopulationName : '';
            const populationIdForThisRun = deleteOptions ? deleteOptions.selectedPopulationId : '';
            if (error.name === 'AbortError') {
                this.uiManager.updateDeleteProgress(0, 0, 'Delete cancelled', {}, populationNameForThisRun, populationIdForThisRun);
                this.uiManager.showInfo('Delete cancelled');
            } else {
                this.uiManager.updateDeleteProgress(0, 0, 'Delete failed: ' + error.message, {}, populationNameForThisRun, populationIdForThisRun);
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
            console.log('Get Token button clicked - starting token retrieval...');
            
            // Set button loading state
            this.uiManager.setButtonLoading('get-token-btn', true);
            this.uiManager.updateConnectionStatus('connecting', 'Getting token...');
            
            console.log('Using PingOneClient to get token (with localStorage storage)...');
            
            // Use PingOneClient which handles localStorage storage
            if (!this.pingOneClient) {
                throw new Error('PingOneClient not initialized');
            }
            
            const token = await this.pingOneClient.getAccessToken();
            
            console.log('Token retrieved successfully via PingOneClient');
            
            // Verify localStorage storage
            if (typeof localStorage !== 'undefined') {
                const storedToken = localStorage.getItem('pingone_worker_token');
                const storedExpiry = localStorage.getItem('pingone_token_expiry');
                console.log('localStorage verification:', {
                    hasStoredToken: !!storedToken,
                    hasStoredExpiry: !!storedExpiry,
                    tokenLength: storedToken ? storedToken.length : 0,
                    expiryTime: storedExpiry ? new Date(parseInt(storedExpiry)).toISOString() : null
                });
            }
            
            if (token) {
                this.uiManager.updateConnectionStatus('connected', 'Token retrieved and stored successfully');
                this.uiManager.showSuccess('Token retrieved and stored successfully', 'Token has been saved to your browser for future use.');
                this.uiManager.updateHomeTokenStatus(false);
            } else {
                this.uiManager.updateConnectionStatus('error', 'Failed to get token');
                this.uiManager.showError('Failed to get token', 'No token received from server');
            }
            
        } catch (error) {
            console.error('Error in getToken:', error);
            this.uiManager.updateConnectionStatus('error', 'Failed to get token: ' + error.message);
            this.uiManager.showError('Failed to get token', error.message);
        } finally {
            // Always reset button loading state
            console.log('Resetting Get Token button loading state...');
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

    async handleFileSelect(file) {
        try {
            await this.fileHandler.setFile(file);
            this.uiManager.showSuccess('File selected successfully', `Selected file: ${file.name}`);
            
            // Update import button state after file selection
            this.updateImportButtonState();
            // Show population prompt if needed
            this.showPopulationChoicePrompt();
        } catch (error) {
            this.uiManager.showError('Failed to select file', error.message);
        }
    }

    refreshProgressPage() {
        // Refresh progress data if needed
        this.uiManager.refreshProgressData();
    }

    // Test function to verify population selection
    testPopulationSelection() {
        console.log('=== Testing Population Selection ===');
        const populationSelect = document.getElementById('import-population-select');
        console.log('Population select element:', populationSelect);
        console.log('Current value:', populationSelect?.value);
        console.log('Selected option text:', populationSelect?.selectedOptions[0]?.text);
        console.log('All options:', populationSelect ? Array.from(populationSelect.options).map(opt => ({ value: opt.value, text: opt.text })) : 'No select element');
        
        // Test getImportOptions
        const options = this.getImportOptions();
        console.log('getImportOptions result:', options);
        
        // Test getCurrentPopulationSelection
        const currentSelection = this.getCurrentPopulationSelection();
        console.log('getCurrentPopulationSelection result:', currentSelection);
        
        // Test forceRefreshPopulationSelection
        const forceRefresh = this.forceRefreshPopulationSelection();
        console.log('forceRefreshPopulationSelection result:', forceRefresh);
        
        // Validate consistency
        if (options && currentSelection && forceRefresh) {
            const isConsistent = options.selectedPopulationId === currentSelection.id && 
                               currentSelection.id === forceRefresh.id;
            console.log('Population selection consistency:', isConsistent);
            if (!isConsistent) {
                console.warn('Population selection inconsistency detected!');
            }
        }
        
        console.log('===============================');
        return {
            options,
            currentSelection,
            forceRefresh
        };
    }

    // Robust disclaimer agreement setup
    setupDisclaimerAgreement() {
        console.log('=== Setting up Disclaimer Agreement ===');
        
        // Ensure home view is visible
        const homeView = document.getElementById('home-view');
        if (homeView) {
            homeView.style.display = 'block';
            homeView.classList.add('active');
            console.log('✅ Home view made visible');
        } else {
            console.error('❌ Home view not found');
        }
        
        // Get the required elements
        const disclaimerCheckbox = document.getElementById('disclaimer-agreement');
        const riskCheckbox = document.getElementById('risk-acceptance');
        const acceptButton = document.getElementById('accept-disclaimer');
        
        // Validate elements exist
        if (!disclaimerCheckbox || !riskCheckbox || !acceptButton) {
            console.error('Required disclaimer elements not found:', {
                disclaimerCheckbox: !!disclaimerCheckbox,
                riskCheckbox: !!riskCheckbox,
                acceptButton: !!acceptButton
            });
            
            // Try to find elements with different selectors
            console.log('Trying alternative selectors...');
            const altDisclaimerCheckbox = document.querySelector('input[id="disclaimer-agreement"]');
            const altRiskCheckbox = document.querySelector('input[id="risk-acceptance"]');
            const altAcceptButton = document.querySelector('button[id="accept-disclaimer"]');
            
            console.log('Alternative selector results:', {
                altDisclaimerCheckbox: !!altDisclaimerCheckbox,
                altRiskCheckbox: !!altRiskCheckbox,
                altAcceptButton: !!altAcceptButton
            });
            
            return;
        }
        
        console.log('All disclaimer elements found successfully');
        console.log('Disclaimer checkbox:', disclaimerCheckbox);
        console.log('Risk checkbox:', riskCheckbox);
        console.log('Accept button:', acceptButton);
        
        // Function to check if both checkboxes are checked
        const checkAgreementStatus = () => {
            const disclaimerChecked = disclaimerCheckbox.checked;
            const riskChecked = riskCheckbox.checked;
            const bothChecked = disclaimerChecked && riskChecked;
            
            console.log('Agreement status check:', {
                disclaimerChecked,
                riskChecked,
                bothChecked
            });
            
            // Enable/disable button based on checkbox status
            acceptButton.disabled = !bothChecked;
            
            // Update button appearance
            if (bothChecked) {
                acceptButton.classList.remove('btn-secondary');
                acceptButton.classList.add('btn-danger');
                console.log('✅ Disclaimer button enabled');
            } else {
                acceptButton.classList.remove('btn-danger');
                acceptButton.classList.add('btn-secondary');
                console.log('❌ Disclaimer button disabled');
            }
        };
        
        // Set up event listeners for both checkboxes
        disclaimerCheckbox.addEventListener('change', (e) => {
            console.log('Disclaimer checkbox changed:', e.target.checked);
            checkAgreementStatus();
        });
        
        riskCheckbox.addEventListener('change', (e) => {
            console.log('Risk checkbox changed:', e.target.checked);
            checkAgreementStatus();
        });
        
        // Set up event listener for the accept button
        acceptButton.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('Disclaimer accept button clicked');
            
            // Validate both checkboxes are still checked
            if (disclaimerCheckbox.checked && riskCheckbox.checked) {
                console.log('✅ Disclaimer accepted - enabling tool');
                this.enableToolAfterDisclaimer();
            } else {
                console.warn('❌ Disclaimer button clicked but checkboxes not checked');
                this.uiManager.showError('Disclaimer Error', 'Please check both agreement boxes before proceeding.');
            }
        });
        
        // Initial status check
        checkAgreementStatus();
        
        console.log('=== Disclaimer Agreement Setup Complete ===');
    }
    
    // Enable the tool after disclaimer is accepted
    enableToolAfterDisclaimer() {
        console.log('=== Enabling Tool After Disclaimer ===');
        
        try {
            // Hide the disclaimer section
            const disclaimerSection = document.getElementById('disclaimer');
            if (disclaimerSection) {
                disclaimerSection.style.display = 'none';
                console.log('Disclaimer section hidden');
            }
            
            // Enable navigation tabs
            const navItems = document.querySelectorAll('[data-view]');
            navItems.forEach(item => {
                item.style.pointerEvents = 'auto';
                item.style.opacity = '1';
            });
            
            // Enable feature cards
            const featureCards = document.querySelectorAll('.feature-card');
            featureCards.forEach(card => {
                card.style.pointerEvents = 'auto';
                card.style.opacity = '1';
            });
            
            // Show success message
            this.uiManager.showSuccess('Tool Enabled', 'You have accepted the disclaimer. The tool is now enabled.');
            
            // Store disclaimer acceptance in localStorage
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('disclaimerAccepted', 'true');
                localStorage.setItem('disclaimerAcceptedDate', new Date().toISOString());
            }
            
            console.log('✅ Tool enabled successfully after disclaimer acceptance');
            
        } catch (error) {
            console.error('Error enabling tool after disclaimer:', error);
            this.uiManager.showError('Error', 'Failed to enable tool after disclaimer acceptance.');
        }
    }
    
    // Check if disclaimer was previously accepted
    checkDisclaimerStatus() {
        if (typeof localStorage !== 'undefined') {
            const disclaimerAccepted = localStorage.getItem('disclaimerAccepted');
            const disclaimerDate = localStorage.getItem('disclaimerAcceptedDate');
            
            console.log('Disclaimer status check:', {
                accepted: disclaimerAccepted,
                date: disclaimerDate
            });
            
            if (disclaimerAccepted === 'true') {
                console.log('Disclaimer previously accepted, enabling tool');
                this.enableToolAfterDisclaimer();
                return true;
            }
        }
        
        return false;
    }

    showPopulationChoicePrompt() {
        // Only show once per import session
        if (this.populationPromptShown) return;
        // Check if both file and population are selected
        const file = this.fileHandler.getCurrentFile && this.fileHandler.getCurrentFile();
        const populationSelect = document.getElementById('import-population-select');
        const populationId = populationSelect && populationSelect.value;
        if (!file || !populationId) return;
        // Check if CSV has a populationId column
        const users = this.fileHandler.getParsedUsers ? this.fileHandler.getParsedUsers() : [];
        if (!users.length) return;
        const hasPopulationColumn = Object.keys(users[0]).some(
            h => h.toLowerCase() === 'populationid' || h.toLowerCase() === 'population_id'
        );
        if (!hasPopulationColumn) return; // Don't prompt if no populationId in CSV
        // Show the modal
        const modal = document.getElementById('population-warning-modal');
        if (!modal) return;
        modal.style.display = 'flex';
        this.populationPromptShown = true;
        // Set up modal buttons
        const okBtn = document.getElementById('population-warning-ok');
        const settingsBtn = document.getElementById('population-warning-settings');
        // Optionally, add override/ignore/use-csv buttons if you want more than just OK/Settings
        // For now, just close on OK
        if (okBtn) {
            okBtn.onclick = () => {
                modal.style.display = 'none';
                this.populationChoice = 'use-csv'; // Default to use CSV if present
            };
        }
        if (settingsBtn) {
            settingsBtn.onclick = () => {
                modal.style.display = 'none';
                this.populationChoice = 'settings';
                this.showView('settings');
            };
        }
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