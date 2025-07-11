// File: app.js
// Description: Main application entry point for PingOne user import tool
// 
// This file orchestrates the entire application, managing:
// - UI state and view transitions
// - File upload and CSV processing
// - Import/export/modify/delete operations
// - Real-time progress tracking via SSE
// - Settings management and population selection
// - Error handling and user feedback
// - Disclaimer agreement and feature flags

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
 * Secret Field Toggle Component
 * 
 * Manages the visibility toggle for sensitive input fields (like API secrets).
 * Provides a secure way to show/hide sensitive data with visual feedback.
 * 
 * Features:
 * - Toggle between visible and masked input
 * - Visual eye icon that changes based on state
 * - Maintains actual value while showing masked version
 * - Prevents accidental exposure of sensitive data
 */
class SecretFieldToggle {
    constructor() {
        // Core DOM elements for the toggle functionality
        this.inputElement = null;
        this.eyeButton = null;
        
        // State tracking for visibility and initialization
        this.isVisible = false;
        this.actualValue = '';
        this.isInitialized = false;
    }

    /**
     * Initialize the secret field toggle component
     * 
     * Sets up DOM element references and event handlers for the toggle functionality.
     * Called during app initialization to prepare the secret field for user interaction.
     * 
     * @returns {void}
     */
    init() {
        // Prevent double initialization
        if (this.isInitialized) {
            return;
        }

        // Get references to the required DOM elements
        this.inputElement = document.getElementById('api-secret');
        this.eyeButton = document.getElementById('toggle-api-secret-visibility');

        // Validate that both elements exist before proceeding
        if (!this.inputElement || !this.eyeButton) {
            console.error('❌ Secret field elements not found');
            console.error('Input element:', !!this.inputElement);
            console.error('Eye button:', !!this.eyeButton);
            return;
        }

        console.log('✅ Secret field elements found');
        console.log('Input element ID:', this.inputElement.id);
        console.log('Eye button ID:', this.eyeButton.id);

        // Set up event handlers for user interaction
        this.setupToggleHandler();
        this.handleInputChange();
        
        // Mark as initialized to prevent re-initialization
        this.isInitialized = true;
        console.log('✅ Secret field toggle initialized');
    }

    /**
     * Set up the toggle button click handler
     * 
     * Binds the click event to the eye button for toggling visibility.
     * Ensures proper event handling and prevents memory leaks.
     * 
     * @returns {void}
     */
    setupToggleHandler() {
        // Remove any existing listeners to prevent duplicates
        this.eyeButton.removeEventListener('click', this.handleToggleClick);
        
        // Add the click handler with proper binding
        this.eyeButton.addEventListener('click', this.handleToggleClick.bind(this));
        
        console.log('Secret field toggle handler set up');
    }

    /**
     * Handle the toggle button click event
     * 
     * Toggles the visibility state of the secret field and updates the UI accordingly.
     * Prevents event bubbling and provides visual feedback to the user.
     * 
     * @param {Event} e - The click event object
     * @returns {void}
     */
    handleToggleClick(e) {
        // Prevent default behavior and stop event propagation
        e.preventDefault();
        e.stopPropagation();
        
        console.log('🔍 Eye button clicked!');
        console.log('Current visibility:', this.isVisible);
        console.log('Current value length:', this.actualValue.length);
        
        // Toggle the visibility state
        this.isVisible = !this.isVisible;
        
        // Update the input field display based on new state
        this.updateInputField();
        
        // Update the eye icon to reflect current state
        this.updateEyeIcon();
        
        console.log('✅ Toggle completed!');
        console.log('New visibility:', this.isVisible);
        console.log('Input type:', this.inputElement.type);
        console.log('Input value length:', this.inputElement.value.length);
    }

    /**
     * Update the input field display based on visibility state
     * 
     * Switches between text and password input types to show/hide the actual value.
     * Maintains the actual value while providing visual masking for security.
     * 
     * @returns {void}
     */
    updateInputField() {
        if (!this.inputElement) {
            return;
        }

        if (this.isVisible) {
            // Show the actual value in plain text
            this.inputElement.type = 'text';
            this.inputElement.value = this.actualValue;
        } else {
            // Show masked value using password input type
            this.inputElement.type = 'password';
            this.inputElement.value = this.actualValue || '';
        }
    }

    /**
     * Update the eye icon to reflect current visibility state
     * 
     * Changes the FontAwesome icon class to show either an open eye (visible)
     * or crossed-out eye (hidden) based on the current state.
     * 
     * @returns {void}
     */
    updateEyeIcon() {
        if (!this.eyeButton) {
            return;
        }

        // Find the icon element within the button
        const iconElement = this.eyeButton.querySelector('i');
        if (!iconElement) {
            return;
        }

        if (this.isVisible) {
            // Show open eye icon for visible state
            iconElement.classList.remove('fa-eye-slash');
            iconElement.classList.add('fa-eye');
        } else {
            // Show crossed-out eye icon for hidden state
            iconElement.classList.remove('fa-eye');
            iconElement.classList.add('fa-eye-slash');
        }
    }

    /**
     * Set the secret value and update display
     * 
     * Called when the form is populated with existing settings.
     * Always starts in hidden state for security.
     * 
     * @param {string} value - The secret value to store
     * @returns {void}
     */
    setValue(value) {
        this.actualValue = value || '';
        
        // Always start in hidden state for security
        this.isVisible = false;
        
        // Update the display to reflect the new value
        this.updateInputField();
        this.updateEyeIcon();
        
        console.log('Secret field value set, length:', this.actualValue.length);
    }

    /**
     * Get the current secret value
     * 
     * Returns the actual stored value, not the displayed value.
     * 
     * @returns {string} The current secret value
     */
    getValue() {
        return this.actualValue;
    }

    /**
     * Handle input changes when user types in the field
     * 
     * Updates the stored value to match what the user is typing.
     * Ensures the actual value stays synchronized with user input.
     * 
     * @returns {void}
     */
    handleInputChange() {
        if (!this.inputElement) {
            return;
        }

        // Listen for input changes and update stored value
        this.inputElement.addEventListener('input', (e) => {
            this.actualValue = e.target.value;
            console.log('Secret field input changed, new length:', this.actualValue.length);
        });
    }
}

/**
 * Main Application Class
 * 
 * Orchestrates the entire PingOne user import tool application.
 * Manages all UI interactions, API calls, file processing, and state management.
 * 
 * Key Responsibilities:
 * - Initialize and coordinate all component modules
 * - Handle user interactions and view transitions
 * - Manage import/export/modify/delete operations
 * - Provide real-time progress feedback via SSE
 * - Handle error states and user notifications
 * - Manage settings and population selection
 */
class App {
    constructor() {
        // Initialize core component modules
        // Each module handles a specific aspect of the application
        this.logger = new Logger();
        this.fileLogger = new FileLogger();
        this.settingsManager = new SettingsManager(this.logger);
        this.uiManager = new UIManager(this.logger);
        this.localClient = new LocalAPIClient();
        this.tokenManager = new TokenManager(this.logger);
        this.fileHandler = new FileHandler(this.logger, this.uiManager);
        this.versionManager = new VersionManager(this.logger);
        
        // Initialize secret field manager for secure input handling
        this.secretFieldToggle = new SecretFieldToggle();
        
        // Application state tracking
        // Tracks current view and operation states to prevent conflicts
        this.currentView = 'import';
        this.isImporting = false;
        this.isExporting = false;
        this.isDeleting = false;
        this.isModifying = false;
            
        // Abort controllers for canceling ongoing operations
        this.importAbortController = null;
        this.exportAbortController = null;
        this.deleteAbortController = null;
        this.modifyAbortController = null;

        this.populationPromptShown = false;
        this.populationChoice = null; // 'override', 'ignore', 'use-csv'
        
        // Error tracking for import operations
        this.importErrors = [];
    }

    /**
     * Initialize the application and all its components
     * 
     * Sets up all modules, loads settings, establishes connections,
     * and prepares the UI for user interaction. This is the main
     * entry point after the app is constructed.
     * 
     * @returns {Promise<void>}
     */
    async init() {
        try {
            console.log('Initializing app...');
            
            // Initialize API Factory first to establish API client infrastructure
            await this.initAPIFactory();
            
            // Initialize API clients for PingOne communication
            this.pingOneClient = apiFactory.getPingOneClient(this.logger, this.settingsManager);
            
            // Initialize UI manager for interface management
            await this.uiManager.init();
            
            // Initialize settings manager for configuration handling
            await this.settingsManager.init();
            
            // Initialize file handler for CSV processing
            this.fileHandler = new FileHandler(this.logger, this.uiManager);
            
            // Initialize secret field toggle for secure input handling
            this.secretFieldToggle = new SecretFieldToggle();
            this.secretFieldToggle.init();
            
            // Load application settings from storage
            await this.loadSettings();
            
            // Setup event listeners for user interactions
            this.setupEventListeners();
            
            // Check disclaimer status and setup if needed
            // Ensures user has accepted terms before using the tool
            const disclaimerPreviouslyAccepted = this.checkDisclaimerStatus();
            if (!disclaimerPreviouslyAccepted) {
                console.log('Disclaimer not previously accepted, setting up disclaimer agreement');
                this.setupDisclaimerAgreement();
            } else {
                console.log('Disclaimer previously accepted, tool already enabled');
            }
            
            // Check server connection status to ensure backend is available
            await this.checkServerConnectionStatus();
            
            // Update import button state after initialization
            // Ensures UI reflects current application state
            this.updateImportButtonState();
            
            // Update version information in UI for user reference
            this.versionManager.updateTitle();
            
            console.log('App initialization complete');
            console.log("✅ Moved Import Progress section below Import Users button");
            
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

        // Import progress close button
        const closeImportStatusBtn = document.getElementById('close-import-status');
        if (closeImportStatusBtn) {
            closeImportStatusBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const importStatus = document.getElementById('import-status');
                if (importStatus) {
                    importStatus.style.display = 'none';
                }
            });
        }
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
                connStatus.textContent = '✅ Settings saved! Please - Get token';
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

    // Helper: Validate UUID v4
    isValidUUID(uuid) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
    }

    /**
     * Handles file selection from the UI, parses CSV, and triggers population conflict logic if needed
     * @param {File} file - The selected CSV file
     */
    async handleFileSelect(file) {
        try {
            // Log file selection for debugging
            this.uiManager.debugLog("FileUpload", `File selected: ${file.name}, size: ${file.size}`);
            await this.fileHandler.setFile(file);
            this.uiManager.showSuccess('File selected successfully', `Selected file: ${file.name}`);
            // Update import button state after file selection
            this.updateImportButtonState();

            // --- Population conflict detection ---
            const users = this.fileHandler.getParsedUsers ? this.fileHandler.getParsedUsers() : [];
            // Log number of users parsed from CSV
            this.uiManager.debugLog("CSV", `Parsed ${users.length} users from CSV`);
            const populationSelect = document.getElementById('import-population-select');
            const uiPopulationId = populationSelect && populationSelect.value;
            // Log selected population
            this.uiManager.debugLog("Population", `Selected population: ${uiPopulationId}`);
            let hasCsvPopulation = false;
            if (users.length) {
                hasCsvPopulation = Object.keys(users[0]).some(
                    h => h.toLowerCase() === 'populationid' || h.toLowerCase() === 'population_id'
                ) && users.some(u => u.populationId && u.populationId.trim() !== '');
            }
            // If both UI and CSV have population, show conflict modal
            if (uiPopulationId && hasCsvPopulation) {
                const modal = document.getElementById('population-conflict-modal');
                if (modal) {
                    modal.style.display = 'flex';
                    // Set up modal buttons for user choice
                    const useUiBtn = document.getElementById('use-ui-population');
                    const useCsvBtn = document.getElementById('use-csv-population');
                    const cancelBtn = document.getElementById('cancel-population-conflict');
                    useUiBtn.onclick = () => {
                        modal.style.display = 'none';
                        // Overwrite all user records with UI populationId
                        users.forEach(u => u.populationId = uiPopulationId);
                        this.populationChoice = 'ui';
                        this.uiManager.logMessage('info', 'Population conflict resolved: using UI dropdown');
                    };
                    useCsvBtn.onclick = () => {
                        modal.style.display = 'none';
                        // Use CSV populationId as-is
                        this.populationChoice = 'csv';
                        this.uiManager.logMessage('info', 'Population conflict resolved: using CSV file');
                    };
                    cancelBtn.onclick = () => {
                        modal.style.display = 'none';
                        this.populationChoice = null;
                        this.uiManager.logMessage('warning', 'Population conflict prompt cancelled.');
                    };
                }
                return;
            }
            // If only UI or only CSV, no prompt needed
            if (uiPopulationId && !hasCsvPopulation) {
                users.forEach(u => u.populationId = uiPopulationId);
                this.populationChoice = 'ui';
            } else if (!uiPopulationId && hasCsvPopulation) {
                this.populationChoice = 'csv';
            }
            // Show population prompt if needed (legacy)
            this.showPopulationChoicePrompt();
        } catch (error) {
            this.uiManager.showError('Failed to select file', error.message);
        }
    }

    /**
     * Starts the user import flow with real-time progress tracking
     * 
     * Validates user inputs, sends CSV data to the server, and establishes
     * a Server-Sent Events (SSE) connection for real-time progress updates.
     * Handles error states, retry logic, and user feedback throughout the process.
     * 
     * @returns {Promise<void>}
     */
    async startImport() {
        // Prevent multiple simultaneous imports
        if (this.isImporting) {
            this.logger.warn('Import already in progress');
            return;
        }
        
        // SSE connection management variables
        let sseSource;
        let sseRetryCount = 0;
        const maxSseRetries = 3;
        const retryDelay = 5000;
        
        /**
         * Establishes SSE connection for real-time import progress updates
         * 
         * Opens a persistent connection to receive progress events from the server.
         * Handles various event types: progress updates, errors, and completion.
         * Includes retry logic for connection failures.
         * 
         * @param {string} sessionId - Unique session identifier for this import
         */
        const connectSSE = (sessionId) => {
            // Log SSE connection attempt for debugging
            this.uiManager.debugLog("SSE", `Connecting with sessionId: ${sessionId}`);
            
            // Create EventSource for Server-Sent Events connection
            // This establishes a persistent HTTP connection for real-time updates
            sseSource = new window.EventSource(`/api/import/progress/${sessionId}`);
            
            // Track if server has sent an error event to prevent false retries
            let serverErrorReceived = false;
            
            // Handle progress updates from the server
            // Each event contains current progress, total count, and status information
            sseSource.addEventListener('progress', (event) => {
                this.uiManager.debugLog("SSE", "Progress event received", event.data);
                let data;
                try {
                    data = JSON.parse(event.data);
                } catch (e) {
                    this.uiManager.debugLog("SSE", "Failed to parse progress event data", event.data);
                    return;
                }
                // Log which user is currently being processed
                if (data.user) {
                    this.uiManager.debugLog("Import", `Processing user: ${data.user.username}`);
                }
                
                // Log progress update with current/total counts
                if (data.current !== undefined && data.total !== undefined) {
                    this.uiManager.debugLog("Import", `Progress update: ${data.current} of ${data.total}`);
                }
                
                // Update UI with progress information
                // This updates the progress bar, counts, and status messages
                this.uiManager.updateImportProgress(
                    data.current || 0,
                    data.total || 0,
                    data.message || '',
                    data.counts || {},
                    data.populationName || '',
                    data.populationId || ''
                );
                
                // Display status message to user if provided
                if (data.message) {
                    this.uiManager.logMessage('info', data.message);
                }
            });
            // Handle explicit server error events
            // These are sent by the server when import fails due to server-side issues
            sseSource.addEventListener('error', (event) => {
                serverErrorReceived = true;
                let data = {};
                try { data = JSON.parse(event.data); } catch {}
                this.uiManager.debugLog("SSE", "Server error event received", data);
                
                // Update UI with error information
                const errorSummary = 'Import failed due to server error';
                const errorDetails = [data.error || 'SSE server error'];
                this.uiManager.updateImportErrorStatus(errorSummary, errorDetails);
                this.uiManager.showError('Import failed', data.error || 'SSE server error');
                
                // Clean up connection and state
                sseSource.close();
                this.isImporting = false;
            });
            
            // Handle import completion event
            // Sent by server when import process finishes (success or failure)
            sseSource.addEventListener('done', (event) => {
                this.uiManager.debugLog("SSE", "Done event received", event.data);
                sseSource.close();
                this.isImporting = false;
            });
            
            // Log when SSE connection successfully opens
            // This confirms the connection is established and ready for events
            sseSource.onopen = (event) => {
                this.uiManager.debugLog("SSE", "Connection opened", { readyState: sseSource.readyState });
                this.uiManager.logMessage('api', 'SSE connection opened for import progress.');
                sseRetryCount = 0;
            };
            
            // Handle connection errors and implement retry logic
            // Distinguishes between network errors and server errors
            sseSource.onerror = (err) => {
                this.uiManager.debugLog("SSE", "Connection error", { readyState: sseSource.readyState, sessionId });
                if (!serverErrorReceived) {
                    this.uiManager.logMessage('warning', 'SSE connection lost. Retrying...');
                    sseSource.close();
                    if (sseRetryCount < maxSseRetries) {
                        sseRetryCount++;
                        setTimeout(() => connectSSE(sessionId), retryDelay);
                    } else {
                        this.uiManager.showError('Import progress stream lost', 'Real-time updates unavailable. Progress will not update live, but import will continue.');
                        this.isImporting = false;
                    }
                }
            };
        };
        try {
            // Set import state to prevent multiple simultaneous imports
            this.isImporting = true;
            this.importAbortController = new AbortController();
            
            // Validate import options (file, population, etc.)
            const importOptions = this.getImportOptions();
            if (!importOptions) {
                this.isImporting = false;
                return;
            }
            
            // Log import start with user count for debugging
            this.uiManager.debugLog("Import", "Import process started", { userCount: importOptions.totalUsers });
            this.uiManager.showImportStatus(importOptions.totalUsers, importOptions.selectedPopulationName, importOptions.selectedPopulationId);
            
            // Prepare FormData for file upload to server
            // Includes file, population selection, and metadata
            const formData = new FormData();
            formData.append('file', importOptions.file);
            formData.append('selectedPopulationId', importOptions.selectedPopulationId);
            formData.append('selectedPopulationName', importOptions.selectedPopulationName);
            formData.append('totalUsers', importOptions.totalUsers);
            
            // Send CSV data and population info to backend for processing
            // The server will start the import process and return a session ID
            const response = await fetch('/api/import', {
                method: 'POST',
                body: formData,
                signal: this.importAbortController.signal
            });
            const result = await response.json();
            const sessionId = result.sessionId;
            
            // Validate session ID is present (required for SSE connection)
            if (!sessionId) {
                this.uiManager.debugLog("Import", "Session ID is undefined. Import cannot proceed.");
                this.uiManager.showError('Import failed', 'Session ID is undefined. Import cannot proceed.');
                this.isImporting = false;
                return;
            }
            
            // Log session ID and establish SSE connection for progress updates
            this.uiManager.debugLog("Import", "Session ID received", { sessionId });
            connectSSE(sessionId);
        } catch (error) {
            this.uiManager.debugLog("Import", "Error starting import", error);
            this.uiManager.showError('Import failed', error.message || error);
            this.isImporting = false;
        }
    }

    /**
     * Validates and retrieves import configuration options
     * 
     * Checks that a population is selected and a CSV file is loaded.
     * Returns the configuration needed to start the import process.
     * Shows appropriate error messages if validation fails.
     * 
     * @returns {Object|null} Import options or null if validation fails
     */
    getImportOptions() {
        // Get population selection from UI
        const populationSelect = document.getElementById('import-population-select');
        const selectedPopulationId = populationSelect?.value;
        const selectedPopulationName = populationSelect?.selectedOptions[0]?.text || '';
        
        // Debug logging to help troubleshoot population selection issues
        console.log('=== getImportOptions Debug ===');
        console.log('Population select element:', populationSelect);
        console.log('Selected population ID:', selectedPopulationId);
        console.log('Selected population name:', selectedPopulationName);
        console.log('All options:', populationSelect ? Array.from(populationSelect.options).map(opt => ({ value: opt.value, text: opt.text })) : 'No select element');
        console.log('===========================');
        
        // Validate population selection is required
        if (!selectedPopulationId) {
            this.uiManager.showError('No population selected', 'Please select a population before starting the import.');
            return null;
        }
        
        // Validate CSV file contains users to import
        const totalUsers = this.fileHandler.getTotalUsers();
        if (!totalUsers || totalUsers === 0) {
            this.uiManager.showError('No users to import', 'Please select a CSV file with users to import.');
            return null;
        }
        
        // Return validated import configuration
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

    /**
     * Starts the user export flow by validating options, sending request to the server, and handling progress
     */
    async startExport() {
        if (this.isExporting) {
            this.logger.warn('Export already in progress');
            return;
        }
        try {
            this.isExporting = true;
            this.exportAbortController = new AbortController();
            const exportOptions = this.getExportOptions();
            // If no export options, show error and stop
            if (!exportOptions) {
                this.isExporting = false;
                return;
            }
            // Show export status in UI
            this.uiManager.showExportStatus();
            // Send export request to backend
            const response = await this.localClient.post('/api/export-users', exportOptions, {
                signal: this.exportAbortController.signal,
                onProgress: (current, total, message, counts) => {
                    // Update UI with export progress
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

    /**
     * Starts the user delete flow by validating options, sending request to the server, and handling progress
     */
    async startDelete() {
        if (this.isDeleting) {
            this.logger.warn('Delete already in progress');
            return;
        }
        try {
            this.isDeleting = true;
            this.deleteAbortController = new AbortController();
            const deleteOptions = this.getDeleteOptions();
            // If no delete options, show error and stop
            if (!deleteOptions) {
                this.isDeleting = false;
                return;
            }
            // Show delete status in UI
            this.uiManager.showDeleteStatus(deleteOptions.totalUsers, deleteOptions.populationName, deleteOptions.populationId);
            // Send delete request to backend
            const response = await this.localClient.post('/api/delete-users', deleteOptions, {
                signal: this.deleteAbortController.signal,
                onProgress: (current, total, message, counts) => {
                    // Update UI with delete progress
                    this.uiManager.updateDeleteProgress(current, total, message, counts, deleteOptions.populationName, deleteOptions.populationId);
                }
            });
            // Handle completion
            if (response.success) {
                this.uiManager.updateDeleteProgress(deleteOptions.totalUsers, deleteOptions.totalUsers, 'Delete completed successfully', response.counts, deleteOptions.populationName, deleteOptions.populationId);
                this.uiManager.showSuccess('Delete completed successfully', response.message);
            } else {
                this.uiManager.updateDeleteProgress(0, deleteOptions.totalUsers, 'Delete failed', response.counts, deleteOptions.populationName, deleteOptions.populationId);
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

    /**
     * Starts the user modify flow by validating options, sending request to the server, and handling progress
     */
    async startModify() {
        if (this.isModifying) {
            this.logger.warn('Modify already in progress');
            return;
        }
        try {
            this.isModifying = true;
            this.modifyAbortController = new AbortController();
            const modifyOptions = this.getModifyOptions();
            // If no modify options, show error and stop
            if (!modifyOptions) {
                this.isModifying = false;
                return;
            }
            // Show modify status in UI
            this.uiManager.showModifyStatus(modifyOptions.totalUsers);
            // Send modify request to backend
            const response = await this.localClient.post('/api/modify-users', modifyOptions, {
                signal: this.modifyAbortController.signal,
                onProgress: (current, total, message, counts) => {
                    // Update UI with modify progress
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

    showPopulationConflictModal(conflictData, sessionId) {
        console.log('Showing population conflict modal:', conflictData);
        
        // Create modal HTML if it doesn't exist
        let modal = document.getElementById('population-conflict-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'population-conflict-modal';
            modal.className = 'modal fade show';
            modal.style.display = 'flex';
            modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
            modal.style.position = 'fixed';
            modal.style.top = '0';
            modal.style.left = '0';
            modal.style.width = '100%';
            modal.style.height = '100%';
            modal.style.zIndex = '9999';
            
            modal.innerHTML = `
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Population Conflict Detected</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="alert alert-warning">
                                <strong>Conflict:</strong> Your CSV file contains population data AND you selected a population in the UI.
                            </div>
                            <div class="row">
                                <div class="col-md-6">
                                    <div class="card">
                                        <div class="card-header">
                                            <h6>CSV Population Data</h6>
                                        </div>
                                        <div class="card-body">
                                            <p><strong>Users with population IDs:</strong> ${conflictData.csvPopulationCount}</p>
                                            <p>Users in your CSV file have their own population assignments.</p>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="card">
                                        <div class="card-header">
                                            <h6>UI Selected Population</h6>
                                        </div>
                                        <div class="card-body">
                                            <p><strong>Selected population:</strong> ${conflictData.uiSelectedPopulation}</p>
                                            <p>You selected this population in the dropdown.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="mt-3">
                                <p><strong>Please choose which population to use:</strong></p>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" id="use-csv-population">
                                Use CSV Population Data
                            </button>
                            <button type="button" class="btn btn-primary" id="use-ui-population">
                                Use UI Selected Population
                            </button>
                            <button type="button" class="btn btn-outline-secondary" id="cancel-conflict-resolution">
                                Cancel Import
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
        } else {
            modal.style.display = 'flex';
        }
        
        // Set up event listeners
        const useCsvBtn = document.getElementById('use-csv-population');
        const useUiBtn = document.getElementById('use-ui-population');
        const cancelBtn = document.getElementById('cancel-conflict-resolution');
        
        const closeModal = () => {
            modal.style.display = 'none';
        };
        
        const resolveConflict = async (useCsvPopulation) => {
            try {
                const response = await fetch('/api/import/resolve-conflict', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sessionId,
                        useCsvPopulation,
                        useUiPopulation: !useCsvPopulation
                    })
                });
                
                const result = await response.json();
                if (result.success) {
                    closeModal();
                    this.uiManager.showSuccess('Conflict resolved', 'Import will continue with your selection.');
                    
                    // Restart the import with the resolved conflict
                    await this.startImport();
                } else {
                    this.uiManager.showError('Failed to resolve conflict', result.error || 'Unknown error');
                }
            } catch (error) {
                this.uiManager.showError('Failed to resolve conflict', error.message);
            }
        };
        
        useCsvBtn.onclick = () => resolveConflict(true);
        useUiBtn.onclick = () => resolveConflict(false);
        cancelBtn.onclick = () => {
            closeModal();
            this.uiManager.showInfo('Import cancelled', 'Population conflict resolution was cancelled.');
        };
    }

    showInvalidPopulationModal(invalidData, sessionId) {
        console.log('Showing invalid population modal:', invalidData);
        // Get UI-selected population
        let uiPopulationName = '';
        let uiPopulationId = '';
        const populationSelect = document.getElementById('import-population-select');
        if (populationSelect) {
            uiPopulationId = populationSelect.value;
            uiPopulationName = populationSelect.selectedOptions[0]?.text || '';
        }
        // Create modal HTML if it doesn't exist
        let modal = document.getElementById('invalid-population-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'invalid-population-modal';
            modal.className = 'modal fade show';
            modal.style.display = 'flex';
            modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
            modal.style.position = 'fixed';
            modal.style.top = '0';
            modal.style.left = '0';
            modal.style.width = '100%';
            modal.style.height = '100%';
            modal.style.zIndex = '9999';
            modal.innerHTML = `
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Invalid Populations Detected</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="alert alert-warning">
                                <strong>Warning:</strong> Your CSV file contains population IDs that don't exist in PingOne.
                            </div>
                            <div class="ui-selected-population" style="background:#f8f9fa; border:1px solid #dee2e6; border-radius:5px; padding:8px 12px; margin-bottom:12px;">
                                <strong>UI-selected population:</strong> ${uiPopulationName ? uiPopulationName : '(none selected)'}${uiPopulationId ? ` <span style='color:#888'>(ID: ${uiPopulationId})</span>` : ''}
                            </div>
                            <div class="row">
                                <div class="col-md-6">
                                    <div class="card">
                                        <div class="card-header">
                                            <h6>Invalid Populations</h6>
                                        </div>
                                        <div class="card-body">
                                            <p><strong>Invalid population IDs:</strong></p>
                                            <ul>
                                                ${invalidData.invalidPopulations.map(id => `<li><code>${id}</code></li>`).join('')}
                                            </ul>
                                            <p><strong>Affected users:</strong> ${invalidData.affectedUserCount}</p>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="card">
                                        <div class="card-header">
                                            <h6>Select Valid Population</h6>
                                        </div>
                                        <div class="card-body">
                                            <p>Please select a valid population to use for these users:</p>
                                            <select class="form-select" id="valid-population-select">
                                                <option value="">Loading populations...</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-primary" id="use-selected-population" disabled>
                                Use Selected Population
                            </button>
                            <button type="button" class="btn btn-outline-secondary" id="cancel-invalid-population-resolution">
                                Cancel Import
                            </button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        } else {
            // Update UI-selected population info if modal already exists
            const uiPopDiv = modal.querySelector('.ui-selected-population');
            if (uiPopDiv) {
                uiPopDiv.innerHTML = `<strong>UI-selected population:</strong> ${uiPopulationName ? uiPopulationName : '(none selected)'}${uiPopulationId ? ` <span style='color:#888'>(ID: ${uiPopulationId})</span>` : ''}`;
            }
            modal.style.display = 'flex';
        }
        // Use a different variable for the modal's population select
        const modalPopulationSelect = document.getElementById('valid-population-select');
        // Load available populations
        this.loadPopulationsForModal(invalidData, sessionId);
        
        // Set up event listeners
        const useSelectedBtn = document.getElementById('use-selected-population');
        const cancelBtn = document.getElementById('cancel-invalid-population-resolution');
        const populationSelectForModal = document.getElementById('valid-population-select');
        
        const closeModal = () => {
            modal.style.display = 'none';
        };
        
        const resolveInvalidPopulation = async (selectedPopulationId) => {
            try {
                const response = await fetch('/api/import/resolve-invalid-population', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sessionId,
                        selectedPopulationId
                    })
                });
                
                const result = await response.json();
                if (result.success) {
                    closeModal();
                    this.uiManager.showSuccess('Invalid population resolved', 'Import will continue with the selected population.');
                    
                    // Restart the import with the resolved invalid population
                    await this.startImport();
                } else {
                    this.uiManager.showError('Failed to resolve invalid population', result.error || 'Unknown error');
                }
            } catch (error) {
                this.uiManager.showError('Failed to resolve invalid population', error.message);
            }
        };
        
        useSelectedBtn.onclick = () => {
            const selectedPopulationId = populationSelectForModal.value;
            if (selectedPopulationId) {
                // Apply selected population to all affected users (fallback to all if indexes missing)
                const users = this.fileHandler.getParsedUsers ? this.fileHandler.getParsedUsers() : [];
                let indexes = [];
                if (invalidData && Array.isArray(invalidData.affectedUserIndexes) && invalidData.affectedUserIndexes.length > 0) {
                    indexes = invalidData.affectedUserIndexes;
                } else {
                    indexes = users.map((_, idx) => idx);
                }
                console.log("Affected indexes:", indexes);
                console.log("Users before update:", users.slice(0, 5));
                indexes.forEach(idx => {
                    if (users[idx]) users[idx].populationId = selectedPopulationId;
                });
                console.log("User resolved population conflict with:", selectedPopulationId);
                this.uiManager.logMessage('info', `User resolved population conflict with: ${selectedPopulationId}`);
                closeModal();
                // Resume import
                this.startImport();
            }
        };
        
        cancelBtn.onclick = () => {
            closeModal();
            this.uiManager.showInfo('Import cancelled', 'Invalid population resolution was cancelled.');
        };
        
        // Enable/disable button based on selection
        populationSelectForModal.addEventListener('change', () => {
            useSelectedBtn.disabled = !populationSelectForModal.value;
        });
    }

    async loadPopulationsForModal(invalidData, sessionId) {
        try {
            const response = await fetch('/api/pingone/populations');
            if (response.ok) {
                const populations = await response.json();
                const populationSelect = document.getElementById('valid-population-select');
                
                if (populationSelect) {
                    populationSelect.innerHTML = '<option value="">Select a population...</option>';
                    populations.forEach(population => {
                        const option = document.createElement('option');
                        option.value = population.id;
                        option.textContent = population.name;
                        populationSelect.appendChild(option);
                    });
                }
            } else {
                console.error('Failed to load populations for modal');
            }
        } catch (error) {
            console.error('Error loading populations for modal:', error);
        }
    }

    // Error tracking methods for import operations
    trackImportError(errorMessage) {
        this.importErrors.push(errorMessage);
        this.updateImportErrorDisplay();
    }

    clearImportErrors() {
        this.importErrors = [];
        this.uiManager.hideImportErrorStatus();
    }

    updateImportErrorDisplay() {
        if (this.importErrors.length > 0) {
            const errorSummary = `Import completed with ${this.importErrors.length} error(s)`;
            this.uiManager.updateImportErrorStatus(errorSummary, this.importErrors);
        } else {
            this.uiManager.hideImportErrorStatus();
        }
    }

    resetImportErrorTracking() {
        this.importErrors = [];
        this.uiManager.hideImportErrorStatus();
    }

    // Prompt user to pick a valid population if none is selected
    async promptForPopulationSelection(affectedIndexes, users) {
        return new Promise((resolve) => {
            // Build modal
            let modal = document.getElementById('pick-population-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'pick-population-modal';
                modal.className = 'modal fade show';
                modal.style.display = 'flex';
                modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
                modal.style.position = 'fixed';
                modal.style.top = '0';
                modal.style.left = '0';
                modal.style.width = '100%';
                modal.style.height = '100%';
                modal.style.zIndex = '9999';
                modal.innerHTML = `
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">Select Population for Import</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <div class="alert alert-warning">
                                    <strong>Warning:</strong> No valid population is selected. Please pick a population to use for all users missing or with invalid population IDs.
                                </div>
                                <div class="form-group">
                                    <label for="pick-population-select">Select Population:</label>
                                    <select class="form-select" id="pick-population-select">
                                        <option value="">Loading populations...</option>
                                    </select>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-primary" id="pick-population-confirm" disabled>Use Selected Population</button>
                                <button type="button" class="btn btn-outline-secondary" id="pick-population-cancel">Cancel Import</button>
                            </div>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
            } else {
                modal.style.display = 'flex';
            }
            // Populate dropdown
            const populationSelect = document.getElementById('pick-population-select');
            populationSelect.innerHTML = '<option value="">Select a population...</option>';
            const importPopSelect = document.getElementById('import-population-select');
            if (importPopSelect) {
                Array.from(importPopSelect.options).forEach(opt => {
                    if (opt.value) {
                        const option = document.createElement('option');
                        option.value = opt.value;
                        option.textContent = opt.text;
                        populationSelect.appendChild(option);
                    }
                });
            }
            // Enable confirm button only if a valid selection
            const confirmBtn = document.getElementById('pick-population-confirm');
            populationSelect.addEventListener('change', () => {
                confirmBtn.disabled = !populationSelect.value;
            });
            // Confirm handler
            confirmBtn.onclick = () => {
                const selectedId = populationSelect.value;
                if (selectedId) {
                    // Set the UI dropdown to this value
                    if (importPopSelect) importPopSelect.value = selectedId;
                    modal.style.display = 'none';
                    resolve(selectedId);
                }
            };
            // Cancel handler
            document.getElementById('pick-population-cancel').onclick = () => {
                modal.style.display = 'none';
                this.uiManager.showInfo('Import cancelled', 'No population selected.');
                resolve(null);
            };
        });
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

// Debug log filtering functions
window.clearDebugLog = function() {
    const debugContent = document.getElementById('debug-log-content');
    if (debugContent) {
        debugContent.innerHTML = '';
    }
};

window.toggleDebugFilter = function(area) {
    // Store filter state
    if (!window.debugFilters) window.debugFilters = {};
    window.debugFilters[area] = !window.debugFilters[area];
    applyDebugFilters();
};

window.applyDebugFilters = function() {
    const debugContent = document.getElementById('debug-log-content');
    if (!debugContent) return;
    
    const entries = debugContent.querySelectorAll('.debug-log-entry');
    entries.forEach(entry => {
        const area = entry.getAttribute('data-area');
        const isVisible = !window.debugFilters || window.debugFilters[area] !== false;
        entry.style.display = isVisible ? 'block' : 'none';
    });
};

// Initialize debug filters
window.debugFilters = {};

// Global click handler for log entries to enable expand/collapse functionality
document.addEventListener('click', (e) => {
    // Check if the clicked element is a log entry or inside one
    const logEntry = e.target.closest('.log-entry');
    if (!logEntry) return;
    
    // Check if the clicked element is an expand icon
    const expandIcon = e.target.closest('.log-expand-icon');
    if (expandIcon) {
        e.stopPropagation(); // Prevent triggering the log entry click
    }
    
    // Find the details and icon elements
    const details = logEntry.querySelector('.log-details');
    const icon = logEntry.querySelector('.log-expand-icon');
    
    if (details && icon) {
        const isExpanded = details.style.display !== 'none';
        
        if (isExpanded) {
            // Collapse
            details.style.display = 'none';
            icon.innerHTML = '▶';
            logEntry.classList.remove('expanded');
        } else {
            // Expand
            details.style.display = 'block';
            icon.innerHTML = '▼';
            logEntry.classList.add('expanded');
        }
    }
});

// Function to add expand icons to existing log entries that don't have them
window.addExpandIconsToLogEntries = function() {
    const logEntries = document.querySelectorAll('.log-entry');
    logEntries.forEach(entry => {
        // Check if this entry already has an expand icon
        const existingIcon = entry.querySelector('.log-expand-icon');
        if (existingIcon) return;
        
        // Check if this entry has details that could be expanded
        const details = entry.querySelector('.log-details');
        const hasData = entry.querySelector('.log-data, .log-context, .log-detail-section');
        
        if (details || hasData) {
            // Find the header or create one
            let header = entry.querySelector('.log-header');
            if (!header) {
                // Create a header if it doesn't exist
                header = document.createElement('div');
                header.className = 'log-header';
                header.style.display = 'flex';
                header.style.alignItems = 'center';
                header.style.gap = '8px';
                
                // Move existing content to header
                const children = Array.from(entry.children);
                children.forEach(child => {
                    if (!child.classList.contains('log-details')) {
                        header.appendChild(child);
                    }
                });
                
                entry.insertBefore(header, entry.firstChild);
            }
            
            // Add expand icon
            const expandIcon = document.createElement('span');
            expandIcon.className = 'log-expand-icon';
            expandIcon.innerHTML = '▶';
            expandIcon.style.cursor = 'pointer';
            header.appendChild(expandIcon);
            
            // Ensure details are initially hidden
            if (details) {
                details.style.display = 'none';
            }
        }
    });
};

// Call the function when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Add a small delay to ensure all content is loaded
    setTimeout(() => {
        window.addExpandIconsToLogEntries();
    }, 100);
});