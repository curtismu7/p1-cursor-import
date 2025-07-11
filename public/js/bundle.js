(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
function _interopRequireDefault(e) {
  return e && e.__esModule ? e : {
    "default": e
  };
}
module.exports = _interopRequireDefault, module.exports.__esModule = true, module.exports["default"] = module.exports;
},{}],2:[function(require,module,exports){
"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");
var _logger = require("./modules/logger.js");
var _fileLogger = require("./modules/file-logger.js");
var _settingsManager = require("./modules/settings-manager.js");
var _uiManager = require("./modules/ui-manager.js");
var _localApiClient = require("./modules/local-api-client.js");
var _pingoneClient = require("./modules/pingone-client.js");
var _tokenManager = _interopRequireDefault(require("./modules/token-manager.js"));
var _fileHandler = require("./modules/file-handler.js");
var _versionManager = require("./modules/version-manager.js");
var _apiFactory = require("./modules/api-factory.js");
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
    this.inputElement.addEventListener('input', e => {
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
    this.logger = new _logger.Logger();
    this.fileLogger = new _fileLogger.FileLogger();
    this.settingsManager = new _settingsManager.SettingsManager(this.logger);
    this.uiManager = new _uiManager.UIManager(this.logger);
    this.localClient = new _localApiClient.LocalAPIClient();
    this.tokenManager = new _tokenManager.default(this.logger);
    this.fileHandler = new _fileHandler.FileHandler(this.logger, this.uiManager);
    this.versionManager = new _versionManager.VersionManager(this.logger);

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
      this.pingOneClient = _apiFactory.apiFactory.getPingOneClient(this.logger, this.settingsManager);

      // Initialize UI manager for interface management
      await this.uiManager.init();

      // Initialize settings manager for configuration handling
      await this.settingsManager.init();

      // Initialize file handler for CSV processing
      this.fileHandler = new _fileHandler.FileHandler(this.logger, this.uiManager);

      // Initialize secret field toggle for secure input handling
      this.secretFieldToggle = new SecretFieldToggle();
      this.secretFieldToggle.init();

      // Load application settings from storage
      await this.loadSettings();

      // Initialize universal token status after UI manager is ready
      this.updateUniversalTokenStatus();

      // Set up event listeners
      this.setupEventListeners();

      // Check disclaimer status and setup if needed
      // Ensures user has accepted terms before using the tool
      const disclaimerPreviouslyAccepted = this.checkDisclaimerStatus();
      if (!disclaimerPreviouslyAccepted) {
        console.log('Disclaimer not previously accepted, setting up disclaimer agreement');
        // Ensure DOM is ready before setting up disclaimer
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => {
            this.setupDisclaimerAgreement();
          });
        } else {
          // DOM is already loaded, setup immediately
          this.setupDisclaimerAgreement();
        }
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
      await (0, _apiFactory.initAPIFactory)(this.logger, this.settingsManager);
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

        // Show current token status if PingOneClient is available
        if (this.pingOneClient) {
          const tokenInfo = this.pingOneClient.getCurrentTokenTimeRemaining();
          this.uiManager.showCurrentTokenStatus(tokenInfo);
          if (window.DEBUG_MODE) {
            console.log('Current token status:', tokenInfo);
          }
        }
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
      csvFileInput.addEventListener('change', event => {
        const file = event.target.files[0];
        if (file) {
          this.handleFileSelect(file);
        }
      });
    }

    // Import event listeners
    const startImportBtn = document.getElementById('start-import-btn');
    if (startImportBtn) {
      startImportBtn.addEventListener('click', async e => {
        e.preventDefault();
        await this.startImport();
      });
    }
    const startImportBtnBottom = document.getElementById('start-import-btn-bottom');
    if (startImportBtnBottom) {
      startImportBtnBottom.addEventListener('click', async e => {
        e.preventDefault();
        await this.startImport();
      });
    }
    const cancelImportBtn = document.getElementById('cancel-import-btn');
    if (cancelImportBtn) {
      cancelImportBtn.addEventListener('click', e => {
        e.preventDefault();
        this.cancelImport();
      });
    }
    const cancelImportBtnBottom = document.getElementById('cancel-import-btn-bottom');
    if (cancelImportBtnBottom) {
      cancelImportBtnBottom.addEventListener('click', e => {
        e.preventDefault();
        this.cancelImport();
      });
    }

    // Export event listeners
    const startExportBtn = document.getElementById('start-export-btn');
    if (startExportBtn) {
      startExportBtn.addEventListener('click', async e => {
        e.preventDefault();
        await this.startExport();
      });
    }
    const cancelExportBtn = document.getElementById('cancel-export-btn');
    if (cancelExportBtn) {
      cancelExportBtn.addEventListener('click', e => {
        e.preventDefault();
        this.cancelExport();
      });
    }

    // Delete event listeners
    const startDeleteBtn = document.getElementById('start-delete-btn');
    if (startDeleteBtn) {
      startDeleteBtn.addEventListener('click', async e => {
        e.preventDefault();
        await this.startDelete();
      });
    }
    const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
    if (cancelDeleteBtn) {
      cancelDeleteBtn.addEventListener('click', e => {
        e.preventDefault();
        this.cancelDelete();
      });
    }

    // Modify event listeners
    const startModifyBtn = document.getElementById('start-modify-btn');
    if (startModifyBtn) {
      startModifyBtn.addEventListener('click', async e => {
        e.preventDefault();
        await this.startModify();
      });
    }
    const cancelModifyBtn = document.getElementById('cancel-modify-btn');
    if (cancelModifyBtn) {
      cancelModifyBtn.addEventListener('click', e => {
        e.preventDefault();
        this.cancelModify();
      });
    }

    // Population delete event listeners
    const startPopulationDeleteBtn = document.getElementById('start-population-delete-btn');
    if (startPopulationDeleteBtn) {
      startPopulationDeleteBtn.addEventListener('click', async e => {
        e.preventDefault();
        await this.startPopulationDelete();
      });
    }
    const cancelPopulationDeleteBtn = document.getElementById('cancel-population-delete-btn');
    if (cancelPopulationDeleteBtn) {
      cancelPopulationDeleteBtn.addEventListener('click', e => {
        e.preventDefault();
        this.cancelPopulationDelete();
      });
    }

    // Settings form event listeners
    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
      settingsForm.addEventListener('submit', async e => {
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
      testConnectionBtn.addEventListener('click', async e => {
        e.preventDefault();
        await this.testConnection();
      });
    }

    // Population dropdown event listener
    const populationSelect = document.getElementById('import-population-select');
    if (populationSelect) {
      console.log('Setting up population select event listener...');
      populationSelect.addEventListener('change', e => {
        const selectedPopulationId = e.target.value;
        const selectedPopulationName = e.target.selectedOptions[0]?.text || '';
        console.log('=== Population Selection Changed ===');
        console.log('Selected Population ID:', selectedPopulationId);
        console.log('Selected Population Name:', selectedPopulationName);
        console.log('Event target:', e.target);
        console.log('All options:', Array.from(e.target.options).map(opt => ({
          value: opt.value,
          text: opt.text,
          selected: opt.selected
        })));
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
      getTokenBtn.addEventListener('click', async e => {
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
      item.addEventListener('click', e => {
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
      toggle.addEventListener('change', async e => {
        const flag = e.target.getAttribute('data-feature-flag');
        const enabled = e.target.checked;
        await this.toggleFeatureFlag(flag, enabled);
      });
    });

    // Import progress close button
    const closeImportStatusBtn = document.getElementById('close-import-status');
    if (closeImportStatusBtn) {
      closeImportStatusBtn.addEventListener('click', e => {
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
      const {
        pingOneInitialized,
        lastError
      } = response;
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
        this.logger.fileLogger.warn('Server is not connected to PingOne', {
          error: errorMessage
        });
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
      this.logger.fileLogger.error('Server connection check failed', {
        error: error.message
      });
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

      // Handle universal token status visibility
      this.handleTokenStatusVisibility(view);

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

      // Update universal token status when switching views
      this.updateUniversalTokenStatus();
    }
  }

  /**
   * Handle token status visibility based on current view
   * 
   * Controls when the universal token status bar should be visible
   * based on the current page. This ensures users see token status
   * on functional pages but not on the home page with disclaimer.
   * 
   * @param {string} view - The current view being displayed
   */
  handleTokenStatusVisibility(view) {
    try {
      const tokenStatusBar = document.getElementById('universal-token-status');
      if (!tokenStatusBar) return;

      // Hide token status on home page (disclaimer page)
      if (view === 'home') {
        tokenStatusBar.style.display = 'none';
      } else {
        // Show token status on all other pages
        tokenStatusBar.style.display = 'block';
      }
    } catch (error) {
      console.error('Error handling token status visibility:', error);
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
      this.pingOneClient = _apiFactory.apiFactory.getPingOneClient(this.logger, this.settingsManager);

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
      this.logger.fileLogger.error('Failed to save settings', {
        error: error.message
      });
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
        this.logger.error(`Error setting field ${id}`, {
          error: error.message
        });
        missingFields.push(id);
      }
    }
    if (missingFields.length > 0) {
      this.logger.warn('Missing form fields', {
        missingFields
      });
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
        hasCsvPopulation = Object.keys(users[0]).some(h => h.toLowerCase() === 'populationid' || h.toLowerCase() === 'population_id') && users.some(u => u.populationId && u.populationId.trim() !== '');
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
     * Includes retry logic for connection failures and comprehensive debugging.
     * 
     * @param {string} sessionId - Unique session identifier for this import
     */
    const connectSSE = sessionId => {
      // Full SSE lifecycle logging added for connection visibility and debugging

      // Validate sessionId before attempting connection
      if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '') {
        console.error("SSE: ❌ SSE failed: sessionId is undefined or invalid", {
          sessionId
        });
        this.uiManager.debugLog("SSE", "❌ Invalid sessionId - cannot establish connection", {
          sessionId
        });
        this.uiManager.showError('SSE Connection Error', 'Invalid session ID. Cannot establish progress connection.');
        this.uiManager.logMessage('error', 'SSE connection failed — missing session ID');
        this.isImporting = false;
        return;
      }

      // Check if EventSource is supported in the browser
      if (!window.EventSource) {
        console.error("SSE: ❌ EventSource not supported in this browser");
        this.uiManager.debugLog("SSE", "❌ EventSource not supported in this browser");
        this.uiManager.showError('SSE Not Supported', 'Your browser does not support Server-Sent Events. Progress updates will not be available.');
        this.uiManager.logMessage('error', 'SSE not supported in this browser');
        this.isImporting = false;
        return;
      }

      // Log SSE connection attempt for debugging
      console.log("SSE: 🔌 SSE opening with sessionId:", sessionId);
      this.uiManager.debugLog("SSE", `🔄 Attempting SSE connection with sessionId: ${sessionId}`, {
        retryCount: sseRetryCount,
        maxRetries: maxSseRetries,
        browserSupport: !!window.EventSource
      });
      this.uiManager.logMessage('info', `SSE: Opening connection with sessionId: ${sessionId}`);
      try {
        // Close existing connection if any
        if (sseSource) {
          console.log("SSE: 🔄 Closing existing SSE connection before creating new one");
          this.uiManager.debugLog("SSE", "🔄 Closing existing SSE connection before creating new one");
          sseSource.close();
          sseSource = null;
        }

        // Create EventSource for Server-Sent Events connection
        // This establishes a persistent HTTP connection for real-time updates
        const sseUrl = `/api/import/progress/${sessionId}`;
        console.log("SSE: 🔌 Creating EventSource for URL:", sseUrl);
        this.uiManager.debugLog("SSE", `🔄 Creating EventSource for URL: ${sseUrl}`);
        sseSource = new window.EventSource(sseUrl);

        // Track if server has sent an error event to prevent false retries
        let serverErrorReceived = false;
        let connectionEstablished = false;
        let lastHeartbeat = Date.now();

        // Handle connection opened event
        sseSource.addEventListener('open', event => {
          connectionEstablished = true;
          lastHeartbeat = Date.now();
          console.log("SSE: ✅ SSE connected");
          this.uiManager.debugLog("SSE", "✅ SSE connection opened successfully", {
            sessionId,
            readyState: sseSource.readyState,
            url: sseSource.url
          });
          this.uiManager.logMessage('success', 'SSE: Connection established successfully');

          // Reset retry count on successful connection
          sseRetryCount = 0;

          // Log connection details for debugging
          this.uiManager.logMessage('info', `SSE connected for import (sessionId: ${sessionId})`);
        });

        // Handle progress updates from the server
        // Each event contains current progress, total count, and status information
        sseSource.addEventListener('progress', event => {
          lastHeartbeat = Date.now();
          console.log("SSE: 📩 SSE message received:", event.data);
          this.uiManager.debugLog("SSE", "📊 Progress event received", {
            data: event.data,
            lastEventId: event.lastEventId,
            origin: event.origin
          });
          this.uiManager.logMessage('info', `SSE: Progress update received`);
          let data;
          try {
            data = JSON.parse(event.data);
            console.log("SSE: ✅ Progress data parsed successfully:", data);
            this.uiManager.debugLog("SSE", "✅ Progress data parsed successfully", data);
          } catch (e) {
            console.error("SSE: ❌ Failed to parse progress event data:", e.message, "Raw data:", event.data);
            this.uiManager.debugLog("SSE", "❌ Failed to parse progress event data", {
              rawData: event.data,
              error: e.message
            });
            this.uiManager.logMessage('error', 'SSE: Received malformed progress data from server');
            return;
          }

          // Validate required fields in progress data
          if (data.current === undefined || data.total === undefined) {
            console.error("SSE: ❌ Progress event missing required fields:", data);
            this.uiManager.debugLog("SSE", "❌ Progress event missing required fields", data);
            this.uiManager.logMessage('error', 'SSE: Progress event missing required fields (current/total)');
            return;
          }

          // Log which user is currently being processed
          if (data.user) {
            console.log("SSE: 👤 Processing user:", data.user.username || data.user.email || 'unknown');
            this.uiManager.debugLog("SSE", `👤 Processing user: ${data.user.username || data.user.email || 'unknown'}`);
          }

          // Log progress update with current/total counts
          if (data.current !== undefined && data.total !== undefined) {
            const percentage = Math.round(data.current / data.total * 100);
            console.log(`SSE: 📈 Progress update: ${data.current} of ${data.total} (${percentage}%)`);
            this.uiManager.debugLog("SSE", `📈 Progress update: ${data.current} of ${data.total} (${percentage}%)`);
          }

          // Update UI with progress information
          // This updates the progress bar, counts, and status messages
          this.uiManager.updateImportProgress(data.current || 0, data.total || 0, data.message || '', data.counts || {}, data.populationName || '', data.populationId || '');

          // Display status message to user if provided
          if (data.message) {
            this.uiManager.logMessage('info', data.message);
          }
        });

        // Handle explicit server error events
        // These are sent by the server when import fails due to server-side issues
        sseSource.addEventListener('error', event => {
          serverErrorReceived = true;
          console.error("SSE: ❌ SSE error event:", event);
          this.uiManager.debugLog("SSE", "❌ SSE error event received", {
            readyState: sseSource.readyState,
            error: event,
            serverErrorReceived
          });
          this.uiManager.logMessage('error', 'SSE: Error event received from server');
          let data = {};
          try {
            if (event.data) {
              data = JSON.parse(event.data);
              console.log("SSE: ✅ Error event data parsed:", data);
              this.uiManager.debugLog("SSE", "✅ Error event data parsed", data);
            }
          } catch (e) {
            console.error("SSE: ❌ Failed to parse error event data:", e.message, "Raw data:", event.data);
            this.uiManager.debugLog("SSE", "❌ Failed to parse error event data", {
              rawData: event.data,
              error: e.message
            });
          }

          // Update UI with error information
          const errorSummary = 'Import failed due to server error';
          const errorDetails = [data.error || 'SSE server error'];
          this.uiManager.updateImportErrorStatus(errorSummary, errorDetails);
          this.uiManager.showError('Import failed', data.error || 'SSE server error');

          // Clean up connection and state
          console.log("SSE: 🧹 Cleaning up SSE connection after error");
          this.uiManager.debugLog("SSE", "🧹 Cleaning up SSE connection after error");
          sseSource.close();
          importProgressStreams.delete(sessionId);
          this.isImporting = false;
        });

        // Handle import completion event
        sseSource.addEventListener('complete', event => {
          lastHeartbeat = Date.now();
          console.log("SSE: ✅ Import completion event received:", event.data);
          this.uiManager.debugLog("SSE", "✅ Import completion event received", {
            data: event.data,
            lastEventId: event.lastEventId
          });
          this.uiManager.logMessage('success', 'SSE: Import completion event received');
          let data;
          try {
            data = JSON.parse(event.data);
            console.log("SSE: ✅ Completion data parsed successfully:", data);
            this.uiManager.debugLog("SSE", "✅ Completion data parsed successfully", data);
          } catch (e) {
            console.error("SSE: ❌ Failed to parse completion event data:", e.message, "Raw data:", event.data);
            this.uiManager.debugLog("SSE", "❌ Failed to parse completion event data", {
              rawData: event.data,
              error: e.message
            });
            return;
          }

          // Update final progress and show completion message
          this.uiManager.updateImportProgress(data.current || 0, data.total || 0, data.message || 'Import completed', data.counts || {}, data.populationName || '', data.populationId || '');
          if (data.message) {
            this.uiManager.logMessage('success', data.message);
          }

          // Clean up connection
          console.log("SSE: 🧹 Cleaning up SSE connection after completion");
          this.uiManager.debugLog("SSE", "🧹 Cleaning up SSE connection after completion");
          sseSource.close();
          importProgressStreams.delete(sessionId);
          this.isImporting = false;
        });

        // Handle population conflict events
        sseSource.addEventListener('population_conflict', event => {
          lastHeartbeat = Date.now();
          console.log("SSE: ⚠️ Population conflict event received:", event.data);
          this.uiManager.debugLog("SSE", "⚠️ Population conflict event received", {
            data: event.data,
            lastEventId: event.lastEventId
          });
          this.uiManager.logMessage('warning', 'SSE: Population conflict detected');
          let data;
          try {
            data = JSON.parse(event.data);
            console.log("SSE: ✅ Population conflict data parsed:", data);
            this.uiManager.debugLog("SSE", "✅ Population conflict data parsed", data);
          } catch (e) {
            console.error("SSE: ❌ Failed to parse population conflict data:", e.message, "Raw data:", event.data);
            this.uiManager.debugLog("SSE", "❌ Failed to parse population conflict data", {
              rawData: event.data,
              error: e.message
            });
            return;
          }

          // Show population conflict modal
          this.showPopulationConflictModal(data, sessionId);
        });

        // Handle invalid population events
        sseSource.addEventListener('invalid_population', event => {
          lastHeartbeat = Date.now();
          console.log("SSE: ⚠️ Invalid population event received:", event.data);
          this.uiManager.debugLog("SSE", "⚠️ Invalid population event received", {
            data: event.data,
            lastEventId: event.lastEventId
          });
          this.uiManager.logMessage('warning', 'SSE: Invalid population detected');
          let data;
          try {
            data = JSON.parse(event.data);
            console.log("SSE: ✅ Invalid population data parsed:", data);
            this.uiManager.debugLog("SSE", "✅ Invalid population data parsed", data);
          } catch (e) {
            console.error("SSE: ❌ Failed to parse invalid population data:", e.message, "Raw data:", event.data);
            this.uiManager.debugLog("SSE", "❌ Failed to parse invalid population data", {
              rawData: event.data,
              error: e.message
            });
            return;
          }

          // Show invalid population modal
          this.showInvalidPopulationModal(data, sessionId);
        });

        // Handle connection close events
        sseSource.addEventListener('close', event => {
          console.warn("SSE: ⚠️ SSE connection closed");
          this.uiManager.debugLog("SSE", "⚠️ SSE connection closed", {
            readyState: sseSource.readyState,
            event: event
          });
          this.uiManager.logMessage('warning', 'SSE: Connection closed');

          // Clean up connection
          importProgressStreams.delete(sessionId);
          this.isImporting = false;
        });

        // Handle connection errors (network, timeout, etc.)
        sseSource.onerror = event => {
          console.error("SSE: ❌ SSE connection error:", event);
          this.uiManager.debugLog("SSE", "❌ SSE connection error", {
            readyState: sseSource.readyState,
            error: event
          });
          this.uiManager.logMessage('error', 'SSE: Connection error occurred');

          // Only retry if no server error was received and we haven't exceeded max retries
          if (!serverErrorReceived && sseRetryCount < maxSseRetries) {
            sseRetryCount++;
            console.warn(`SSE: 🔁 SSE reconnecting... Attempt #${sseRetryCount}`);
            this.uiManager.debugLog("SSE", `🔁 SSE reconnecting... Attempt #${sseRetryCount}`, {
              retryCount: sseRetryCount,
              maxRetries: maxSseRetries
            });
            this.uiManager.logMessage('warning', `SSE: Reconnecting... Attempt #${sseRetryCount}`);

            // Close current connection
            if (sseSource) {
              sseSource.close();
              sseSource = null;
            }

            // Retry connection with exponential backoff
            const retryDelay = Math.min(1000 * Math.pow(2, sseRetryCount - 1), 30000);
            console.log(`SSE: ⏱️ Retrying in ${retryDelay}ms`);
            this.uiManager.logMessage('info', `SSE: Retrying connection in ${retryDelay}ms`);
            setTimeout(() => {
              connectSSE(sessionId);
            }, retryDelay);
          } else {
            console.error("SSE: ❌ Max retries exceeded or server error received, stopping retries");
            this.uiManager.debugLog("SSE", "❌ Max retries exceeded or server error received", {
              retryCount: sseRetryCount,
              maxRetries: maxSseRetries,
              serverErrorReceived
            });
            this.uiManager.logMessage('error', 'SSE: Max retries exceeded, stopping connection attempts');

            // Clean up connection
            if (sseSource) {
              sseSource.close();
              sseSource = null;
            }
            importProgressStreams.delete(sessionId);
            this.isImporting = false;
          }
        };

        // Set up heartbeat monitoring
        const heartbeatInterval = setInterval(() => {
          const timeSinceLastHeartbeat = Date.now() - lastHeartbeat;
          if (timeSinceLastHeartbeat > 60000) {
            // 60 seconds
            console.warn("SSE: ⚠️ No heartbeat received for 60 seconds");
            this.uiManager.debugLog("SSE", "⚠️ No heartbeat received for 60 seconds", {
              timeSinceLastHeartbeat,
              lastHeartbeat: new Date(lastHeartbeat).toISOString()
            });
            this.uiManager.logMessage('warning', 'SSE: No heartbeat received for 60 seconds');
          }
        }, 30000); // Check every 30 seconds

        // Clean up heartbeat monitoring when connection closes
        sseSource.addEventListener('close', () => {
          clearInterval(heartbeatInterval);
        });

        // Store connection for cleanup
        importProgressStreams.set(sessionId, sseSource);
      } catch (error) {
        console.error("SSE: ❌ Error creating SSE connection:", error.message);
        this.uiManager.debugLog("SSE", "❌ Error creating SSE connection", {
          error: error.message,
          stack: error.stack
        });
        this.uiManager.logMessage('error', `SSE: Failed to create connection - ${error.message}`);
        this.uiManager.showError('SSE Connection Error', `Failed to establish connection: ${error.message}`);
        this.isImporting = false;
      }
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
      this.uiManager.debugLog("Import", "Import process started", {
        userCount: importOptions.totalUsers
      });
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
      this.uiManager.debugLog("Import", "Session ID received", {
        sessionId
      });
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
    console.log('All options:', populationSelect ? Array.from(populationSelect.options).map(opt => ({
      value: opt.value,
      text: opt.text
    })) : 'No select element');
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

  /**
   * Format duration in seconds to a human-readable string
   * @param {number} seconds - Duration in seconds
   * @returns {string} Formatted duration string
   */
  formatDuration(seconds) {
    if (!seconds || seconds <= 0) {
      return '0s';
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    const secs = seconds % 60;
    let result = '';
    if (hours > 0) {
      result += `${hours}h `;
    }
    if (minutes > 0 || hours > 0) {
      result += `${minutes}m `;
    }
    result += `${secs}s`;
    return result.trim();
  }

  /**
   * Get time remaining until expiration from JWT token
   * @param {string} token - JWT token
   * @returns {number|null} Time remaining in seconds, or null if invalid
   */
  getTimeRemainingFromJWT(token) {
    try {
      // Simple JWT decode (just the payload part)
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }
      const payload = JSON.parse(atob(parts[1]));
      if (!payload.exp) {
        return null;
      }
      const now = Math.floor(Date.now() / 1000);
      const timeRemaining = payload.exp - now;
      return timeRemaining > 0 ? timeRemaining : 0;
    } catch (error) {
      console.error('Error decoding JWT token:', error);
      return null;
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
        // Calculate time remaining
        let timeLeft = '';
        const storedExpiry = localStorage.getItem('pingone_token_expiry');
        if (storedExpiry) {
          const expiryTime = parseInt(storedExpiry, 10);
          const now = Date.now();
          const timeRemainingSeconds = Math.max(0, Math.floor((expiryTime - now) / 1000));
          timeLeft = this.formatDuration(timeRemainingSeconds);
        } else {
          // Fallback: try to decode JWT if no expiry stored
          const timeRemainingSeconds = this.getTimeRemainingFromJWT(token);
          if (timeRemainingSeconds !== null) {
            timeLeft = this.formatDuration(timeRemainingSeconds);
          }
        }

        // Show success message with time remaining
        const successMessage = timeLeft ? `✅ New token acquired. Time left on token: ${timeLeft}` : '✅ New token acquired successfully';
        this.uiManager.updateConnectionStatus('connected', successMessage);
        this.uiManager.showSuccess('Token retrieved and stored successfully', timeLeft ? `Token has been saved to your browser. Time left: ${timeLeft}` : 'Token has been saved to your browser for future use.');
        this.uiManager.updateHomeTokenStatus(false);

        // Refresh token status display on settings page
        if (this.pingOneClient) {
          const tokenInfo = this.pingOneClient.getCurrentTokenTimeRemaining();
          this.uiManager.showCurrentTokenStatus(tokenInfo);
        }

        // Update universal token status across all pages
        this.updateUniversalTokenStatus();

        // Log success message if DEBUG_MODE is enabled
        if (window.DEBUG_MODE) {
          console.log('Token acquisition successful:', {
            tokenLength: token.length,
            timeLeft: timeLeft,
            successMessage: successMessage
          });
        }
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
      const response = await this.localClient.post(`/api/feature-flags/${flag}`, {
        enabled
      });
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
    console.log('All options:', populationSelect ? Array.from(populationSelect.options).map(opt => ({
      value: opt.value,
      text: opt.text
    })) : 'No select element');

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
      const isConsistent = options.selectedPopulationId === currentSelection.id && currentSelection.id === forceRefresh.id;
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

  // Simplifies UX for disclaimer acknowledgment while still ensuring legal consent
  setupDisclaimerAgreement() {
    // Validate presence of disclaimer elements before attaching listeners  
    // Prevents crash when elements are missing or page changes structure
    try {
      // Get required elements with defensive programming
      const disclaimerCheckbox = document.getElementById('disclaimer-agreement');
      const acceptButton = document.getElementById('accept-disclaimer');
      const disclaimerBox = document.getElementById('disclaimer');

      // Presence check for all required elements
      if (!disclaimerCheckbox || !acceptButton || !disclaimerBox) {
        console.warn('[Disclaimer] Required disclaimer elements not found:', {
          disclaimerCheckbox: !!disclaimerCheckbox,
          acceptButton: !!acceptButton,
          disclaimerBox: !!disclaimerBox
        });

        // Retry mechanism: if elements are not found, try again after a short delay
        if (document.readyState === 'loading') {
          console.log('[Disclaimer] DOM still loading, retrying in 100ms...');
          setTimeout(() => this.setupDisclaimerAgreement(), 100);
          return;
        }

        // Optional: Show a user-friendly message if disclaimer is broken
        if (disclaimerBox) {
          disclaimerBox.innerHTML = '<div class="alert alert-danger">Unable to load disclaimer controls. Please refresh or contact support.</div>';
        }
        return;
      }
      console.log('[Disclaimer] All required elements found successfully');

      // Function to check if the checkbox is checked
      const checkAgreementStatus = () => {
        const isChecked = disclaimerCheckbox.checked;
        acceptButton.disabled = !isChecked;

        // Update button appearance based on checkbox status
        if (isChecked) {
          acceptButton.classList.remove('btn-secondary');
          acceptButton.classList.add('btn-danger');
          console.log('[Disclaimer] ✅ Button enabled');
        } else {
          acceptButton.classList.remove('btn-danger');
          acceptButton.classList.add('btn-secondary');
          console.log('[Disclaimer] ❌ Button disabled');
        }
      };

      // Attach event listener to checkbox
      disclaimerCheckbox.addEventListener('change', e => {
        console.log('[Disclaimer] Checkbox changed:', e.target.checked);
        checkAgreementStatus();
      });

      // Attach event listener to accept button
      acceptButton.addEventListener('click', e => {
        e.preventDefault();
        console.log('[Disclaimer] Accept button clicked');

        // Validate checkbox is still checked
        if (disclaimerCheckbox.checked) {
          console.log('[Disclaimer] ✅ Disclaimer accepted - enabling tool');
          this.enableToolAfterDisclaimer();
        } else {
          console.warn('[Disclaimer] ❌ Button clicked but checkbox not checked');
          this.uiManager.showError('Disclaimer Error', 'Please check the agreement box before proceeding.');
        }
      });

      // Initial status check
      checkAgreementStatus();
      console.log('[Disclaimer] Setup completed successfully');
    } catch (err) {
      console.error('[Disclaimer] Error in setupDisclaimerAgreement:', err);
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
    const hasPopulationColumn = Object.keys(users[0]).some(h => h.toLowerCase() === 'populationid' || h.toLowerCase() === 'population_id');
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
    const resolveConflict = async useCsvPopulation => {
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
    const resolveInvalidPopulation = async selectedPopulationId => {
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
    return new Promise(resolve => {
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

  /**
   * Update universal token status across all pages
   * 
   * This method provides a centralized way to update the token status
   * display that appears on all pages. It ensures consistent token
   * status visibility and helps users understand their token state
   * without navigating to the settings page.
   * 
   * Called after token acquisition, expiration, or manual refresh
   * to keep all pages synchronized with current token state.
   */
  updateUniversalTokenStatus() {
    try {
      if (this.uiManager && this.uiManager.updateUniversalTokenStatus) {
        // Get current token info for accurate display
        let tokenInfo = null;
        if (this.pingOneClient) {
          tokenInfo = this.pingOneClient.getCurrentTokenTimeRemaining();
        }

        // Update the universal token status bar
        this.uiManager.updateUniversalTokenStatus(tokenInfo);
        if (window.DEBUG_MODE) {
          console.log('Universal token status updated:', tokenInfo);
        }
      }
    } catch (error) {
      console.error('Error updating universal token status:', error);
    }
  }

  // Enable the tool after disclaimer is accepted
  enableToolAfterDisclaimer() {
    console.log('[Disclaimer] === Enabling Tool After Disclaimer ===');
    try {
      // Hide the disclaimer section
      const disclaimerSection = document.getElementById('disclaimer');
      if (disclaimerSection) {
        disclaimerSection.style.display = 'none';
        console.log('[Disclaimer] Disclaimer section hidden');
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
      console.log('[Disclaimer] ✅ Tool enabled successfully after disclaimer acceptance');
    } catch (error) {
      console.error('[Disclaimer] Error enabling tool after disclaimer:', error);
      this.uiManager.showError('Error', 'Failed to enable tool after disclaimer acceptance.');
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

// Debug log filtering functions
window.clearDebugLog = function () {
  const debugContent = document.getElementById('debug-log-content');
  if (debugContent) {
    debugContent.innerHTML = '';
  }
};
window.toggleDebugFilter = function (area) {
  // Store filter state
  if (!window.debugFilters) window.debugFilters = {};
  window.debugFilters[area] = !window.debugFilters[area];
  applyDebugFilters();
};
window.applyDebugFilters = function () {
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
document.addEventListener('click', e => {
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
window.addExpandIconsToLogEntries = function () {
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

// === DEBUG LOG PANEL TOGGLE LOGIC ===

// === DEBUG LOG PANEL TOGGLE LOGIC ===
// Handles open/close, accessibility, and scroll position for the debug log panel
(function setupDebugLogToggle() {
  const toggleBtn = document.getElementById('debug-log-toggle');
  const panel = document.getElementById('debug-log-panel');
  const logEntries = document.getElementById('log-entries');
  let lastScrollTop = 0;
  if (!toggleBtn || !panel) return; // SAFEGUARD: Only run if elements exist

  // Toggle panel open/close
  function togglePanel(forceOpen) {
    const isOpen = !panel.classList.contains('collapsed');
    if (forceOpen === true || !isOpen && forceOpen === undefined) {
      panel.classList.remove('collapsed');
      toggleBtn.setAttribute('aria-expanded', 'true');
      toggleBtn.setAttribute('aria-label', 'Hide Debug Log Console');
      // Restore scroll position
      if (lastScrollTop) logEntries.scrollTop = lastScrollTop;
      panel.focus();
    } else {
      lastScrollTop = logEntries.scrollTop;
      panel.classList.add('collapsed');
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.setAttribute('aria-label', 'Show Debug Log Console');
      toggleBtn.focus();
    }
  }

  // Click handler
  toggleBtn.addEventListener('click', () => togglePanel());
  // Keyboard accessibility (Enter/Space)
  toggleBtn.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      togglePanel();
    }
  });
  // Optionally, close with Escape when focused
  panel.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      togglePanel(false);
    }
  });
  // Default to collapsed
  panel.classList.add('collapsed');
  toggleBtn.setAttribute('aria-expanded', 'false');
  // Optionally, open if hash is #debug-log
  if (window.location.hash === '#debug-log') togglePanel(true);
})();

},{"./modules/api-factory.js":3,"./modules/file-handler.js":6,"./modules/file-logger.js":7,"./modules/local-api-client.js":8,"./modules/logger.js":10,"./modules/pingone-client.js":11,"./modules/settings-manager.js":12,"./modules/token-manager.js":13,"./modules/ui-manager.js":14,"./modules/version-manager.js":15,"@babel/runtime/helpers/interopRequireDefault":1}],3:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.initAPIFactory = exports.getAPIFactory = exports.apiFactory = exports.APIFactory = void 0;
var _localApiClient = require("./local-api-client.js");
var _pingoneClient = require("./pingone-client.js");
/**
 * API Factory
 * Creates and manages API client instances
 */

/**
 * API Factory class
 */
class APIFactory {
  /**
   * Create a new APIFactory instance
   * @param {Object} logger - Logger instance
   * @param {Object} settingsManager - Settings manager instance
   */
  constructor(logger, settingsManager) {
    this.logger = logger || console;
    this.settingsManager = settingsManager;
    this.clients = new Map();
  }

  /**
   * Get or create a PingOne API client
   * @returns {PingOneClient} PingOne API client instance
   */
  getPingOneClient() {
    if (!this.clients.has('pingone')) {
      this.clients.set('pingone', new _pingoneClient.PingOneClient(this.logger, this.settingsManager));
    }
    return this.clients.get('pingone');
  }

  /**
   * Get or create a local API client
   * @param {string} [baseUrl=''] - Base URL for the API
   * @returns {LocalAPIClient} Local API client instance
   */
  getLocalClient() {
    let baseUrl = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '';
    const cacheKey = `local_${baseUrl}`;
    if (!this.clients.has(cacheKey)) {
      this.clients.set(cacheKey, new _localApiClient.LocalAPIClient(this.logger, baseUrl));
    }
    return this.clients.get(cacheKey);
  }

  /**
   * Get the default local API client (singleton)
   * @returns {LocalAPIClient} Default local API client instance
   */
  getDefaultLocalClient() {
    return _localApiClient.localAPIClient;
  }
}

// Create a singleton instance but don't export it directly
exports.APIFactory = APIFactory;
let _apiFactoryInstance = null;
let isInitializing = false;
let initializationPromise = null;

/**
 * Initialize the API factory with required dependencies
 * @param {Object} logger - Logger instance
 * @param {Object} settingsManager - Settings manager instance
 * @returns {Promise<APIFactory>} Initialized API factory instance
 */
const initAPIFactory = async (logger, settingsManager) => {
  // If already initialized, return the existing instance
  if (_apiFactoryInstance) {
    return _apiFactoryInstance;
  }

  // If initialization is in progress, wait for it to complete
  if (isInitializing) {
    if (initializationPromise) {
      return initializationPromise;
    }
  }

  // Set initialization flag and create a new promise
  isInitializing = true;
  initializationPromise = new Promise(async (resolve, reject) => {
    try {
      // Create the factory instance
      const factory = new APIFactory(logger, settingsManager);

      // Set the instance
      _apiFactoryInstance = factory;
      defaultAPIFactory = factory;

      // Log successful initialization
      if (logger && logger.info) {
        logger.info('API Factory initialized successfully');
      } else {
        console.log('API Factory initialized successfully');
      }
      resolve(factory);
    } catch (error) {
      const errorMsg = `Failed to initialize API Factory: ${error.message}`;
      if (logger && logger.error) {
        logger.error(errorMsg, {
          error
        });
      } else {
        console.error(errorMsg, error);
      }
      reject(new Error(errorMsg));
    } finally {
      isInitializing = false;
      initializationPromise = null;
    }
  });
  return initializationPromise;
};

// Export the singleton instance and initialization function
exports.initAPIFactory = initAPIFactory;
// For backward compatibility, export a default instance (will be initialized when initAPIFactory is called)
let defaultAPIFactory = null;
const apiFactory = exports.apiFactory = {
  getPingOneClient: () => {
    if (!defaultAPIFactory) {
      throw new Error('API Factory not initialized. Call initAPIFactory() first.');
    }
    return defaultAPIFactory.getPingOneClient();
  },
  getLocalClient: function () {
    let baseUrl = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '';
    if (!defaultAPIFactory) {
      throw new Error('API Factory not initialized. Call initAPIFactory() first.');
    }
    return defaultAPIFactory.getLocalClient(baseUrl);
  }
};

// For backward compatibility
const getAPIFactory = () => defaultAPIFactory;
exports.getAPIFactory = getAPIFactory;

},{"./local-api-client.js":8,"./pingone-client.js":11}],4:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createCircularProgress = createCircularProgress;
/**
 * Circular Progress Spinner Component
 * Usage: createCircularProgress({ value, label, state, id })
 * - value: 0-100 (percent)
 * - label: status message (optional)
 * - state: '', 'error', 'warning', 'complete' (optional)
 * - id: DOM id (optional)
 */
function createCircularProgress() {
  let {
    value = 0,
    label = '',
    state = '',
    id = ''
  } = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  const size = 80,
    stroke = 8,
    radius = (size - stroke) / 2,
    circ = 2 * Math.PI * radius;
  const percent = Math.max(0, Math.min(100, value));
  const dash = percent / 100 * circ;
  const wrapper = document.createElement('div');
  wrapper.className = `circular-progress${state ? ' ' + state : ''}`;
  if (id) wrapper.id = id;
  wrapper.setAttribute('role', 'progressbar');
  wrapper.setAttribute('aria-valuenow', percent);
  wrapper.setAttribute('aria-valuemin', 0);
  wrapper.setAttribute('aria-valuemax', 100);
  wrapper.setAttribute('aria-label', label ? `${label} ${percent}%` : `${percent}%`);
  wrapper.innerHTML = `
    <svg width="${size}" height="${size}">
      <circle class="circular-bg" cx="${size / 2}" cy="${size / 2}" r="${radius}" />
      <circle class="circular-fg" cx="${size / 2}" cy="${size / 2}" r="${radius}"
        style="stroke-dasharray: ${dash} ${circ}; stroke-dashoffset: 0;" />
    </svg>
    <span class="circular-label">${percent}%</span>
    ${label ? `<span class="circular-status">${label}</span>` : ''}
  `;
  return wrapper;
}

},{}],5:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.cryptoUtils = exports.CryptoUtils = void 0;
// File: crypto-utils.js
// Description: Cryptographic utilities for secure data handling
// 
// This module provides encryption and decryption functionality for
// sensitive data like API secrets and user credentials. Uses the
// Web Crypto API for secure cryptographic operations.
// 
// Features:
// - PBKDF2 key derivation for secure key generation
// - AES-GCM encryption for authenticated encryption
// - Base64 encoding for storage compatibility
// - Error handling for decryption failures

/**
 * Cryptographic Utilities Class
 * 
 * Provides secure encryption and decryption using the Web Crypto API.
 * Uses PBKDF2 for key derivation and AES-GCM for authenticated encryption.
 * All methods are static for easy use throughout the application.
 */
class CryptoUtils {
  /**
   * Generate a cryptographic key for encryption/decryption
   * 
   * Uses PBKDF2 key derivation to create a secure key from a password.
   * The key is suitable for AES-GCM encryption operations.
   * 
   * @param {string} password - The password to derive the key from
   * @returns {Promise<CryptoKey>} A CryptoKey object for encryption/decryption
   */
  static async generateKey(password) {
    // Convert password to key material using PBKDF2
    const encoder = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits', 'deriveKey']);

    // Derive the actual encryption key using PBKDF2
    return window.crypto.subtle.deriveKey({
      name: 'PBKDF2',
      salt: new TextEncoder().encode('PingOneImportSalt'),
      // Should be unique per user in production
      iterations: 100000,
      hash: 'SHA-256'
    }, keyMaterial, {
      name: 'AES-GCM',
      length: 256
    }, false, ['encrypt', 'decrypt']);
  }

  /**
   * Encrypt a string using AES-GCM
   * 
   * Encrypts text using AES-GCM with a random initialization vector (IV).
   * The IV is prepended to the encrypted data for secure storage.
   * Returns the result as base64-encoded string.
   * 
   * @param {string} text - The text to encrypt
   * @param {CryptoKey} key - The encryption key
   * @returns {Promise<string>} Encrypted text as base64 string
   */
  static async encrypt(text, key) {
    // Convert text to UTF-8 bytes
    const encoder = new TextEncoder();
    const data = encoder.encode(text);

    // Generate a random IV (Initialization Vector) for security
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    // Encrypt the data using AES-GCM
    const encrypted = await window.crypto.subtle.encrypt({
      name: 'AES-GCM',
      iv
    }, key, data);

    // Combine IV and encrypted data into a single array
    // IV is prepended for secure storage and retrieval
    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(encrypted), iv.length);

    // Convert to base64 for storage compatibility
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
      const decrypted = await window.crypto.subtle.decrypt({
        name: 'AES-GCM',
        iv
      }, key, data);
      return new TextDecoder().decode(decrypted);
    } catch (error) {
      // Don't log the error here - let the calling code handle it
      throw error;
    }
  }
}

// Export the class and a singleton instance
exports.CryptoUtils = CryptoUtils;
const cryptoUtils = exports.cryptoUtils = new CryptoUtils();

},{}],6:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FileHandler = void 0;
// File: file-handler.js
// Description: CSV file processing and validation for PingOne user import
// 
// This module handles all file-related operations including:
// - CSV file reading and parsing
// - User data validation and error checking
// - File preview generation
// - File information display and management
// - Folder path tracking for better UX
// - Validation summary and error reporting
// 
// Provides comprehensive CSV processing with detailed validation feedback.

/**
 * File Handler Class
 * 
 * Manages CSV file processing, validation, and user data preparation
 * for the PingOne import tool. Handles file selection, parsing,
 * validation, and preview generation.
 * 
 * @param {Object} logger - Logger instance for debugging
 * @param {Object} uiManager - UI manager for status updates
 */
class FileHandler {
  constructor(logger, uiManager) {
    this.logger = logger;
    this.uiManager = uiManager;

    // Required fields for user validation
    this.requiredFields = ['username'];

    // Validation tracking for processed files
    this.validationResults = {
      total: 0,
      valid: 0,
      errors: 0,
      warnings: 0
    };

    // File processing state
    this.lastParsedUsers = [];
    this.currentFile = null;

    // Initialize UI elements for file handling
    this.fileInput = document.getElementById('csv-file');
    this.fileInfo = document.getElementById('file-info');
    this.previewContainer = document.getElementById('preview-container');

    // Load last file info from localStorage for better UX
    this.lastFileInfo = this.loadLastFileInfo();

    // Initialize event listeners for file input
    this.initializeFileInput();
  }

  // ======================
  // File Info Management
  // ======================

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
   * Get the current file being processed
   * 
   * Returns the File object that is currently loaded and ready for processing.
   * Used by other modules to access the file for upload operations.
   * 
   * @returns {File|null} The current file or null if none is loaded
   */
  getCurrentFile() {
    return this.currentFile;
  }

  /**
   * Set a file and process it for import
   * 
   * Validates the file, processes its contents, and prepares it for
   * import operations. Updates UI with file information and validation results.
   * 
   * @param {File} file - The file to set and process
   * @returns {Promise<Object>} Promise that resolves with processing result
   */
  async setFile(file) {
    try {
      this.logger.info('Setting file', {
        fileName: file.name,
        fileSize: file.size
      });

      // Store the current file reference for later use
      this.currentFile = file;

      // Process the file using the existing internal method
      // This includes validation, parsing, and UI updates
      await this._handleFileInternal(file);
      return {
        success: true,
        file
      };
    } catch (error) {
      this.logger.error('Failed to set file', {
        error: error.message,
        fileName: file.name
      });
      throw error;
    }
  }

  /**
   * Get the list of parsed users from the current file
   * 
   * Returns the array of user objects that were successfully parsed
   * from the CSV file. Each user object contains validated data.
   * 
   * @returns {Array} Array of user objects with validated data
   */
  getUsers() {
    return this.lastParsedUsers || [];
  }

  /**
   * Get the total number of users parsed from the CSV file
   * 
   * Returns the total count of users found in the processed CSV file.
   * This count includes all rows, regardless of validation status.
   * 
   * @returns {number} Total number of users in the CSV file
   */
  getTotalUsers() {
    const totalUsers = this.validationResults.total || 0;
    console.log('[CSV] getTotalUsers() called, returning:', totalUsers, 'validationResults:', this.validationResults);
    return totalUsers;
  }

  /**
   * Read file as text using FileReader API
   * 
   * Asynchronously reads a file and returns its contents as a string.
   * Used for processing CSV files and other text-based formats.
   * 
   * @param {File} file - The file to read
   * @returns {Promise<string>} Promise that resolves with file content as string
   */
  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = event => resolve(event.target.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  /**
   * Save the last folder path that was used
   * @param {File} file - The selected file
   * @param {string} operationType - The operation type ('import', 'delete', 'modify')
   */
  saveLastFolderPath(file) {
    let operationType = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'import';
    try {
      let folderPath = null;

      // Try to extract folder path from different sources
      if (file.webkitRelativePath) {
        // For webkitRelativePath, get the directory part
        const pathParts = file.webkitRelativePath.split('/');
        if (pathParts.length > 1) {
          folderPath = pathParts.slice(0, -1).join('/');
        }
      } else if (file.name) {
        // For regular files, try to extract from the file name
        // This is a fallback since we can't get the full path due to security restrictions
        const fileName = file.name;
        const lastSlashIndex = fileName.lastIndexOf('/');
        if (lastSlashIndex !== -1) {
          folderPath = fileName.substring(0, lastSlashIndex);
        }
      }
      if (folderPath) {
        // Save with operation-specific key
        const storageKey = `lastFolderPath_${operationType}`;
        localStorage.setItem(storageKey, folderPath);
        this.logger.info(`Saved last folder path for ${operationType}:`, folderPath);
      }

      // Also save a general last folder path
      if (folderPath) {
        localStorage.setItem('lastFolderPath', folderPath);
      }
    } catch (error) {
      this.logger.warn('Could not save folder path:', error.message);
    }
  }

  /**
   * Get the last folder path that was used
   * @param {string} operationType - The operation type ('import', 'delete', 'modify')
   * @returns {string|null} The last folder path or null if not available
   */
  getLastFolderPath() {
    let operationType = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'import';
    try {
      // First try to get operation-specific folder path
      const operationKey = `lastFolderPath_${operationType}`;
      let folderPath = localStorage.getItem(operationKey);

      // Fall back to general last folder path
      if (!folderPath) {
        folderPath = localStorage.getItem('lastFolderPath');
      }
      return folderPath;
    } catch (error) {
      this.logger.warn('Could not get last folder path:', error.message);
      return null;
    }
  }

  /**
   * Update the file input label to show last folder path
   * @param {string} operationType - The operation type ('import', 'delete', 'modify')
   */
  updateFileLabel() {
    let operationType = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'import';
    try {
      // Find the appropriate file label based on operation type
      let fileLabel = null;
      let fileInput = null;
      switch (operationType) {
        case 'import':
          fileLabel = document.querySelector('label[for="csv-file"] span');
          fileInput = document.getElementById('csv-file');
          break;
        case 'delete':
          fileLabel = document.querySelector('label[for="delete-csv-file"] span');
          fileInput = document.getElementById('delete-csv-file');
          break;
        case 'modify':
          fileLabel = document.querySelector('label[for="modify-csv-file"] span');
          fileInput = document.getElementById('modify-csv-file');
          break;
        default:
          fileLabel = document.querySelector('.file-label span');
          break;
      }
      if (fileLabel) {
        const lastFolderPath = this.getLastFolderPath(operationType);
        if (lastFolderPath) {
          // Show a shortened version of the path for better UI
          const shortPath = this.shortenPath(lastFolderPath);
          fileLabel.textContent = `Choose CSV File (Last: ${shortPath})`;
          fileLabel.title = `Last used folder: ${lastFolderPath}`;
        } else {
          fileLabel.textContent = 'Choose CSV File';
          fileLabel.title = 'Select a CSV file to process';
        }
      }
    } catch (error) {
      this.logger.warn('Could not update file label:', error.message);
    }
  }

  /**
   * Shorten a file path for display in the UI
   * @param {string} path - The full path
   * @returns {string} The shortened path
   */
  shortenPath(path) {
    if (!path) return '';
    const maxLength = 30;
    if (path.length <= maxLength) {
      return path;
    }

    // Try to keep the most relevant parts
    const parts = path.split('/');
    if (parts.length <= 2) {
      return path.length > maxLength ? '...' + path.slice(-maxLength + 3) : path;
    }

    // Keep first and last parts, add ellipsis in middle
    const firstPart = parts[0];
    const lastPart = parts[parts.length - 1];
    const middleParts = parts.slice(1, -1);
    let result = firstPart;
    if (middleParts.length > 0) {
      result += '/.../' + lastPart;
    } else {
      result += '/' + lastPart;
    }
    return result.length > maxLength ? '...' + result.slice(-maxLength + 3) : result;
  }
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
  clearFileInfo() {
    try {
      localStorage.removeItem('lastSelectedFile');
      this.lastFileInfo = null;
      if (this.fileInfo) {
        this.fileInfo.innerHTML = 'No file selected';
      }
    } catch (error) {
      this.logger.error('Error clearing file info:', error);
    }
  }

  /**
   * Clear the last folder path
   */
  clearLastFolderPath() {
    try {
      localStorage.removeItem('lastFolderPath');
      this.updateFileLabel();
      this.logger.info('Cleared last folder path');
    } catch (error) {
      this.logger.warn('Could not clear last folder path:', error.message);
    }
  }

  // ======================
  // File Handling
  // ======================

  initializeFileInput() {
    if (!this.fileInput) return;

    // Remove existing event listeners
    const newFileInput = this.fileInput.cloneNode(true);
    this.fileInput.parentNode.replaceChild(newFileInput, this.fileInput);
    this.fileInput = newFileInput;

    // Add new event listener
    this.fileInput.addEventListener('change', event => this.handleFileSelect(event));

    // Update file label to show last folder path if available
    this.updateFileLabel();
  }

  /**
   * Handle a File object directly (not an event)
   * @param {File} file
   */
  async handleFileObject(file) {
    await this._handleFileInternal(file);
  }

  /**
   * Handle file selection from an input event
   * @param {Event} event
   */
  async handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) {
      this.logger.warn('No file selected');
      return;
    }

    // Save the folder path for next time
    this.saveLastFolderPath(file, 'import');
    await this._handleFileInternal(file, event);
  }

  /**
   * Shared internal file handling logic
   * @param {File} file
   * @param {Event} [event]
   * @private
   */
  async _handleFileInternal(file, event) {
    console.log('[CSV] _handleFileInternal called with file:', file.name, 'size:', file.size);
    try {
      this.logger.info('Processing file', {
        fileName: file.name,
        fileSize: file.size
      });

      // Validate file type - allow files without extensions or with any extension except known bad ones
      const fileName = file.name || '';
      const fileExt = this.getFileExtension(fileName).toLowerCase();
      const knownBadExts = ['exe', 'js', 'png', 'jpg', 'jpeg', 'gif', 'pdf', 'zip', 'tar', 'gz'];
      if (fileExt && knownBadExts.includes(fileExt)) {
        const errorMsg = `Unsupported file type: ${fileExt}. Please upload a CSV or text file.`;
        this.logger.error(errorMsg, {
          fileName,
          fileExt
        });
        throw new Error(errorMsg);
      }
      // Accept all other extensions and blank/unknown types (including files with no extension)

      // Validate file size (10MB limit)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        throw new Error('File too large. Please select a file smaller than 10MB.');
      }

      // Read file content
      const content = await this.readFileAsText(file);
      console.log('[CSV] _handleFileInternal: About to parse CSV content, length:', content.length);
      // Parse CSV with enhanced validation
      const parseResults = this.parseCSV(content);
      console.log('[CSV] _handleFileInternal: parseCSV completed, parseResults:', parseResults);

      // Store parsed users
      this.parsedUsers = parseResults.users;
      this.lastParsedUsers = [...parseResults.users];

      // Update validation results for getTotalUsers() method
      this.validationResults = {
        total: parseResults.users.length,
        valid: parseResults.validUsers || parseResults.users.length,
        errors: parseResults.errors.length,
        warnings: parseResults.warnings.length
      };

      // Add debug logging
      console.log('[CSV] File parsed successfully:', {
        totalUsers: this.validationResults.total,
        validUsers: this.validationResults.valid,
        errors: this.validationResults.errors,
        warnings: this.validationResults.warnings
      });

      // Update UI with results
      const message = `File processed: ${parseResults.validUsers} valid users, ${parseResults.invalidRows} invalid rows`;
      this.uiManager.showNotification(message, parseResults.invalidRows > 0 ? 'warning' : 'success');

      // Update UI with enhanced file info display
      this.updateFileInfoForElement(file, 'file-info');

      // Update file label to show last folder path
      this.updateFileLabel('import');

      // Log detailed errors for debugging
      if (parseResults.errors.length > 0) {
        this.logger.warn('CSV parsing errors', {
          errorCount: parseResults.errors.length,
          errors: parseResults.errors.slice(0, 10) // Log first 10 errors
        });
      }

      // Update import button state based on population selection
      if (window.app && window.app.updateImportButtonState) {
        window.app.updateImportButtonState();
      }
    } catch (error) {
      this.logger.error('Failed to process CSV file', {
        error: error.message,
        fileName: file.name
      });
      console.error('Error in _handleFileInternal:', error);
      let errorMessage = 'Failed to process CSV file. ';
      if (error.message.includes('Missing required headers')) {
        errorMessage += error.message;
      } else if (error.message.includes('Invalid file type')) {
        errorMessage += 'Please select a valid CSV file.';
      } else if (error.message.includes('File too large')) {
        errorMessage += 'Please select a smaller file (max 10MB).';
      } else {
        errorMessage += error.message;
      }
      this.uiManager.showNotification(errorMessage, 'error');

      // Clear file input
      if (event && event.target && event.target.value) {
        event.target.value = '';
      }
    }
  }

  /**
   * Process a CSV file for user import
   * 
   * Validates the file format, reads its contents, parses CSV data,
   * and prepares user objects for import. Handles file validation,
   * CSV parsing, and error reporting.
   * 
   * @param {File} file - The CSV file to process
   * @returns {Promise<Object>} Promise that resolves with parsing results
   */
  async processCSV(file) {
    // Log file object for debugging
    this.logger.log('Processing file object:', 'debug', file);

    // Validate file exists and is not empty
    if (!file) {
      this.logger.error('No file provided to processCSV');
      throw new Error('No file selected');
    }
    if (file.size === 0) {
      this.logger.error('Empty file provided', {
        fileName: file.name,
        size: file.size
      });
      throw new Error('File is empty');
    }

    // Only block known bad extensions, allow all others
    const fileName = file.name || '';
    const fileExt = this.getFileExtension(fileName).toLowerCase();
    const knownBadExts = ['exe', 'js', 'png', 'jpg', 'jpeg', 'gif', 'pdf', 'zip', 'tar', 'gz'];
    if (fileExt && knownBadExts.includes(fileExt)) {
      const errorMsg = `Unsupported file type: ${fileExt}. Please upload a CSV or text file.`;
      this.logger.error(errorMsg, {
        fileName,
        fileExt
      });
      throw new Error(errorMsg);
    }
    // Accept all other extensions and blank/unknown types
    // Check file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new Error(`File is too large. Maximum size is ${this.formatFileSize(maxSize)}`);
    }

    // Update UI
    this.saveFileInfo(file);
    this.updateFileInfo(file);

    // Store the current file reference
    this.currentFile = file;
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = event => {
        try {
          const text = event.target.result;
          if (!text || text.trim() === '') {
            throw new Error('File is empty or contains no text');
          }
          console.log('[CSV] About to parse CSV text, length:', text.length);
          const {
            headers,
            rows
          } = this.parseCSV(text);
          console.log('[CSV] parseCSV completed, headers:', headers, 'rows count:', rows.length);

          // Validate required fields
          const missingHeaders = this.requiredFields.filter(field => !headers.includes(field));
          if (missingHeaders.length > 0) {
            throw new Error(`Missing required columns: ${missingHeaders.join(', ')}`);
          }

          // Convert rows to user objects and store them
          this.lastParsedUsers = rows.map(row => {
            const user = {};
            headers.forEach((header, index) => {
              user[header] = row[header] || '';
            });
            return user;
          });

          // Also store in parsedUsers for compatibility with getParsedUsers
          this.parsedUsers = this.lastParsedUsers;

          // Update validation results for getTotalUsers() method
          this.validationResults = {
            total: this.lastParsedUsers.length,
            valid: this.lastParsedUsers.length,
            errors: 0,
            warnings: 0
          };

          // Add debug logging
          console.log('[CSV] File parsed successfully (processCSV):', {
            totalUsers: this.validationResults.total,
            validUsers: this.validationResults.valid,
            errors: this.validationResults.errors,
            warnings: this.validationResults.warnings
          });
          resolve({
            success: true,
            headers,
            rows: this.lastParsedUsers,
            userCount: this.lastParsedUsers.length
          });
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => {
        reject(new Error('Error reading file'));
      };
      reader.readAsText(file);
    });
  }

  // ======================
  // CSV Parsing Methods
  // ======================

  /**
   * Parse CSV content into headers and data rows
   * 
   * Splits CSV content into lines, extracts headers, and validates
   * required and recommended columns. Handles header mapping for
   * different naming conventions.
   * 
   * @param {string} content - Raw CSV content as string
   * @returns {Object} Object containing headers and parsed rows
   */
  parseCSV(content) {
    // Split content into lines and filter out empty lines
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error('CSV file must have at least a header row and one data row');
    }

    // Parse headers from first line
    const headers = this.parseCSVLine(lines[0]);

    // Define required and recommended headers for validation
    const requiredHeaders = ['username'];
    const recommendedHeaders = ['firstName', 'lastName', 'email'];

    // Log all headers for debugging
    console.log('[CSV] All headers:', headers);
    console.log('[CSV] Required headers:', requiredHeaders);
    console.log('[CSV] Recommended headers:', recommendedHeaders);

    // Validate headers
    const missingRequired = requiredHeaders.filter(h => {
      const hasHeader = headers.some(header => {
        const headerLower = header.toLowerCase();
        const mappedHeader = this.getHeaderMapping(headerLower);
        const matches = headerLower === h.toLowerCase() || mappedHeader === h;
        console.log(`[CSV] Checking header "${header}" (${headerLower}) -> "${mappedHeader}" for required "${h}": ${matches}`);
        return matches;
      });
      console.log(`[CSV] Required header "${h}" found: ${hasHeader}`);
      return !hasHeader;
    });
    const missingRecommended = recommendedHeaders.filter(h => {
      const hasHeader = headers.some(header => {
        const headerLower = header.toLowerCase();
        const mappedHeader = this.getHeaderMapping(headerLower);
        const matches = headerLower === h.toLowerCase() || mappedHeader === h;
        console.log(`[CSV] Checking header "${header}" (${headerLower}) -> "${mappedHeader}" for recommended "${h}": ${matches}`);
        return matches;
      });
      console.log(`[CSV] Recommended header "${h}" found: ${hasHeader}`);
      return !hasHeader;
    });
    if (missingRequired.length > 0) {
      const errorMsg = `Missing required headers: ${missingRequired.join(', ')}. At minimum, you need a 'username' column.`;
      this.logger.error('CSV validation failed - missing required headers', {
        missingRequired,
        availableHeaders: headers,
        errorMsg
      });
      throw new Error(errorMsg);
    }
    if (missingRecommended.length > 0) {
      const warningMsg = `Missing recommended headers: ${missingRecommended.join(', ')}. These are not required but recommended for better user data.`;
      this.logger.warn('CSV validation warning - missing recommended headers', {
        missingRecommended,
        availableHeaders: headers,
        warningMsg
      });
      // Show warning but don't throw error
      if (window.app && window.app.uiManager) {
        window.app.uiManager.showNotification(warningMsg, 'warning');
      }
    }
    const users = [];
    const errors = [];
    const warnings = [];
    let rowNumber = 1; // Start from 1 since 0 is header

    for (let i = 1; i < lines.length; i++) {
      rowNumber = i + 1; // +1 because we start from header row
      const line = lines[i].trim();
      if (!line) continue; // Skip empty lines

      try {
        const user = this.parseUserRow(line, headers, rowNumber);

        // Validate user data
        const validationResult = this.validateUserData(user, rowNumber);
        if (validationResult.isValid) {
          users.push(user);
        } else {
          errors.push({
            row: rowNumber,
            user: user,
            errors: validationResult.errors,
            warnings: validationResult.warnings
          });

          // Add warnings to warnings array
          warnings.push(...validationResult.warnings.map(w => ({
            row: rowNumber,
            ...w
          })));
        }
      } catch (error) {
        errors.push({
          row: rowNumber,
          error: error.message,
          line: line
        });
      }
    }

    // Log comprehensive validation results
    const validationSummary = {
      totalRows: lines.length - 1,
      validUsers: users.length,
      invalidRows: errors.length,
      warnings: warnings.length,
      missingRequiredHeaders: missingRequired,
      missingRecommendedHeaders: missingRecommended,
      availableHeaders: headers
    };
    this.logger.info('CSV parsing completed', validationSummary);
    if (errors.length > 0) {
      const errorDetails = errors.map(e => ({
        row: e.row,
        errors: e.errors || [e.error],
        warnings: e.warnings || []
      }));
      this.logger.warn('CSV validation issues found', {
        totalErrors: errors.length,
        errorDetails: errorDetails.slice(0, 10) // Log first 10 errors
      });
    }

    // Show user-friendly summary
    this.showValidationSummary(validationSummary, errors, warnings);
    return {
      users,
      errors,
      warnings,
      totalRows: lines.length - 1,
      validUsers: users.length,
      invalidRows: errors.length,
      headerCount: headers.length,
      availableHeaders: headers
    };
  }

  /**
   * Parse a single CSV line
   * @param {string} line - CSV line to parse
   * @param {string} delimiter - Delimiter character
   * @returns {Array<string>} Array of field values
   */
  parseCSVLine(line) {
    let delimiter = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : ',';
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

  /**
   * Parse a user row from CSV
   * @param {string} line - CSV line to parse
   * @param {Array<string>} headers - Header row
   * @param {number} rowNumber - Row number for error reporting
   * @returns {Object} Parsed user object
   */
  parseUserRow(line, headers, rowNumber) {
    const values = this.parseCSVLine(line);
    if (values.length !== headers.length) {
      throw new Error(`Row ${rowNumber}: Number of columns (${values.length}) doesn't match headers (${headers.length})`);
    }
    const user = {};
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i].toLowerCase().trim();
      let value = values[i].trim();

      // Handle boolean values
      if (header === 'enabled') {
        const valueLower = value.toLowerCase();
        if (valueLower === 'true' || value === '1') {
          value = true;
        } else if (valueLower === 'false' || value === '0') {
          value = false;
        } else if (value === '') {
          value = true; // Default to enabled
        } else {
          throw new Error(`Row ${rowNumber}: Invalid enabled value '${value}'. Must be true/false or 1/0`);
        }
      }

      // Map common header variations
      const mappedHeader = this.getHeaderMapping(header);
      console.log(`[CSV] Mapping header: "${header}" -> "${mappedHeader}"`);
      user[mappedHeader] = value;
    }

    // Set default username if not provided
    if (!user.username && user.email) {
      user.username = user.email;
    }
    return user;
  }

  /**
   * Validate user data for a specific row
   * @param {Object} user - User object to validate
   * @param {number} rowNumber - Row number for error reporting
   * @returns {Object} Validation result with isValid, errors, and warnings
   */
  validateUserData(user, rowNumber) {
    const errors = [];
    const warnings = [];

    // Check required fields
    if (!user.username || user.username.trim() === '') {
      errors.push('Username is required and cannot be empty');
    }

    // Check recommended fields
    if (!user.firstName || user.firstName.trim() === '') {
      warnings.push('firstName is recommended for better user data');
    }
    if (!user.lastName || user.lastName.trim() === '') {
      warnings.push('lastName is recommended for better user data');
    }
    if (!user.email || user.email.trim() === '') {
      warnings.push('email is recommended for better user data');
    }

    // Validate email format if provided
    if (user.email && user.email.trim() !== '' && !this.isValidEmail(user.email)) {
      errors.push('Invalid email format');
    }

    // Validate username format if provided
    if (user.username && !this.isValidUsername(user.username)) {
      errors.push('Username contains invalid characters (no spaces or special characters allowed)');
    }
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Show validation summary to user
   * @param {Object} summary - Validation summary
   * @param {Array} errors - Array of errors
   * @param {Array} warnings - Array of warnings
   */
  showValidationSummary(summary, errors, warnings) {
    let message = '';
    let type = 'success';
    if (summary.invalidRows > 0) {
      type = 'error';
      message = `File validation failed!\n\n`;
      message += `• Total rows: ${summary.totalRows}\n`;
      message += `• Valid users: ${summary.validUsers}\n`;
      message += `• Invalid rows: ${summary.invalidRows}\n`;
      message += `• Warnings: ${warnings.length}\n\n`;
      if (summary.missingRequiredHeaders.length > 0) {
        message += `❌ Missing required headers: ${summary.missingRequiredHeaders.join(', ')}\n`;
      }
      if (errors.length > 0) {
        message += `❌ Data errors found in ${errors.length} row(s)\n`;
        // Show first few specific errors
        const firstErrors = errors.slice(0, 3);
        firstErrors.forEach(error => {
          if (error.errors) {
            message += `  Row ${error.row}: ${error.errors.join(', ')}\n`;
          } else if (error.error) {
            message += `  Row ${error.row}: ${error.error}\n`;
          }
        });
        if (errors.length > 3) {
          message += `  ... and ${errors.length - 3} more errors\n`;
        }
      }
    } else if (warnings.length > 0) {
      type = 'warning';
      message = `File loaded with warnings:\n\n`;
      message += `• Total rows: ${summary.totalRows}\n`;
      message += `• Valid users: ${summary.validUsers}\n`;
      message += `• Warnings: ${warnings.length}\n\n`;
      if (summary.missingRecommendedHeaders.length > 0) {
        message += `⚠️ Missing recommended headers: ${summary.missingRecommendedHeaders.join(', ')}\n`;
      }

      // Show first few warnings
      const firstWarnings = warnings.slice(0, 3);
      firstWarnings.forEach(warning => {
        message += `  Row ${warning.row}: ${warning.message || warning}\n`;
      });
      if (warnings.length > 3) {
        message += `  ... and ${warnings.length - 3} more warnings\n`;
      }
    } else {
      message = `File loaded successfully!\n\n`;
      message += `• Total rows: ${summary.totalRows}\n`;
      message += `• Valid users: ${summary.validUsers}\n`;
      message += `• Headers found: ${summary.availableHeaders.join(', ')}`;
    }

    // Show notification to user
    if (window.app && window.app.uiManager) {
      window.app.uiManager.showNotification(message, type);
    }

    // Log to server
    this.logger.info('CSV validation summary shown to user', {
      summary,
      message,
      type
    });
  }

  /**
   * Get header mapping for common variations
   * @param {string} header - Header to map
   * @returns {string} Mapped header name
   */
  getHeaderMapping(header) {
    const headerMap = {
      'firstname': 'firstName',
      'first_name': 'firstName',
      'givenname': 'firstName',
      'given_name': 'firstName',
      'lastname': 'lastName',
      'last_name': 'lastName',
      'familyname': 'lastName',
      'family_name': 'lastName',
      'surname': 'lastName',
      'emailaddress': 'email',
      'email_address': 'email',
      'userid': 'username',
      'user_id': 'username',
      'login': 'username',
      'user': 'username',
      'populationid': 'populationId',
      'population_id': 'populationId',
      'popid': 'populationId',
      'pop_id': 'populationId'
    };
    return headerMap[header] || header;
  }

  /**
   * Check if email is valid
   * @param {string} email - Email to validate
   * @returns {boolean} True if valid
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Check if username is valid
   * @param {string} username - Username to validate
   * @returns {boolean} True if valid
   */
  isValidUsername(username) {
    // Username should not contain spaces or special characters
    const usernameRegex = /^[a-zA-Z0-9._-]+$/;
    return usernameRegex.test(username);
  }

  // ======================
  // UI Updates
  // ======================

  /**
   * Update file info for any file info container element
   * @param {File} file - The file object
   * @param {string} containerId - The ID of the container element to update
   */
  updateFileInfoForElement(file, containerId) {
    const container = document.getElementById(containerId);
    console.log('updateFileInfoForElement called:', {
      containerId,
      container: !!container,
      file: !!file
    });
    if (!container || !file) {
      console.warn('updateFileInfoForElement: container or file is null', {
        containerId,
        hasContainer: !!container,
        hasFile: !!file
      });
      return;
    }
    const fileSize = this.formatFileSize(file.size);
    const lastModified = new Date(file.lastModified).toLocaleString();
    const fileType = file.type || this.getFileExtension(file.name);
    const fileExtension = this.getFileExtension(file.name);

    // Get file path information (if available)
    let filePath = 'Unknown';
    if (file.webkitRelativePath) {
      filePath = file.webkitRelativePath;
    } else if (file.name) {
      // Try to extract directory from file name if it contains path separators
      const pathParts = file.name.split(/[\/\\]/);
      if (pathParts.length > 1) {
        filePath = pathParts.slice(0, -1).join('/');
      } else {
        filePath = 'Current Directory';
      }
    }

    // Calculate additional file properties
    const isCSV = fileExtension === 'csv';
    const isText = fileExtension === 'txt';
    const isValidType = isCSV || isText || fileType === 'text/csv' || fileType === 'text/plain';
    const fileSizeInKB = Math.round(file.size / 1024);
    const fileSizeInMB = Math.round(file.size / 1024 / 1024 * 100) / 100;

    // Create comprehensive file info display
    const fileInfoHTML = `
            <div class="file-info-details" style="background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 5px; padding: 15px; margin: 10px 0;">
                <div class="file-info-header" style="margin-bottom: 10px;">
                    <h5 style="margin: 0; color: #495057;">
                        <i class="fas fa-file-csv"></i> File Information
                    </h5>
                </div>
                
                <div class="file-info-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.9em;">
                    <div class="file-info-item">
                        <strong style="color: #495057;">📁 Filename:</strong><br>
                        <span style="color: #6c757d; word-break: break-all;">${file.name}</span>
                    </div>
                    
                    <div class="file-info-item">
                        <strong style="color: #495057;">📊 File Size:</strong><br>
                        <span style="color: #6c757d;">${fileSize} (${fileSizeInKB} KB, ${fileSizeInMB} MB)</span>
                    </div>
                    
                    <div class="file-info-item">
                        <strong style="color: #495057;">📂 Directory:</strong><br>
                        <span style="color: #6c757d;">${filePath}</span>
                    </div>
                    
                    <div class="file-info-item">
                        <strong style="color: #495057;">📅 Last Modified:</strong><br>
                        <span style="color: #6c757d;">${lastModified}</span>
                    </div>
                    
                    <div class="file-info-item">
                        <strong style="color: #495057;">🔤 File Type:</strong><br>
                        <span style="color: #6c757d;">${fileType || 'Unknown'}</span>
                    </div>
                    
                    <div class="file-info-item">
                        <strong style="color: #495057;">📄 Extension:</strong><br>
                        <span style="color: ${isValidType ? '#28a745' : '#dc3545'}; font-weight: bold;">
                            ${fileExtension ? '.' + fileExtension : 'None'}
                        </span>
                    </div>
                </div>
                
                <div class="file-info-status" style="margin-top: 10px; padding: 8px; border-radius: 3px; background: ${isValidType ? '#d4edda' : '#f8d7da'}; border: 1px solid ${isValidType ? '#c3e6cb' : '#f5c6cb'};">
                    <i class="fas ${isValidType ? 'fa-check-circle' : 'fa-exclamation-triangle'}" style="color: ${isValidType ? '#155724' : '#721c24'};"></i>
                    <span style="color: ${isValidType ? '#155724' : '#721c24'}; font-weight: bold;">
                        ${isValidType ? 'File type is supported' : 'Warning: File type may not be optimal'}
                    </span>
                </div>
                
                ${file.size > 5 * 1024 * 1024 ? `
                <div class="file-info-warning" style="margin-top: 10px; padding: 8px; border-radius: 3px; background: #fff3cd; border: 1px solid #ffeaa7;">
                    <i class="fas fa-exclamation-triangle" style="color: #856404;"></i>
                    <span style="color: #856404; font-weight: bold;">Large file detected - processing may take longer</span>
                </div>
                ` : ''}
            </div>
        `;
    container.innerHTML = fileInfoHTML;
  }
  updateFileInfo(file) {
    this.updateFileInfoForElement(file, 'file-info');
  }
  showPreview(rows) {
    if (!this.previewContainer) return;
    if (!rows || rows.length === 0) {
      this.previewContainer.innerHTML = '<div class="alert alert-info">No data to display</div>';
      // Disable import button if no rows
      const importBtnBottom = document.getElementById('start-import-btn-bottom');
      if (importBtnBottom) {
        importBtnBottom.disabled = true;
      }
      return;
    }
    const headers = Object.keys(rows[0]);
    const previewRows = rows.slice(0, 5); // Show first 5 rows

    let html = `
            <div class="table-responsive">
                <table class="table table-sm table-striped">
                    <thead>
                        <tr>
                            ${headers.map(h => `<th>${h}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${previewRows.map(row => `
                            <tr>
                                ${headers.map(h => `<td>${row[h] || ''}</td>`).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ${rows.length > 5 ? `<small class="text-muted">Showing 5 of ${rows.length} rows</small>` : ''}
            </div>
        `;
    this.previewContainer.innerHTML = html;

    // Check if population choice has been made
    const hasPopulationChoice = this.checkPopulationChoice();

    // Enable import button after showing preview (only if population choice is made)
    const importBtnBottom = document.getElementById('start-import-btn-bottom');
    if (importBtnBottom) {
      importBtnBottom.disabled = !hasPopulationChoice;
      this.logger.log(`Import button ${hasPopulationChoice ? 'enabled' : 'disabled'}`, 'debug');
    } else {
      this.logger.warn('Could not find import button to enable', 'warn');
    }
  }

  /**
   * Check if user has made a population choice
   * @returns {boolean} True if a population choice has been made
   */
  checkPopulationChoice() {
    const selectedPopulationId = document.getElementById('import-population-select')?.value || '';
    const useDefaultPopulation = document.getElementById('use-default-population')?.checked || false;
    const useCsvPopulationId = document.getElementById('use-csv-population-id')?.checked || false;
    const hasSelectedPopulation = selectedPopulationId && selectedPopulationId.trim() !== '';
    return hasSelectedPopulation || useDefaultPopulation || useCsvPopulationId;
  }

  // ======================
  // Utility Methods
  // ======================

  getFileExtension(filename) {
    if (!filename || typeof filename !== 'string') return '';

    // Handle cases where filename might be a path
    const lastDot = filename.lastIndexOf('.');
    const lastSlash = Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\'));

    // If there's no dot, or the dot is before the last slash, return empty string
    if (lastDot === -1 || lastSlash > lastDot) return '';

    // Extract and return the extension (without the dot)
    return filename.slice(lastDot + 1).toLowerCase().trim();
  }
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
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

    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * Get parsed users for import
   * @returns {Array<Object>} Array of validated user objects
   */
  getParsedUsers() {
    this.logger.info('getParsedUsers called', {
      hasParsedUsers: !!this.parsedUsers,
      parsedUsersType: typeof this.parsedUsers,
      parsedUsersLength: this.parsedUsers ? this.parsedUsers.length : 0,
      hasLastParsedUsers: !!this.lastParsedUsers,
      lastParsedUsersType: typeof this.lastParsedUsers,
      lastParsedUsersLength: this.lastParsedUsers ? this.lastParsedUsers.length : 0
    });
    if (!this.parsedUsers || !Array.isArray(this.parsedUsers)) {
      this.logger.warn('No parsed users available');
      return [];
    }
    this.logger.info('Retrieving parsed users for import', {
      userCount: this.parsedUsers.length,
      hasUsers: this.parsedUsers.length > 0
    });
    return this.parsedUsers;
  }

  /**
   * Get parsing results for debugging
   * @returns {Object|null} Parsing results or null if not available
   */
  getParseResults() {
    return this.parseResults || null;
  }
}
exports.FileHandler = FileHandler;

},{}],7:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FileLogger = void 0;
/**
 * FileLogger - Handles writing logs to a client.log file using the File System Access API
 */
class FileLogger {
  /**
   * Create a new FileLogger instance
   * @param {string} filename - Name of the log file (default: 'client.log')
   */
  constructor() {
    let filename = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'client.log';
    this.filename = filename;
    this.fileHandle = null;
    this.writableStream = null;
    this.initialized = false;
    this.logQueue = [];
    this.initializationPromise = null;
  }

  /**
   * Initialize the file logger
   * @private
   */
  async _initialize() {
    if (this.initialized) return true;
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    this.initializationPromise = (async () => {
      try {
        // Check if we're in a secure context and the API is available
        if (!window.isSecureContext || !window.showSaveFilePicker) {
          throw new Error('File System Access API not available in this context');
        }

        // Only proceed if we're handling a user gesture
        if (!window.__fileLoggerUserGesture) {
          // Set up event listeners
          window.addEventListener('online', () => this.handleOnline());
          window.addEventListener('offline', () => this.handleOffline());

          // Set up user gesture detection for file logger
          const handleUserGesture = () => {
            window.__fileLoggerUserGesture = true;
            window.removeEventListener('click', handleUserGesture);
            window.removeEventListener('keydown', handleUserGesture);

            // Try to initialize the file logger if it hasn't been initialized yet
            if (this.fileLogger && !this.fileLogger._initialized && this.fileLogger._logger === null) {
              this.fileLogger._ensureInitialized().catch(console.warn);
            }
          };
          window.addEventListener('click', handleUserGesture, {
            once: true,
            passive: true
          });
          window.addEventListener('keydown', handleUserGesture, {
            once: true,
            passive: true
          });
          throw new Error('Waiting for user gesture to initialize file logger');
        }
        try {
          this.fileHandle = await window.showSaveFilePicker({
            suggestedName: this.filename,
            types: [{
              description: 'Log File',
              accept: {
                'text/plain': ['.log']
              }
            }],
            excludeAcceptAllOption: true
          });
          this.writableStream = await this.fileHandle.createWritable({
            keepExistingData: true
          });
          this.initialized = true;
          await this._processQueue();
          return true;
        } catch (error) {
          console.warn('File System Access API not available:', error);
          this.initialized = false;
          return false;
        }
      } catch (error) {
        console.warn('File logger initialization deferred:', error.message);
        this.initialized = false;
        return false;
      }
    })();
    return this.initializationPromise;
  }

  /**
   * Process any queued log messages
   * @private
   */
  async _processQueue() {
    if (this.logQueue.length === 0) return;
    const queue = [...this.logQueue];
    this.logQueue = [];
    for (const {
      level,
      message,
      timestamp
    } of queue) {
      await this._writeLog(level, message, timestamp);
    }
  }

  /**
   * Write a log message to the file
   * @private
   */
  async _writeLog(level, message, timestamp) {
    if (!this.initialized) {
      await this._initialize();
    }
    const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
    if (this.writableStream) {
      try {
        await this.writableStream.write(logEntry);
      } catch (error) {
        console.error('Error writing to log file:', error);
        this.initialized = false;
        await this._initialize();
        await this.writableStream.write(logEntry);
      }
    } else {
      console[level](`[FileLogger] ${logEntry}`);
    }
  }

  /**
   * Log a message
   * @param {string} level - Log level (info, warn, error, debug)
   * @param {string} message - The message to log
   */
  async log(level, message) {
    const timestamp = new Date().toISOString();
    if (!this.initialized) {
      this.logQueue.push({
        level,
        message,
        timestamp
      });
      await this._initialize();
    } else {
      await this._writeLog(level, message, timestamp);
    }
  }

  /**
   * Log an info message
   * @param {string} message - The message to log
   */
  info(message) {
    return this.log('info', message);
  }

  /**
   * Log a warning message
   * @param {string} message - The message to log
   */
  warn(message) {
    return this.log('warn', message);
  }

  /**
   * Log an error message
   * @param {string} message - The message to log
   */
  error(message) {
    return this.log('error', message);
  }

  /**
   * Log a debug message
   * @param {string} message - The message to log
   */
  debug(message) {
    return this.log('debug', message);
  }

  /**
   * Close the log file
   */
  async close() {
    if (this.writableStream) {
      try {
        await this.writableStream.close();
      } catch (error) {
        console.error('Error closing log file:', error);
      } finally {
        this.initialized = false;
        this.writableStream = null;
        this.fileHandle = null;
      }
    }
  }
}
exports.FileLogger = FileLogger;

},{}],8:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.localAPIClient = exports.LocalAPIClient = void 0;
/**
 * Local API Client
 * Handles all API calls to the local server (localhost:4000)
 */

class LocalAPIClient {
  /**
   * Create a new LocalAPIClient instance
   * @param {Object} logger - Logger instance
   * @param {string} [baseUrl=''] - Base URL for the API (defaults to relative path)
   */
  constructor(logger) {
    let baseUrl = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';
    this.logger = logger || console;
    this.baseUrl = baseUrl;
  }

  /**
   * Make an API request to the local server
   * @param {string} method - HTTP method (GET, POST, PUT, DELETE, etc.)
   * @param {string} endpoint - API endpoint (without base URL)
   * @param {Object} [data] - Request body (for POST/PUT/PATCH)
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Response data
   */
  async request(method, endpoint) {
    let data = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;
    let options = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};
    const url = `${this.baseUrl}${endpoint}`;
    const startTime = Date.now();

    // Enhanced options with retry logic
    const requestOptions = {
      ...options,
      retries: options.retries || 3,
      retryDelay: options.retryDelay || 1000 // 1 second base delay
    };

    // Prepare headers
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    // Add authorization if available
    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    // Prepare request body
    let body = null;
    if (data && method !== 'GET') {
      body = JSON.stringify(data);
    }

    // Log the request with minimal details to avoid rate limiting
    const requestLog = {
      type: 'api_request',
      method,
      url,
      timestamp: new Date().toISOString(),
      source: 'local-api-client'
    };
    this.logger.debug('🔄 Local API Request:', requestLog);

    // Retry logic
    let lastError = null;
    for (let attempt = 1; attempt <= requestOptions.retries; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers,
          body
        });
        const responseData = await this._handleResponse(response);

        // Log successful response with minimal details
        const responseLog = {
          type: 'api_response',
          status: response.status,
          method,
          duration: Date.now() - startTime,
          attempt: attempt,
          source: 'local-api-client'
        };
        this.logger.debug('✅ Local API Response:', responseLog);
        return responseData;
      } catch (error) {
        lastError = error;
        this.logger.error(`Local API Error (attempt ${attempt}/${requestOptions.retries}):`, error);

        // Get the friendly error message if available
        const friendlyMessage = error.friendlyMessage || error.message;
        const isRateLimit = error.status === 429;

        // Calculate baseDelay and delay here, before using them
        const baseDelay = isRateLimit ? requestOptions.retryDelay * 2 : requestOptions.retryDelay;
        const delay = baseDelay * Math.pow(2, attempt - 1);

        // Show appropriate UI messages based on error type
        if (window.app && window.app.uiManager) {
          if (isRateLimit) {
            if (attempt < requestOptions.retries) {
              // Use enhanced rate limit warning with retry information
              window.app.uiManager.showRateLimitWarning(friendlyMessage, {
                isRetrying: true,
                retryAttempt: attempt,
                maxRetries: requestOptions.retries,
                retryDelay: delay
              });
            } else {
              window.app.uiManager.showError(friendlyMessage);
            }
          } else if (attempt === requestOptions.retries) {
            // For other errors, show friendly message on final attempt
            window.app.uiManager.showError(friendlyMessage);
          }
        }

        // If this is the last attempt, throw with friendly message
        if (attempt === requestOptions.retries) {
          throw error;
        }

        // Only retry for rate limits (429) and server errors (5xx)
        const shouldRetry = isRateLimit || error.status >= 500 || !error.status;
        if (!shouldRetry) {
          // Don't retry for client errors (4xx except 429), throw immediately
          throw error;
        }

        // Use the delay calculated above
        this.logger.info(`Retrying request in ${delay}ms... (attempt ${attempt + 1}/${requestOptions.retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // If all retries fail, throw the last error
    throw lastError;
  }

  /**
   * Handle API response
   * @private
   */
  async _handleResponse(response) {
    const contentType = response.headers.get('content-type');
    let data;
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }
    if (!response.ok) {
      let errorMessage;

      // Provide user-friendly error messages based on status code
      switch (response.status) {
        case 400:
          errorMessage = this._getBadRequestMessage(data, response.url);
          break;
        case 401:
          errorMessage = this._getUnauthorizedMessage();
          break;
        case 403:
          errorMessage = this._getForbiddenMessage(data, response.url);
          break;
        case 404:
          errorMessage = this._getNotFoundMessage(data, response.url);
          break;
        case 429:
          errorMessage = this._getRateLimitMessage();
          break;
        case 500:
        case 501:
        case 502:
        case 503:
        case 504:
          errorMessage = this._getServerErrorMessage(response.status);
          break;
        default:
          errorMessage = data.message || `Request failed with status ${response.status}`;
      }
      const error = new Error(errorMessage);
      error.status = response.status;
      error.details = data;
      error.friendlyMessage = errorMessage;
      throw error;
    }
    return data;
  }

  /**
   * Get user-friendly error message for 400 Bad Request errors
   * @private
   */
  _getBadRequestMessage(data, url) {
    // Check if it's an import endpoint error
    if (url.includes('/import')) {
      if (data && data.error) {
        // Return the specific error message from the server
        return data.error;
      }
      if (data && data.message) {
        return data.message;
      }
      return '🔍 Import failed. Please check your CSV file and settings.';
    }

    // Check if it's a user modification endpoint
    if (url.includes('/users/') && url.includes('PUT')) {
      return '🔍 User data validation failed. Please check the user information and try again.';
    }

    // Check if it's a user creation endpoint
    if (url.includes('/users') && url.includes('POST')) {
      return '🔍 User creation failed due to invalid data. Please check required fields and try again.';
    }

    // Check if it's a population-related error
    if (url.includes('/populations')) {
      return '🔍 Population data is invalid. Please check your population settings.';
    }

    // Generic 400 error
    return '🔍 Request data is invalid. Please check your input and try again.';
  }

  /**
   * Get user-friendly error message for 401 Unauthorized errors
   * @private
   */
  _getUnauthorizedMessage() {
    return '🔑 Authentication failed. Please check your PingOne credentials and try again.';
  }

  /**
   * Get user-friendly error message for 403 Forbidden errors
   * @private
   */
  _getForbiddenMessage(data, url) {
    // Check if it's a user modification endpoint
    if (url.includes('/users/') && url.includes('PUT')) {
      return '🚫 Permission denied. Your PingOne application may not have permission to modify users.';
    }

    // Check if it's a user creation endpoint
    if (url.includes('/users') && url.includes('POST')) {
      return '🚫 Permission denied. Your PingOne application may not have permission to create users.';
    }

    // Check if it's a user deletion endpoint
    if (url.includes('/users/') && url.includes('DELETE')) {
      return '🚫 Permission denied. Your PingOne application may not have permission to delete users.';
    }

    // Generic 403 error
    return '🚫 Access denied. Your PingOne application may not have the required permissions for this operation.';
  }

  /**
   * Get user-friendly error message for 404 Not Found errors
   * @private
   */
  _getNotFoundMessage(data, url) {
    // Check if it's a user-related endpoint
    if (url.includes('/users/')) {
      return '🔍 User not found. The user may have been deleted or the ID is incorrect.';
    }

    // Check if it's a population-related endpoint
    if (url.includes('/populations')) {
      return '🔍 Population not found. Please check your population settings.';
    }

    // Check if it's an environment-related endpoint
    if (url.includes('/environments/')) {
      return '🔍 PingOne environment not found. Please check your environment ID.';
    }

    // Generic 404 error
    return '🔍 Resource not found. Please check the ID or settings and try again.';
  }

  /**
   * Get user-friendly error message for 429 Too Many Requests errors
   * @private
   */
  _getRateLimitMessage() {
    return '⏰ You are sending requests too quickly. Please wait a moment and try again.';
  }

  /**
   * Get user-friendly error message for 500+ server errors
   * @private
   */
  _getServerErrorMessage(status) {
    if (status >= 500) {
      return '🔧 PingOne service is experiencing issues. Please try again in a few minutes.';
    }
    return '🔧 An unexpected error occurred. Please try again.';
  }

  // Convenience methods for common HTTP methods
  get(endpoint) {
    let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    return this.request('GET', endpoint, null, options);
  }
  post(endpoint, data) {
    let options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
    return this.request('POST', endpoint, data, options);
  }

  /**
   * Send a POST request with FormData (for file uploads)
   * @param {string} endpoint - API endpoint
   * @param {FormData} formData - FormData object
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Response data
   */
  async postFormData(endpoint, formData) {
    let options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
    const url = `${this.baseUrl}${endpoint}`;
    const startTime = Date.now();

    // Enhanced options with retry logic
    const requestOptions = {
      ...options,
      retries: options.retries || 3,
      retryDelay: options.retryDelay || 1000 // 1 second base delay
    };

    // Prepare headers for FormData (don't set Content-Type, let browser set it with boundary)
    const headers = {
      'Accept': 'application/json'
    };

    // Add authorization if available
    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    // Log the request with minimal details to avoid rate limiting
    const requestLog = {
      type: 'api_request',
      method: 'POST',
      url,
      timestamp: new Date().toISOString(),
      source: 'local-api-client',
      contentType: 'multipart/form-data'
    };
    this.logger.debug('🔄 Local API FormData Request:', requestLog);

    // Retry logic
    let lastError = null;
    for (let attempt = 1; attempt <= requestOptions.retries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: formData
        });
        const responseData = await this._handleResponse(response);

        // Log successful response with minimal details
        const responseLog = {
          type: 'api_response',
          status: response.status,
          method: 'POST',
          duration: Date.now() - startTime,
          attempt: attempt,
          source: 'local-api-client'
        };
        this.logger.debug('✅ Local API FormData Response:', responseLog);
        return responseData;
      } catch (error) {
        lastError = error;
        this.logger.error(`Local API FormData Error (attempt ${attempt}/${requestOptions.retries}):`, error);

        // Get the friendly error message if available
        const friendlyMessage = error.friendlyMessage || error.message;
        const isRateLimit = error.status === 429;

        // Calculate baseDelay and delay here, before using them
        const baseDelay = isRateLimit ? requestOptions.retryDelay * 2 : requestOptions.retryDelay;
        const delay = baseDelay * Math.pow(2, attempt - 1);

        // Show appropriate UI messages based on error type
        if (window.app && window.app.uiManager) {
          if (isRateLimit) {
            if (attempt < requestOptions.retries) {
              // Use enhanced rate limit warning with retry information
              window.app.uiManager.showRateLimitWarning(friendlyMessage, {
                isRetrying: true,
                retryAttempt: attempt,
                maxRetries: requestOptions.retries,
                retryDelay: delay
              });
            } else {
              window.app.uiManager.showError(friendlyMessage);
            }
          } else if (attempt === requestOptions.retries) {
            // For other errors, show friendly message on final attempt
            window.app.uiManager.showError(friendlyMessage);
          }
        }

        // If this is the last attempt, throw with friendly message
        if (attempt === requestOptions.retries) {
          throw error;
        }

        // Only retry for rate limits (429) and server errors (5xx)
        const shouldRetry = isRateLimit || error.status >= 500 || !error.status;
        if (!shouldRetry) {
          // Don't retry for client errors (4xx except 429), throw immediately
          throw error;
        }

        // Use the delay calculated above
        this.logger.info(`Retrying FormData request in ${delay}ms... (attempt ${attempt + 1}/${requestOptions.retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // If all retries fail, throw the last error
    throw lastError;
  }
  put(endpoint, data) {
    let options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
    return this.request('PUT', endpoint, data, options);
  }
  delete(endpoint) {
    let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    return this.request('DELETE', endpoint, null, options);
  }
}

// Export a singleton instance
exports.LocalAPIClient = LocalAPIClient;
const localAPIClient = exports.localAPIClient = new LocalAPIClient(console);

},{}],9:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.localAPI = void 0;
/**
 * Local API Client
 * Handles all API calls to the local server (localhost:4000)
 */

class LocalAPI {
  /**
   * Create a new LocalAPI instance
   * @param {Object} logger - Logger instance
   */
  constructor(logger) {
    this.logger = logger || console;
    this.baseUrl = ''; // Relative URL for same-origin requests
  }

  /**
   * Make an authenticated API request to the local server
   * @param {string} method - HTTP method (GET, POST, PUT, DELETE, etc.)
   * @param {string} endpoint - API endpoint (without base URL)
   * @param {Object} [data] - Request body (for POST/PUT/PATCH)
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Response data
   */
  async request(method, endpoint) {
    let data = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;
    let options = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};
    const url = `${this.baseUrl}${endpoint}`;

    // Prepare headers
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers
    };

    // Log the request
    this.logger.debug('Local API Request:', {
      method,
      url,
      headers: {
        ...headers,
        'Authorization': headers.Authorization ? '***REDACTED***' : 'Not set'
      },
      data
    });
    try {
      const response = await fetch(url, {
        method,
        headers,
        credentials: 'include',
        // Include cookies for session management
        body: data ? JSON.stringify(data) : undefined
      });
      const responseData = await this._handleResponse(response);

      // Log successful response
      this.logger.debug('Local API Response:', {
        status: response.status,
        url,
        data: responseData
      });
      return responseData;
    } catch (error) {
      this.logger.error('Local API Error:', error);
      throw error;
    }
  }

  /**
   * Handle API response
   * @private
   */
  async _handleResponse(response) {
    const contentType = response.headers.get('content-type');
    let data;
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }
    if (!response.ok) {
      const error = new Error(data.message || 'API request failed');
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  // Convenience methods for common HTTP methods
  get(endpoint) {
    let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    return this.request('GET', endpoint, null, options);
  }
  post(endpoint, data) {
    let options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
    return this.request('POST', endpoint, data, options);
  }
  put(endpoint, data) {
    let options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
    return this.request('PUT', endpoint, data, options);
  }
  delete(endpoint) {
    let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    return this.request('DELETE', endpoint, null, options);
  }
}

// Export a singleton instance
const localAPI = exports.localAPI = new LocalAPI(console);

},{}],10:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Logger = void 0;
var _fileLogger = require("./file-logger.js");
// File: logger.js
// Description: Centralized logging system for PingOne user import tool
// 
// This module provides comprehensive logging functionality including:
// - Console logging with different levels (debug, info, warn, error)
// - File logging with automatic rotation and cleanup
// - UI logging with real-time updates
// - Offline log queuing and synchronization
// - Server-side log integration
// 
// Supports both browser and server environments with appropriate fallbacks.

/**
 * Logger Class
 * 
 * Provides centralized logging functionality with support for multiple outputs:
 * console, file, UI, and server. Handles log levels, formatting, and
 * offline/online state management.
 * 
 * @param {Object|HTMLElement} optionsOrLogContainer - Options object or log container element
 */
class Logger {
  constructor() {
    let optionsOrLogContainer = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    // Handle both old signature (logContainer) and new signature (options object)
    // This maintains backward compatibility while supporting new features
    let options = {};
    let logContainer = null;

    // Determine if using new options format or old logContainer format
    // New format has maxLogs or fileLogger properties
    if (optionsOrLogContainer && typeof optionsOrLogContainer === 'object' && (optionsOrLogContainer.maxLogs !== undefined || optionsOrLogContainer.fileLogger !== undefined)) {
      // New options format with configuration object
      options = optionsOrLogContainer;
      logContainer = options.logContainer || null;
    } else {
      // Old logContainer format for backward compatibility
      logContainer = optionsOrLogContainer;
      options = {};
    }
    this.logs = [];
    this.maxLogs = options.maxLogs || 1000;
    this.offlineLogs = [];
    this.fileLogger = options.fileLogger || null;
    this.initialized = false;
    this.isOnline = typeof window !== 'undefined' ? window.navigator.onLine : true;
    this.logContainer = null;

    // Flag to prevent server logging feedback loops
    this.serverLoggingEnabled = true;
    this.isLoadingLogs = false;

    // Initialize log container
    this._initLogContainer(logContainer);

    // Create a safe file logger that won't throw errors
    if (!this.fileLogger) {
      this.fileLogger = this._createSafeFileLogger();
    }

    // Mark as initialized
    this.initialized = true;
  }

  /**
   * Temporarily disable server logging to prevent feedback loops
   */
  disableServerLogging() {
    this.serverLoggingEnabled = false;
  }

  /**
   * Re-enable server logging
   */
  enableServerLogging() {
    this.serverLoggingEnabled = true;
  }

  /**
   * Set flag to indicate we're loading logs (prevents server logging)
   */
  setLoadingLogs(isLoading) {
    this.isLoadingLogs = isLoading;
  }

  /**
   * Create a safe file logger that handles initialization and errors
   * @private
   */
  _createSafeFileLogger() {
    const logger = {
      _initialized: false,
      _logger: null,
      _queue: [],
      _initializing: false,
      // Public logging methods that match console API
      log: function () {
        const [message, data, context] = this._processArgs(...arguments);
        this._log('info', message, data, context);
      },
      debug: function () {
        const [message, data, context] = this._processArgs(...arguments);
        this._log('debug', message, data, context);
      },
      info: function () {
        const [message, data, context] = this._processArgs(...arguments);
        this._log('info', message, data, context);
      },
      warn: function () {
        const [message, data, context] = this._processArgs(...arguments);
        this._log('warn', message, data, context);
      },
      error: function () {
        const [message, data, context] = this._processArgs(...arguments);
        this._log('error', message, data, context);
      },
      // Helper method to process log arguments
      _processArgs: function () {
        let message = '';
        let data = null;
        let context = null;
        if (arguments.length > 0) {
          if (typeof (arguments.length <= 0 ? undefined : arguments[0]) === 'string') {
            message = arguments.length <= 0 ? undefined : arguments[0];
            if (arguments.length > 1 && typeof (arguments.length <= 1 ? undefined : arguments[1]) === 'object') {
              data = arguments.length <= 1 ? undefined : arguments[1];
              if (arguments.length > 2 && typeof (arguments.length <= 2 ? undefined : arguments[2]) === 'object') {
                context = arguments.length <= 2 ? undefined : arguments[2];
              }
            }
          } else if (typeof (arguments.length <= 0 ? undefined : arguments[0]) === 'object') {
            data = arguments.length <= 0 ? undefined : arguments[0];
            message = 'Log data';
            if (arguments.length > 1 && typeof (arguments.length <= 1 ? undefined : arguments[1]) === 'object') {
              context = arguments.length <= 1 ? undefined : arguments[1];
            }
          }
        }
        return [message, data, context];
      },
      // Internal log method that handles queuing and initialization
      _log: async function (level, message, data, context) {
        // Always log to console for debugging
        const consoleLevel = level === 'log' ? 'info' : level;
        if (console[consoleLevel]) {
          console[consoleLevel](`[${level.toUpperCase()}]`, message, data || '', context || '');
        } else {
          console.log(`[${level.toUpperCase()}]`, message, data || '', context || '');
        }

        // If we're not in a browser environment, don't try to use FileLogger
        if (typeof window === 'undefined') {
          return;
        }

        // Use arrow function to maintain 'this' context
        const logToFile = async () => {
          // If not initialized, queue the message
          if (!this._initialized) {
            this._queue.push({
              level,
              message,
              data,
              context
            });
            // Start initialization if not already in progress
            if (!this._initializing) {
              await this._initialize();
            }
            return;
          }

          // If we have a logger, use it
          if (this._logger) {
            try {
              await this._logger[level](message, data, context);
            } catch (error) {
              console.error('Error writing to log file:', error);
            }
          }
        };

        // Don't wait for the file logging to complete
        logToFile().catch(console.error);
      },
      // Initialize the file logger
      _initialize: async function () {
        if (this._initializing || this._initialized) return;
        this._initializing = true;
        try {
          // Only initialize in a secure context with the File System Access API
          if (window.isSecureContext && window.showSaveFilePicker) {
            this._logger = new _fileLogger.FileLogger('client.log');
            await this._logger.info('Logger initialized');

            // Process any queued messages
            const queue = [...this._queue];
            this._queue = [];
            for (const {
              level,
              message,
              data,
              context
            } of queue) {
              try {
                await this._logger[level](message, data, context);
              } catch (err) {
                console.error('Error processing queued log:', err);
              }
            }
          }
        } catch (error) {
          console.error('Failed to initialize file logger:', error);
        } finally {
          this._initialized = true;
          this._initializing = false;
        }
      },
      // Close the file logger
      close: async function () {
        try {
          if (this._logger && typeof this._logger.close === 'function') {
            await this._logger.close();
          }
        } catch (error) {
          console.error('Error closing file logger:', error);
        }
      }
    };

    // Initialize on first user interaction if in browser
    if (typeof window !== 'undefined') {
      const initOnInteraction = () => {
        window.removeEventListener('click', initOnInteraction);
        window.removeEventListener('keydown', initOnInteraction);
        logger._initialize().catch(console.error);
      };
      window.addEventListener('click', initOnInteraction);
      window.addEventListener('keydown', initOnInteraction);
    }
    return logger;
  }

  // Public logging methods that match console API
  log(message, data, context) {
    this._addToLogs('info', message, data, context);
    this.fileLogger.log(message, data, context);
  }
  debug(message, data, context) {
    this._addToLogs('debug', message, data, context);
    this.fileLogger.debug(message, data, context);
  }
  info(message, data, context) {
    this._addToLogs('info', message, data, context);
    this.fileLogger.info(message, data, context);
  }
  warn(message, data, context) {
    this._addToLogs('warn', message, data, context);
    this.fileLogger.warn(message, data, context);
  }
  error(message, data, context) {
    this._addToLogs('error', message, data, context);
    this.fileLogger.error(message, data, context);
  }

  // Internal method to add logs to the in-memory array and UI
  _addToLogs(level, message, data, context) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data,
      context
    };

    // Add to logs array
    this.logs.push(logEntry);

    // Keep only the most recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Update UI if log container exists
    this._updateLogUI(logEntry);
  }

  /**
   * Update the UI with a new log entry
   * @private
   * @param {Object} logEntry - The log entry to display
   */
  _updateLogUI(logEntry) {
    if (!this.logContainer || !(this.logContainer instanceof HTMLElement)) {
      return;
    }
    try {
      const logElement = document.createElement('div');
      logElement.className = `log-entry log-${logEntry.level}`;
      const timeStr = new Date(logEntry.timestamp).toLocaleTimeString();

      // Create a more structured log entry with expand/collapse functionality
      const timeElement = document.createElement('span');
      timeElement.className = 'log-time';
      timeElement.textContent = timeStr;
      const levelElement = document.createElement('span');
      levelElement.className = `log-level ${logEntry.level}`;
      levelElement.textContent = logEntry.level.toUpperCase();
      const messageElement = document.createElement('div');
      messageElement.className = 'log-message';
      messageElement.textContent = logEntry.message;

      // Create expand icon for entries with additional data
      const hasDetails = logEntry.data || logEntry.context;
      let expandIcon = null;
      if (hasDetails) {
        expandIcon = document.createElement('span');
        expandIcon.className = 'log-expand-icon';
        expandIcon.innerHTML = '▶'; // Right-pointing triangle for collapsed state
        expandIcon.style.cursor = 'pointer';
      }

      // Create a container for the log header (time, level, message, expand icon)
      const headerElement = document.createElement('div');
      headerElement.className = 'log-header';
      headerElement.style.display = 'flex';
      headerElement.style.alignItems = 'center';
      headerElement.style.gap = '8px';
      headerElement.appendChild(timeElement);
      headerElement.appendChild(levelElement);
      headerElement.appendChild(messageElement);
      if (expandIcon) {
        headerElement.appendChild(expandIcon);
      }
      logElement.appendChild(headerElement);

      // Create details container for expandable content
      if (hasDetails) {
        const detailsElement = document.createElement('div');
        detailsElement.className = 'log-details';
        detailsElement.style.display = 'none'; // Initially hidden

        // Add data if it exists
        if (logEntry.data) {
          const dataSection = document.createElement('div');
          dataSection.className = 'log-detail-section';
          const dataTitle = document.createElement('h4');
          dataTitle.textContent = 'Data';
          dataSection.appendChild(dataTitle);
          const dataContent = document.createElement('pre');
          dataContent.className = 'log-detail-json';
          dataContent.textContent = JSON.stringify(logEntry.data, null, 2);
          dataSection.appendChild(dataContent);
          detailsElement.appendChild(dataSection);
        }

        // Add context if it exists
        if (logEntry.context) {
          const contextSection = document.createElement('div');
          contextSection.className = 'log-detail-section';
          const contextTitle = document.createElement('h4');
          contextTitle.textContent = 'Context';
          contextSection.appendChild(contextTitle);
          const contextContent = document.createElement('pre');
          contextContent.className = 'log-detail-json';
          contextContent.textContent = JSON.stringify(logEntry.context, null, 2);
          contextSection.appendChild(contextContent);
          detailsElement.appendChild(contextSection);
        }

        // Add details if it exists (as a string)
        if (logEntry.details) {
          const detailsSection = document.createElement('div');
          detailsSection.className = 'log-detail-section';
          const detailsTitle = document.createElement('h4');
          detailsTitle.textContent = 'Details';
          detailsSection.appendChild(detailsTitle);
          const detailsContent = document.createElement('pre');
          detailsContent.className = 'log-detail-json';
          detailsContent.textContent = logEntry.details;
          detailsSection.appendChild(detailsContent);
          detailsElement.appendChild(detailsSection);
        }
        logElement.appendChild(detailsElement);
      }

      // === LOG ENTRY INSERTION: NEWEST FIRST ===
      // Logs are reversed so newest entries show first (top of the list)
      // Makes recent events immediately visible without scrolling
      // Maintain this ordering for all future log-related features
      if (this.logContainer.firstChild) {
        this.logContainer.insertBefore(logElement, this.logContainer.firstChild);
      } else {
        this.logContainer.appendChild(logElement);
      }

      // Auto-scroll to top since newest entries are at the top
      this.logContainer.scrollTop = 0;

      // Limit the number of log entries in the UI
      const maxUILogs = 100;
      while (this.logContainer.children.length > maxUILogs) {
        this.logContainer.removeChild(this.logContainer.lastChild);
      }
    } catch (error) {
      console.error('Error updating log UI:', error);
    }
  }
  _initLogContainer(logContainer) {
    try {
      if (logContainer && typeof logContainer === 'string') {
        this.logContainer = document.querySelector(logContainer);
      } else if (logContainer instanceof HTMLElement) {
        this.logContainer = logContainer;
      } else {
        this.logContainer = document.getElementById('log-entries') || document.createElement('div');
      }
    } catch (error) {
      console.error('Error initializing log container:', error);
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
  async log(level, message) {
    let data = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
    const timestamp = new Date().toISOString();
    const logEntry = {
      level,
      message,
      data,
      timestamp
    };

    // Add to in-memory logs
    this.logs.push(logEntry);

    // Keep logs under maxLogs limit
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Log to console
    const logFn = console[level] || console.log;
    logFn(`[${timestamp}] [${level.toUpperCase()}] ${message}`, data);

    // Save to file logger if available
    if (this.fileLogger) {
      try {
        // Use the appropriate log level method on fileLogger
        const logMethod = this.fileLogger[level] || this.fileLogger.info;
        if (typeof logMethod === 'function') {
          await logMethod.call(this.fileLogger, message, data);
        } else {
          console.warn(`Log method '${level}' not available on fileLogger`);
        }
      } catch (error) {
        console.error('Error saving log to file:', error);
      }
    }

    // Send log to server only if server logging is enabled and we're not loading logs
    if (this.serverLoggingEnabled && !this.isLoadingLogs) {
      try {
        // Additional check: if we're currently fetching logs, skip server logging entirely
        if (window.location && window.location.href && window.location.href.includes('/api/logs')) {
          return logEntry; // Skip server logging if we're on a logs-related page
        }

        // Check if we're in a logging operation by looking at the call stack
        const stack = new Error().stack;
        if (stack && (stack.includes('loadAndDisplayLogs') || stack.includes('/api/logs'))) {
          return logEntry; // Skip server logging if called from log loading functions
        }
        await fetch('/api/logs/ui', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            level,
            message,
            data
          })
        });
      } catch (error) {
        console.error('Error sending log to server:', error);
        this.offlineLogs.push(logEntry);
      }
    } else {
      // Log why we're skipping server logging
      if (!this.serverLoggingEnabled) {
        console.debug('Skipping server logging: disabled');
      }
      if (this.isLoadingLogs) {
        console.debug('Skipping server logging: loading logs');
      }
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
  debug(message) {
    let data = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    return this.log('debug', message, data);
  }
  info(message) {
    let data = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    return this.log('info', message, data);
  }
  success(message) {
    let data = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    return this.log('success', message, data);
  }
  warn(message) {
    let data = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    return this.log('warn', message, data);
  }
  error(message) {
    let data = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    return this.log('error', message, data);
  }
}
exports.Logger = Logger;

},{"./file-logger.js":7}],11:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PingOneClient = void 0;
var _localApi = require("./local-api.js");
/**
 * PingOne API Client
 * Handles all API calls to the PingOne API through the local proxy
 */

class PingOneClient {
  /**
   * Create a new PingOneClient instance
   * @param {Object} logger - Logger instance
   * @param {Object} settingsManager - Settings manager instance
   */
  constructor(logger, settingsManager) {
    this.logger = logger || console;
    this.settingsManager = settingsManager;
    this.basePath = '/api/pingone';
    this.localAPI = _localApi.localAPI; // Store localAPI for reuse
    this.accessToken = null; // Initialize accessToken
  }

  /**
   * Get current settings from settings manager
   * @returns {Object} Current settings
   */
  getSettings() {
    return this.settingsManager.getSettings();
  }

  /**
   * Get the remaining time for the current cached token
   * @returns {Object|null} Object with timeRemaining (seconds) and formatted time, or null if no valid token
   */
  getCurrentTokenTimeRemaining() {
    try {
      const token = this.getCachedToken();
      if (!token) {
        return null;
      }
      const expiry = localStorage.getItem('pingone_token_expiry');
      if (!expiry) {
        return null;
      }
      const expiryTime = parseInt(expiry, 10);
      if (isNaN(expiryTime)) {
        return null;
      }
      const now = Date.now();
      const timeRemainingSeconds = Math.max(0, Math.floor((expiryTime - now) / 1000));

      // Format the time remaining
      const hours = Math.floor(timeRemainingSeconds / 3600);
      const minutes = Math.floor(timeRemainingSeconds % 3600 / 60);
      const seconds = timeRemainingSeconds % 60;
      let formattedTime = '';
      if (hours > 0) {
        formattedTime = `${hours}h ${minutes}m ${seconds}s`;
      } else if (minutes > 0) {
        formattedTime = `${minutes}m ${seconds}s`;
      } else {
        formattedTime = `${seconds}s`;
      }
      return {
        timeRemaining: timeRemainingSeconds,
        formattedTime: formattedTime,
        isExpired: timeRemainingSeconds <= 0
      };
    } catch (error) {
      console.error('Error getting token time remaining:', error);
      return null;
    }
  }

  /**
   * Get the worker token from localStorage if available and not expired
   * @returns {string|null} Cached token or null if not available or expired
   */
  getCachedToken() {
    try {
      // Check if localStorage is available
      if (typeof localStorage === 'undefined' || typeof window === 'undefined') {
        return null;
      }

      // Check if localStorage is accessible (it might be disabled in private browsing)
      const testKey = 'pingone_test_key';
      try {
        localStorage.setItem(testKey, testKey);
        localStorage.removeItem(testKey);
      } catch (e) {
        console.warn('localStorage is not available:', e.message);
        return null;
      }
      const token = localStorage.getItem('pingone_worker_token');
      const expiry = localStorage.getItem('pingone_token_expiry');
      if (!token || !expiry) {
        return null;
      }
      const expiryTime = parseInt(expiry, 10);

      // Check if expiryTime is a valid number
      if (isNaN(expiryTime)) {
        console.warn('Invalid token expiry time');
        return null;
      }
      const now = Date.now();

      // If token is expired or will expire in the next 5 minutes, return null
      if (now >= expiryTime - 5 * 60 * 1000) {
        return null;
      }
      return token;
    } catch (error) {
      console.error('Error accessing token cache:', error);
      return null;
    }
  }

  /**
   * Get an access token, using cached one if available and valid
   * @returns {Promise<string>} Access token
   */
  async getAccessToken() {
    console.log('[DEBUG] getAccessToken called');
    // Check for cached token first
    const cachedToken = this.getCachedToken();
    if (cachedToken) {
      console.log('[DEBUG] Using cached token:', cachedToken.substring(0, 8) + '...');
      return cachedToken;
    }
    try {
      console.log('[DEBUG] Fetching token from /api/pingone/get-token');
      const response = await fetch('/api/pingone/get-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      console.log('[DEBUG] Fetch response:', response);
      if (!response.ok) {
        let errorMsg = `Failed to get access token: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMsg += errorData.message ? ` - ${errorData.message}` : '';
        } catch (e) {
          // Ignore JSON parse errors
        }
        console.error('[DEBUG] Fetch error:', errorMsg);
        if (window.app && window.app.uiManager) {
          window.app.uiManager.showNotification('❌ ' + errorMsg, 'error');
        }
        throw new Error(errorMsg);
      }
      const data = await response.json();
      console.log('[DEBUG] Data received from server:', data);
      if (!data.access_token) {
        console.warn('[TOKEN] No access_token in server response:', data);
        if (window.app && window.app.uiManager) {
          window.app.uiManager.showNotification('⚠️ No token received from server. Please check your PingOne credentials and try again.', 'warning');
        }
        return null;
      }
      let tokenSaved = false;
      try {
        if (typeof localStorage !== 'undefined' && typeof window !== 'undefined') {
          const expiryTime = Date.now() + data.expires_in * 1000;
          try {
            localStorage.setItem('pingone_worker_token', data.access_token);
            localStorage.setItem('pingone_token_expiry', expiryTime.toString());
            tokenSaved = true;
            console.log('[DEBUG] Token saved to localStorage:', {
              token: data.access_token ? data.access_token.substring(0, 8) + '...' : null,
              expiry: expiryTime,
              expires_in: data.expires_in
            });
            console.log('[DEBUG] localStorage now:', {
              pingone_worker_token: localStorage.getItem('pingone_worker_token'),
              pingone_token_expiry: localStorage.getItem('pingone_token_expiry')
            });
            if (this.logger && this.logger.info) {
              this.logger.info('[TOKEN] Saved to localStorage', {
                token: data.access_token ? data.access_token.substring(0, 8) + '...' : null,
                expiry: expiryTime,
                expires_in: data.expires_in
              });
            }
          } catch (storageError) {
            console.warn('Failed to store token in localStorage:', storageError);
            if (this.logger && this.logger.error) {
              this.logger.error('[TOKEN] Failed to store token in localStorage', storageError);
            }
            if (window.app && window.app.uiManager) {
              window.app.uiManager.showNotification('❌ Failed to save token in your browser. Please check your browser settings or try another browser.', 'error');
            }
          }
        }
      } catch (error) {
        console.warn('Error accessing localStorage:', error);
        if (this.logger && this.logger.error) {
          this.logger.error('[TOKEN] Error accessing localStorage', error);
        }
        if (window.app && window.app.uiManager) {
          window.app.uiManager.showNotification('❌ Error accessing browser storage. Token may not be saved.', 'error');
        }
      }
      this.accessToken = data.access_token; // Cache the token
      if (tokenSaved) {
        // Calculate time remaining with better formatting
        let timeLeftMsg = '';
        if (data.expires_in) {
          const hours = Math.floor(data.expires_in / 3600);
          const minutes = Math.floor(data.expires_in % 3600 / 60);
          const seconds = data.expires_in % 60;
          if (hours > 0) {
            timeLeftMsg = ` (expires in ${hours}h ${minutes}m ${seconds}s)`;
          } else if (minutes > 0) {
            timeLeftMsg = ` (expires in ${minutes}m ${seconds}s)`;
          } else {
            timeLeftMsg = ` (expires in ${seconds}s)`;
          }
        }
        const msg = `✅ New token acquired. Time left on token: ${timeLeftMsg.replace(/^ \(expires in |\)$/g, '')}`;
        if (window.app && window.app.uiManager) {
          window.app.uiManager.updateConnectionStatus('connected', msg);
          window.app.uiManager.showNotification(msg, 'success');

          // Also log to console if DEBUG_MODE is enabled
          if (window.DEBUG_MODE) {
            console.log('Token acquisition successful:', {
              tokenLength: data.access_token ? data.access_token.length : 0,
              expiresIn: data.expires_in,
              timeLeft: timeLeftMsg.replace(/^ \(expires in |\)$/g, ''),
              expiryTime: expiryTime
            });
          }
        }
      }
      return data.access_token;
    } catch (error) {
      console.error('[DEBUG] Error in getAccessToken:', error);
      this.logger.error('Error getting access token:', error);
      throw error;
    }
  }

  /**
   * Make an authenticated API request to PingOne
   * @param {string} method - HTTP method (GET, POST, PUT, DELETE, etc.)
   * @param {string} endpoint - API endpoint (without base URL)
   * @param {Object} [data] - Request body (for POST/PUT/PATCH)
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Response data
   */
  async request(method, endpoint) {
    let data = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;
    let options = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};
    const settings = this.getSettings();
    const url = `${this.basePath}${endpoint}`;
    const startTime = Date.now();

    // Get access token for all requests
    if (!this.accessToken) {
      await this.getAccessToken();
    }

    // Prepare headers
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${this.accessToken}`
    };

    // Log the request with minimal details to avoid rate limiting
    const requestLog = {
      type: 'api_request',
      method,
      url,
      timestamp: new Date().toISOString(),
      source: 'pingone-client'
    };
    this.logger.debug('🔄 PingOne API Request:', requestLog);

    // Abort support
    if (options.signal && options.signal.aborted) {
      throw new DOMException('Request aborted', 'AbortError');
    }
    let abortListener;
    if (options.signal) {
      abortListener = () => {
        throw new DOMException('Request aborted', 'AbortError');
      };
      options.signal.addEventListener('abort', abortListener);
    }

    // Retry logic
    let lastError = null;
    for (let attempt = 1; attempt <= (options.retries || 3); attempt++) {
      try {
        console.log(`[REQUEST] Making API request (attempt ${attempt}): ${method} ${url}`);
        // Pass signal to localAPI.request if supported
        const response = await this.localAPI.request(method, url, data, {
          ...options,
          headers,
          signal: options.signal
        });
        console.log(`[REQUEST] API request completed (attempt ${attempt}):`, response);

        // Log successful response with minimal details
        const responseLog = {
          type: 'api_response',
          status: 200,
          method,
          duration: Date.now() - startTime,
          attempt: attempt,
          source: 'pingone-client'
        };
        this.logger.debug('✅ PingOne API Response:', responseLog);
        if (options.signal && abortListener) {
          options.signal.removeEventListener('abort', abortListener);
        }
        return response;
      } catch (error) {
        if (options.signal && options.signal.aborted) {
          if (abortListener) options.signal.removeEventListener('abort', abortListener);
          throw new DOMException('Request aborted', 'AbortError');
        }
        lastError = error;
        this.logger.error(`PingOne API Error (attempt ${attempt}/${options.retries || 3}):`, error);

        // Get the friendly error message if available
        const friendlyMessage = error.friendlyMessage || error.message;
        const isRateLimit = error.status === 429 || error.message.includes('429');
        const isBadRequest = error.status === 400;

        // Calculate baseDelay and delay here, before using them
        const baseDelay = isRateLimit ? (options.retryDelay || 1000) * 2 : options.retryDelay || 1000;
        const delay = baseDelay * Math.pow(2, attempt - 1);

        // Show appropriate UI messages based on error type
        if (window.app && window.app.uiManager) {
          if (isRateLimit) {
            if (attempt < (options.retries || 3)) {
              // Use enhanced rate limit warning with retry information
              window.app.uiManager.showRateLimitWarning(friendlyMessage, {
                isRetrying: true,
                retryAttempt: attempt,
                maxRetries: options.retries || 3,
                retryDelay: delay
              });
            } else {
              window.app.uiManager.showError(friendlyMessage);
            }
          } else if (isBadRequest) {
            window.app.uiManager.showError(friendlyMessage);
          } else if (attempt === (options.retries || 3)) {
            window.app.uiManager.showError(friendlyMessage);
          }
        }

        // If this is the last attempt, throw with friendly message
        if (attempt === (options.retries || 3)) {
          if (options.signal && abortListener) options.signal.removeEventListener('abort', abortListener);
          throw error;
        }

        // Only retry for rate limits (429) and server errors (5xx)
        const shouldRetry = isRateLimit || error.status >= 500 || !error.status;
        if (!shouldRetry) {
          // Don't retry for client errors (4xx except 429), throw immediately
          if (options.signal && abortListener) options.signal.removeEventListener('abort', abortListener);
          throw error;
        }

        // Use the delay calculated above
        this.logger.info(`Retrying request in ${delay}ms... (attempt ${attempt + 1}/${options.retries || 3})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    if (options.signal && abortListener) options.signal.removeEventListener('abort', abortListener);
    throw lastError;
  }

  /**
   * Get all populations from PingOne
   * @returns {Promise<Array>} Array of population objects
   */
  async getPopulations() {
    const settings = this.getSettings();
    const response = await this.request('GET', `/environments/${settings.environmentId}/populations`);

    // Handle different response formats
    if (typeof response === 'string') {
      try {
        return JSON.parse(response);
      } catch (error) {
        this.logger.error('Failed to parse populations response:', error);
        return [];
      }
    } else if (Array.isArray(response)) {
      return response;
    } else if (response && typeof response === 'object') {
      // If response is an object, it might be wrapped
      if (Array.isArray(response.data)) {
        return response.data;
      } else if (Array.isArray(response.populations)) {
        return response.populations;
      }
    }
    this.logger.warn('Unexpected populations response format:', response);
    return [];
  }

  /**
   * Test the connection to PingOne API
   * @returns {Promise<boolean>} True if connection is successful, false otherwise
   */
  async testConnection() {
    try {
      const settings = this.getSettings();
      // Try to get the populations endpoint as a way to test the connection
      await this.request('GET', `/environments/${settings.environmentId}/populations?limit=1`);
      return true;
    } catch (error) {
      this.logger.error('PingOne connection test failed:', error);
      return false;
    }
  }

  /**
   * Import users into PingOne
   * @param {Array<Object>} users - Array of user objects to import
   * @param {Object} options - Import options
   * @returns {Promise<Object>} Import results
   */
  async importUsers(users) {
    let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    console.log('[IMPORT] importUsers method called');
    const settings = this.getSettings();
    const endpoint = `/environments/${settings.environmentId}/users`;
    const {
      onProgress,
      retryAttempts = 3,
      delayBetweenRetries = 1000,
      importOptions = {},
      abortController
    } = options;
    const results = [];
    const totalUsers = users.length;
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let retryCount = 0;
    console.log('[IMPORT] Initial setup completed');
    this.logger.debug('[IMPORT] Starting import of users', {
      totalUsers
    });

    // Validate input
    console.log('[IMPORT] Validating input...');
    if (!users || !Array.isArray(users) || users.length === 0) {
      throw new Error('No users provided for import');
    }
    if (!settings.environmentId) {
      throw new Error('Environment ID not configured');
    }
    console.log('[IMPORT] Input validation completed');

    // Handle population selection based on import options
    console.log('[IMPORT] Handling population selection...');
    const {
      selectedPopulationId,
      useCsvPopulationId,
      useDefaultPopulation
    } = importOptions;

    // Determine the fallback population ID
    let fallbackPopulationId = null;

    // Priority 1: Selected population from dropdown
    if (selectedPopulationId) {
      fallbackPopulationId = selectedPopulationId;
      console.log('[IMPORT] Using selected population from dropdown:', fallbackPopulationId);
    }
    // Priority 2: Default population from settings
    else if (useDefaultPopulation && settings.populationId) {
      fallbackPopulationId = settings.populationId;
      console.log('[IMPORT] Using default population from settings:', fallbackPopulationId);
    }
    // Priority 3: Check if CSV has population data (only if explicitly enabled)
    else if (useCsvPopulationId) {
      // Check if any user has populationId data
      const hasCsvPopulationData = users.some(user => user.populationId && user.populationId.trim() !== '');
      if (hasCsvPopulationData) {
        console.log('[IMPORT] CSV has population data, will use individual population IDs from CSV');
        fallbackPopulationId = 'csv-population-ids'; // Special marker
      } else {
        console.log('[IMPORT] CSV population ID enabled but no population data found in CSV');
      }
    }

    // If still no population, show modal but allow import to continue
    if (!fallbackPopulationId) {
      console.log('[IMPORT] No population selected, showing modal...');
      if (window.app) {
        // Reset import button state before showing modal
        if (window.app.uiManager) {
          window.app.uiManager.resetImportState();
        }

        // Show modal and wait for user action
        const modalResult = await window.app.showPopulationWarningModal();
        if (modalResult === 'settings') {
          // User chose to go to settings, return early
          return {
            total: totalUsers,
            success: 0,
            failed: 0,
            skipped: 0,
            results: [],
            error: 'No population selected or configured - user redirected to settings.'
          };
        }
        // User clicked OK, continue with import but use default population
        console.log('[IMPORT] User chose to continue without population selection, using default population');
        // Get the first available population as fallback
        try {
          const availablePopulations = await this.getPopulations();
          if (availablePopulations && availablePopulations.length > 0) {
            fallbackPopulationId = availablePopulations[0].id;
            console.log('[IMPORT] Using first available population as fallback:', fallbackPopulationId);
          } else {
            console.log('[IMPORT] No populations available, skipping all users');
            return {
              total: totalUsers,
              success: 0,
              failed: 0,
              skipped: totalUsers,
              results: users.map(user => ({
                success: false,
                user: user,
                error: 'No population available in PingOne environment',
                skipped: true
              })),
              error: 'No population available in PingOne environment.'
            };
          }
        } catch (error) {
          console.error('[IMPORT] Error getting populations:', error);
          return {
            total: totalUsers,
            success: 0,
            failed: 0,
            skipped: totalUsers,
            results: users.map(user => ({
              success: false,
              user: user,
              error: 'Failed to get available populations',
              skipped: true
            })),
            error: 'Failed to get available populations.'
          };
        }
      } else {
        return {
          total: totalUsers,
          success: 0,
          failed: 0,
          skipped: 0,
          results: [],
          error: 'No population selected or configured.'
        };
      }
    }
    console.log('[IMPORT] Population selection completed, fallbackPopulationId:', fallbackPopulationId);
    this.logger.info('Population selection for import', {
      useCsvPopulationId,
      selectedPopulationId,
      useDefaultPopulation,
      fallbackPopulationId,
      settingsPopulationId: settings.populationId
    });

    // Process users in batches with improved error handling
    console.log('[IMPORT] Starting user processing loop...');
    const batchSize = 10;
    for (let i = 0; i < totalUsers; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      console.log(`[IMPORT] Processing batch ${Math.floor(i / batchSize) + 1}, users ${i + 1}-${Math.min(i + batchSize, totalUsers)}`);
      this.logger.debug(`[IMPORT] Processing batch`, {
        batchNumber: Math.floor(i / batchSize) + 1,
        from: i + 1,
        to: Math.min(i + batchSize, totalUsers)
      });
      for (let batchIndex = 0; batchIndex < batch.length; batchIndex++) {
        const currentIndex = i + batchIndex;
        const currentUser = batch[batchIndex];
        try {
          if (onProgress) {
            onProgress(currentIndex, totalUsers, currentUser, {
              success: successCount,
              failed: failedCount,
              skipped: skippedCount,
              retries: retryCount
            });
          }
          // Validate user data before creating
          const validationError = this.validateUserForImport(currentUser);
          if (validationError) {
            this.logger.warn(`User validation failed for ${currentUser.email || currentUser.username}: ${validationError}`, 'warn');
            skippedCount++;
            results.push({
              success: false,
              user: currentUser,
              error: validationError,
              skipped: true
            });
            continue;
          }

          // Additional validation for required name fields
          if (!currentUser.firstName || currentUser.firstName.trim() === '') {
            this.logger.warn(`User ${currentUser.email || currentUser.username} missing firstName, skipping`, 'warn');
            skippedCount++;
            results.push({
              success: false,
              user: currentUser,
              error: 'firstName is required and cannot be empty',
              skipped: true
            });
            continue;
          }
          if (!currentUser.lastName || currentUser.lastName.trim() === '') {
            this.logger.warn(`User ${currentUser.email || currentUser.username} missing lastName, skipping`, 'warn');
            skippedCount++;
            results.push({
              success: false,
              user: currentUser,
              error: 'lastName is required and cannot be empty',
              skipped: true
            });
            continue;
          }

          // Determine population ID for this user
          let userPopulationId = fallbackPopulationId;

          // If CSV population ID is enabled and user has a population ID
          if (useCsvPopulationId && currentUser.populationId) {
            // Validate the CSV population ID format (should be a valid UUID)
            const isValidPopulationId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentUser.populationId);
            if (isValidPopulationId) {
              // Check if the population exists in the available populations
              const availablePopulations = await this.getPopulations();
              const populationExists = availablePopulations.some(pop => pop.id === currentUser.populationId);
              if (populationExists) {
                userPopulationId = currentUser.populationId;
                this.logger.info(`Using CSV population ID for user ${currentUser.email || currentUser.username}: ${userPopulationId}`);
              } else {
                // CSV population ID doesn't exist, fall back to UI-selected population
                this.logger.warn(`CSV population ID ${currentUser.populationId} does not exist in PingOne environment. Falling back to UI-selected population: ${fallbackPopulationId}`);
                if (fallbackPopulationId && fallbackPopulationId !== 'csv-population-ids') {
                  userPopulationId = fallbackPopulationId;
                } else {
                  this.logger.warn(`No valid population ID available for user ${currentUser.email || currentUser.username}. Skipping user.`);
                  failedCount++;
                  results.push({
                    success: false,
                    user: currentUser,
                    error: `CSV population ID ${currentUser.populationId} does not exist in PingOne environment. No fallback population available.`,
                    skipped: true
                  });
                  continue;
                }
              }
            } else {
              // CSV population ID is invalid format, fall back to UI-selected population
              this.logger.warn(`Invalid CSV population ID format for user ${currentUser.email || currentUser.username}: ${currentUser.populationId}. Falling back to UI-selected population: ${fallbackPopulationId}`);
              if (fallbackPopulationId && fallbackPopulationId !== 'csv-population-ids') {
                userPopulationId = fallbackPopulationId;
              } else {
                this.logger.warn(`No valid population ID available for user ${currentUser.email || currentUser.username}. Skipping user.`);
                failedCount++;
                results.push({
                  success: false,
                  user: currentUser,
                  error: `Invalid CSV population ID format: ${currentUser.populationId}. No fallback population available.`,
                  skipped: true
                });
                continue;
              }
            }
          } else if (fallbackPopulationId && fallbackPopulationId !== 'csv-population-ids') {
            if (selectedPopulationId && fallbackPopulationId === selectedPopulationId) {
              this.logger.info(`Using selected population ID for user ${currentUser.email || currentUser.username}: ${fallbackPopulationId}`);
            } else {
              this.logger.info(`Using fallback population ID for user ${currentUser.email || currentUser.username}: ${fallbackPopulationId}`);
            }
          } else if (fallbackPopulationId === 'csv-population-ids' && currentUser.populationId) {
            // Validate the CSV population ID format
            const isValidPopulationId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentUser.populationId);
            if (isValidPopulationId) {
              // Check if the population exists in the available populations
              const availablePopulations = await this.getPopulations();
              const populationExists = availablePopulations.some(pop => pop.id === currentUser.populationId);
              if (populationExists) {
                userPopulationId = currentUser.populationId;
                this.logger.info(`Using CSV population ID for user ${currentUser.email || currentUser.username}: ${userPopulationId}`);
              } else {
                this.logger.warn(`CSV population ID ${currentUser.populationId} does not exist in PingOne environment. Skipping user.`);
                failedCount++;
                results.push({
                  success: false,
                  user: currentUser,
                  error: `CSV population ID ${currentUser.populationId} does not exist in PingOne environment.`,
                  skipped: true
                });
                continue;
              }
            } else {
              this.logger.warn(`Invalid CSV population ID format for user ${currentUser.email || currentUser.username}: ${currentUser.populationId}. Skipping user.`);
              failedCount++;
              results.push({
                success: false,
                user: currentUser,
                error: `Invalid CSV population ID format: ${currentUser.populationId}`,
                skipped: true
              });
              continue;
            }
          } else {
            this.logger.warn(`No population ID available for user ${currentUser.email || currentUser.username}. Skipping user.`);
            failedCount++;
            results.push({
              success: false,
              user: currentUser,
              error: 'No population ID available for user',
              skipped: true
            });
            continue;
          }
          // Store enabled status for later use (after user creation)
          let userEnabledStatus = true; // default to true
          if (currentUser.enabled !== undefined && currentUser.enabled !== null) {
            if (typeof currentUser.enabled === 'boolean') {
              userEnabledStatus = currentUser.enabled;
            } else if (typeof currentUser.enabled === 'string') {
              // Convert string values to boolean
              const enabledStr = currentUser.enabled.toLowerCase().trim();
              userEnabledStatus = enabledStr === 'true' || enabledStr === '1' || enabledStr === 'yes';
            } else if (typeof currentUser.enabled === 'number') {
              userEnabledStatus = currentUser.enabled !== 0;
            }
          }
          const userData = {
            name: {
              given: currentUser.firstName || '',
              family: currentUser.lastName || ''
            },
            email: currentUser.email,
            username: currentUser.username || currentUser.email,
            population: {
              id: userPopulationId
            }
          };
          if (currentUser.password) {
            userData.password = {
              value: '[REDACTED]'
            };
          }
          if (currentUser.additionalProperties) {
            Object.assign(userData, currentUser.additionalProperties);
          }
          // Extra debug output for each user
          this.logger.debug('[IMPORT] Preparing to import user', {
            index: currentIndex + 1,
            total: totalUsers,
            user: {
              email: currentUser.email,
              username: currentUser.username,
              firstName: currentUser.firstName,
              lastName: currentUser.lastName,
              populationId: userPopulationId
            },
            userData
          });
          // Make the API request with retry logic
          let result;
          let lastError = null;
          for (let attempt = 1; attempt <= retryAttempts; attempt++) {
            try {
              // Log full request details for debugging
              this.logger.debug('[IMPORT] API Request Details', {
                attempt,
                endpoint,
                userData,
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                  'Authorization': '[REDACTED]'
                }
              });
              console.log(`[IMPORT] Making API request for user ${currentUser.email || currentUser.username} (attempt ${attempt}/${retryAttempts})`);
              result = await this.request('POST', endpoint, userData, {
                signal: abortController ? abortController.signal : undefined
              });
              this.logger.debug('[IMPORT] API Response', {
                user: currentUser.email || currentUser.username,
                result
              });
              console.log(`[IMPORT] API request completed for user ${currentUser.email || currentUser.username}`);

              // Check for different possible response structures
              let userId = null;

              // Handle the actual PingOne API response structure
              // PingOne API returns the user object directly with an 'id' field
              if (result && typeof result === 'object') {
                // Check for special "user already exists" response
                if (result.success && result.warning && result.message && result.message.includes('already exists')) {
                  // This is a special case where the user already exists
                  // We should treat this as a skip rather than an error
                  console.log(`[IMPORT] User already exists: ${currentUser.email || currentUser.username}`);
                  skippedCount++;
                  results.push({
                    success: false,
                    user: currentUser,
                    warning: true,
                    message: result.message,
                    skipped: true
                  });
                  break; // Exit the retry loop
                }

                // Direct user object from PingOne API
                if (result.id) {
                  userId = result.id;
                } else if (result._id) {
                  userId = result._id;
                } else if (result.userId) {
                  userId = result.userId;
                }

                // If no ID found in direct object, check nested structures
                if (!userId) {
                  if (result.user && result.user.id) {
                    userId = result.user.id;
                  } else if (result.data && result.data.id) {
                    userId = result.data.id;
                  } else if (result.success && result.id) {
                    userId = result.id;
                  }
                }
              }

              // If still no ID found, check if this is a wrapped response
              if (!userId && result && typeof result === 'object') {
                // Check if the response is wrapped in a data property
                if (result.data && typeof result.data === 'object' && result.data.id) {
                  userId = result.data.id;
                }
              }
              if (userId) {
                // Handle user status if needed (enable/disable)
                if (userEnabledStatus === false) {
                  try {
                    console.log(`[IMPORT] Disabling user ${userId} after creation`);
                    await this.updateUserStatus(userId, false);
                    console.log(`[IMPORT] Successfully disabled user ${userId}`);
                  } catch (statusError) {
                    console.warn(`[IMPORT] Failed to disable user ${userId}:`, statusError.message);
                    // Don't fail the import, just log the warning
                  }
                }
                successCount++;
                results.push({
                  success: true,
                  user: currentUser,
                  id: userId,
                  enabled: userEnabledStatus
                });
                console.log(`[IMPORT] Successfully created user with ID: ${userId} (enabled: ${userEnabledStatus})`);
                break;
              } else {
                console.log(`[IMPORT] Invalid response structure - no ID found:`, result);
                throw new Error('Unknown API response - no user ID found in response');
              }
            } catch (apiError) {
              lastError = apiError;
              // Try to extract error message and log full error details
              let apiErrorMsg = apiError && apiError.message ? apiError.message : 'API request failed';
              let apiErrorDetails = {};
              if (apiError && apiError.response && typeof apiError.response.json === 'function') {
                try {
                  const errorBody = await apiError.response.json();
                  apiErrorDetails.body = errorBody;
                  if (errorBody && errorBody.detail) {
                    apiErrorMsg = errorBody.detail;
                  } else if (errorBody && errorBody.error_description) {
                    apiErrorMsg = errorBody.error_description;
                  } else if (errorBody && errorBody.message) {
                    apiErrorMsg = errorBody.message;
                  }
                } catch (parseErr) {
                  apiErrorDetails.bodyParseError = parseErr.message;
                }
              }
              if (apiError && apiError.response) {
                apiErrorDetails.status = apiError.response.status;
                apiErrorDetails.statusText = apiError.response.statusText;
                apiErrorDetails.headers = {};
                if (apiError.response.headers && typeof apiError.response.headers.forEach === 'function') {
                  apiError.response.headers.forEach((value, key) => {
                    apiErrorDetails.headers[key] = value;
                  });
                }
              }
              this.logger.error(`[IMPORT] PingOne API Error (attempt ${attempt}/${retryAttempts}): ${apiErrorMsg}`, {
                apiErrorMsg,
                apiErrorDetails,
                user: currentUser
              });
              if (attempt === retryAttempts) {
                failedCount++;
                results.push({
                  success: false,
                  user: currentUser,
                  error: apiErrorMsg,
                  apiErrorDetails
                });
                if (window.app && window.app.uiManager) {
                  window.app.uiManager.showNotification(`PingOne API Error: ${apiErrorMsg}`, 'error');
                }
              } else {
                await new Promise(res => setTimeout(res, delayBetweenRetries));
              }
            }
          }
        } catch (err) {
          this.logger.error('[IMPORT] Unexpected error during import', {
            user: currentUser.email || currentUser.username,
            error: err.message,
            stack: err.stack
          });
          console.error(`[IMPORT] Unexpected error for user ${currentUser.email || currentUser.username}:`, err);
          failedCount++;
          results.push({
            success: false,
            user: currentUser,
            error: err.message,
            skipped: false
          });
        }
      }
    }
    // Batch summary
    this.logger.info('[IMPORT] Batch import summary', {
      total: totalUsers,
      success: successCount,
      failed: failedCount,
      skipped: skippedCount,
      retries: retryCount
    });
    console.log('[IMPORT] Batch import summary:', {
      total: totalUsers,
      success: successCount,
      failed: failedCount,
      skipped: skippedCount,
      retries: retryCount
    });
    return {
      total: totalUsers,
      success: successCount,
      failed: failedCount,
      skipped: skippedCount,
      results
    };
  }

  /**
   * Validate user data for import
   * @param {Object} user - User object to validate
   * @returns {string|null} Error message or null if valid
   * @private
   */
  validateUserForImport(user) {
    // Check required fields
    if (!user.username) {
      return 'User must have a username';
    }

    // Check required name fields
    if (!user.firstName || user.firstName.trim() === '') {
      return 'User must have a firstName (given name)';
    }
    if (!user.lastName || user.lastName.trim() === '') {
      return 'User must have a lastName (family name)';
    }

    // Validate email format if provided
    if (user.email && !this.isValidEmail(user.email)) {
      return 'Invalid email format';
    }

    // Validate username format if provided
    if (user.username && !this.isValidUsername(user.username)) {
      return 'Invalid username format (no spaces or special characters)';
    }

    // Validate enabled field if provided
    if (user.enabled !== undefined && typeof user.enabled !== 'boolean') {
      return 'Enabled field must be true or false';
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

  /**
   * Check if an error is retryable
   * @param {Error} error - Error to check
   * @returns {boolean} True if retryable
   * @private
   */
  isRetryableError(error) {
    // Retry on rate limits, network errors, and server errors
    const retryableStatuses = [429, 500, 502, 503, 504];
    const retryableMessages = ['rate limit', 'timeout', 'network', 'connection'];
    if (error.response?.status && retryableStatuses.includes(error.response.status)) {
      return true;
    }
    if (error.message) {
      const lowerMessage = error.message.toLowerCase();
      return retryableMessages.some(msg => lowerMessage.includes(msg));
    }
    return false;
  }

  /**
   * Update user status (enable/disable)
   * @param {string} userId - The user ID
   * @param {boolean} enabled - Whether the user should be enabled
   * @returns {Promise<Object>} The API response
   */
  async updateUserStatus(userId, enabled) {
    const settings = this.getSettings();
    const endpoint = `/environments/${settings.environmentId}/users/${userId}`;
    const updateData = {
      enabled: enabled
    };
    this.logger.info(`[STATUS] Updating user ${userId} status to enabled: ${enabled}`);
    try {
      const result = await this.request('PATCH', endpoint, updateData);
      this.logger.info(`[STATUS] Successfully updated user ${userId} status to enabled: ${enabled}`);
      return result;
    } catch (error) {
      this.logger.error(`[STATUS] Failed to update user ${userId} status:`, error);
      throw error;
    }
  }

  /**
   * Generate a secure random password
   * @returns {string} A random password
   * @private
   */
  generateTemporaryPassword() {
    const length = 16;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]\\:;?><,./-=';
    let password = 'Aa1!';

    // Fill the rest randomly
    for (let i = 0; i < length - 4; i++) {
      const randomIndex = Math.floor(Math.random() * charset.length);
      password += charset[randomIndex];
    }

    // Shuffle the password to make it more random
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * Delete users from PingOne based on CSV input (safe duplicate of deleteUsers)
   * @param {Array<Object>} users - Array of user objects to delete (must have username or email)
   * @param {Object} options - Delete options
   * @returns {Promise<Object>} Delete results
   */
  async deleteUsersFromCsv(users) {
    let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    const {
      onProgress,
      batchSize = 10,
      delayBetweenBatches = 1000
    } = options;
    const results = {
      total: users.length,
      success: 0,
      failed: 0,
      skipped: 0,
      details: []
    };

    // Process users in batches to avoid overwhelming the API
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);

      // Process users sequentially within each batch to avoid overwhelming the API
      for (let batchIndex = 0; batchIndex < batch.length; batchIndex++) {
        const user = batch[batchIndex];
        const userIndex = i + batchIndex;
        const current = userIndex + 1;
        try {
          // Minimal logging for user lookup
          this.logger.info(`[DELETE] Processing user ${current}/${users.length}: ${user.username || user.email || 'Unknown'}`);

          // Find user by userId, username, or email with enhanced fallback
          let existingUser = null;
          let lookupMethod = null;

          // First, try to find user by userId if provided (direct lookup)
          if (user.userId || user.id) {
            const userId = user.userId || user.id;
            try {
              const response = await this.request('GET', `/environments/${this.getSettings().environmentId}/users/${userId}`);
              existingUser = response;
              lookupMethod = 'userId';
              this.logger.info(`[DELETE] Found user by ID: "${userId}"`);
            } catch (error) {
              this.logger.debug(`[DELETE] User ID lookup failed for "${userId}": ${error.message}`);
            }
          }

          // If no user found by ID, try username (if provided)
          if (!existingUser && user.username) {
            try {
              const response = await this.request('GET', `/environments/${this.getSettings().environmentId}/users?filter=username eq "${encodeURIComponent(user.username)}"`);
              if (response._embedded && response._embedded.users && response._embedded.users.length > 0) {
                existingUser = response._embedded.users[0];
                lookupMethod = 'username';
                this.logger.info(`[DELETE] Found user by username: "${user.username}"`);
              } else {
                this.logger.debug(`[DELETE] No user found by username: "${user.username}"`);
              }
            } catch (error) {
              this.logger.debug(`[DELETE] Username lookup failed for "${user.username}": ${error.message}`);
            }
          }

          // If no user found by ID or username, try email (if provided)
          // NOTE: If username was found, we skip email lookup to avoid conflicts
          if (!existingUser && user.email) {
            try {
              const response = await this.request('GET', `/environments/${this.getSettings().environmentId}/users?filter=email eq "${encodeURIComponent(user.email)}"`);
              if (response._embedded && response._embedded.users && response._embedded.users.length > 0) {
                const emailUser = response._embedded.users[0];
                existingUser = emailUser;
                lookupMethod = 'email';
                this.logger.info(`[DELETE] Found user by email: "${user.email}"`);
              } else {
                this.logger.debug(`[DELETE] No user found by email: "${user.email}"`);
              }
            } catch (error) {
              this.logger.debug(`[DELETE] Email lookup failed for "${user.email}": ${error.message}`);
            }
          }
          if (!existingUser) {
            results.failed++;
            results.details.push({
              user,
              status: 'failed',
              reason: 'User not found in PingOne'
            });
            this.logger.warn(`[DELETE] User not found: ${user.username || user.email || 'Unknown'}`);
            continue;
          }

          // Log the user we're about to delete
          this.logger.info(`[DELETE] Deleting user found by ${lookupMethod}: ${existingUser.username || existingUser.email}`);

          // Delete the user
          await this.request('DELETE', `/environments/${this.getSettings().environmentId}/users/${existingUser.id}`);

          // Only increment success if the DELETE request succeeds
          results.success++;
          results.details.push({
            user,
            status: 'success',
            pingOneId: existingUser.id,
            lookupMethod: lookupMethod
          });
          this.logger.info(`[DELETE] Successfully deleted user: ${existingUser.username || existingUser.email}`);
        } catch (error) {
          // Check if this is a 404 error (user not found)
          if (error.status === 404 || error.message.includes('404') || error.message.includes('not found')) {
            results.skipped++;
            results.details.push({
              user,
              status: 'skipped',
              reason: 'User not found (404)'
            });
            this.logger.warn(`[DELETE] User '${user.username || user.email}' not found in PingOne (404). Skipping.`);
          } else if (error.status === 429) {
            // Rate limit error - retry this user later
            results.failed++;
            results.details.push({
              user,
              status: 'failed',
              error: 'Rate limited - will retry automatically'
            });
            this.logger.warn(`[DELETE] Rate limited while processing user '${user.username || user.email}'. Will retry.`);
            throw error; // Re-throw to trigger retry logic
          } else {
            results.failed++;
            results.details.push({
              user,
              status: 'failed',
              error: error.message
            });
            this.logger.error(`[DELETE] Failed to delete user '${user.username || user.email}': ${error.message}`);
          }
        }

        // Update progress for each user
        if (onProgress) {
          onProgress({
            current,
            total: users.length,
            success: results.success,
            failed: results.failed,
            skipped: results.skipped
          });
        }

        // Add small delay between individual user operations to prevent rate limiting
        if (batchIndex < batch.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay between users
        }
      }

      // Add delay between batches to avoid rate limiting
      if (i + batchSize < users.length && delayBetweenBatches > 0) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }

      // Log batch completion
      this.logger.info(`[DELETE] Completed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(users.length / batchSize)}`);
    }
    return results;
  }

  /**
   * Delete a user by ID
   * @param {string} userId - User ID to delete
   * @returns {Promise<void>}
   */
  async deleteUser(userId) {
    let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    if (!userId) {
      throw new Error('User ID is required for deletion');
    }
    if (options.signal && options.signal.aborted) {
      throw new DOMException('User delete aborted', 'AbortError');
    }
    try {
      const endpoint = `/environments/${this.getSettings().environmentId}/users/${userId}`;
      this.logger.info(`[DELETE] Deleting user with ID: ${userId}`);
      this.logger.debug(`[DELETE] Making DELETE request to: ${endpoint}`);
      await this.request('DELETE', endpoint, null, options);
      this.logger.info(`[DELETE] Successfully deleted user: ${userId}`);
    } catch (error) {
      if (options.signal && options.signal.aborted) {
        throw new DOMException('User delete aborted', 'AbortError');
      }
      this.logger.error(`[DELETE] Failed to delete user ${userId}:`, {
        error: error.message,
        status: error.status,
        statusText: error.statusText,
        response: error.response?.data
      });
      throw error;
    }
  }
  async modifyUsersFromCsv(users) {
    let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    const {
      onProgress,
      batchSize = 5,
      delayBetweenBatches = 2000,
      createIfNotExists = false,
      updateUserStatus = false,
      defaultPopulationId = '',
      defaultEnabled = true,
      generatePasswords = true
    } = options;
    const results = {
      total: users.length,
      modified: 0,
      created: 0,
      failed: 0,
      skipped: 0,
      noChanges: 0,
      details: []
    };

    // Process users in batches to avoid overwhelming the API
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);

      // Process users sequentially within each batch to avoid overwhelming the API
      for (let batchIndex = 0; batchIndex < batch.length; batchIndex++) {
        const user = batch[batchIndex];
        const userIndex = i + batchIndex;
        const current = userIndex + 1;
        try {
          // Enhanced logging for user lookup
          this.logger.info(`[MODIFY] Processing user ${current}/${users.length}:`, {
            userId: user.userId || user.id || 'NOT_PROVIDED',
            username: user.username || 'NOT_PROVIDED',
            email: user.email || 'NOT_PROVIDED',
            rawUserData: user
          });

          // Find user by userId, username, or email with enhanced fallback
          let existingUser = null;
          let lookupMethod = null;

          // First, try to find user by userId if provided (direct lookup)
          if (user.userId || user.id) {
            const userId = user.userId || user.id;
            try {
              this.logger.debug(`[MODIFY] Looking up user by ID: "${userId}"`);
              const response = await this.request('GET', `/environments/${this.getSettings().environmentId}/users/${userId}`);
              existingUser = response;
              lookupMethod = 'userId';
              this.logger.info(`[MODIFY] Found user by ID: "${userId}" -> ID: ${existingUser.id}`);
            } catch (error) {
              this.logger.debug(`[MODIFY] Error looking up user by ID "${userId}":`, error.message);
            }
          }

          // If no user found by ID, try username (if provided)
          if (!existingUser && user.username) {
            try {
              this.logger.debug(`[MODIFY] Looking up user by username: "${user.username}"`);
              const response = await this.request('GET', `/environments/${this.getSettings().environmentId}/users?filter=username eq "${encodeURIComponent(user.username)}"`);
              if (response._embedded && response._embedded.users && response._embedded.users.length > 0) {
                existingUser = response._embedded.users[0];
                lookupMethod = 'username';
                this.logger.info(`[MODIFY] Found user by username: "${user.username}" -> ID: ${existingUser.id}`);
              } else {
                this.logger.debug(`[MODIFY] No user found by username: "${user.username}"`);
              }
            } catch (error) {
              this.logger.debug(`[MODIFY] Error looking up user by username "${user.username}":`, error.message);
            }
          }

          // If no user found by ID or username, try email (if provided)
          if (!existingUser && user.email) {
            try {
              this.logger.debug(`[MODIFY] Looking up user by email: "${user.email}"`);
              const response = await this.request('GET', `/environments/${this.getSettings().environmentId}/users?filter=email eq "${encodeURIComponent(user.email)}"`);
              if (response._embedded && response._embedded.users && response._embedded.users.length > 0) {
                const emailUser = response._embedded.users[0];

                // If we already found a user by username, check if it's the same user
                if (existingUser) {
                  if (existingUser.id === emailUser.id) {
                    this.logger.info(`[MODIFY] Email lookup confirmed same user: "${user.email}" -> ID: ${emailUser.id}`);
                  } else {
                    this.logger.warn(`[MODIFY] Found different users by username and email! Username: "${user.username}" -> ID: ${existingUser.id}, Email: "${user.email}" -> ID: ${emailUser.id}`);
                    // Use the email user as it might be more reliable
                    existingUser = emailUser;
                    lookupMethod = 'email';
                  }
                } else {
                  existingUser = emailUser;
                  lookupMethod = 'email';
                  this.logger.info(`[MODIFY] Found user by email: "${user.email}" -> ID: ${existingUser.id}`);
                }
              } else {
                this.logger.debug(`[MODIFY] No user found by email: "${user.email}"`);
              }
            } catch (error) {
              this.logger.debug(`[MODIFY] Error looking up user by email "${user.email}":`, error.message);
            }
          }

          // If user not found and createIfNotExists is enabled, create the user
          if (!existingUser && createIfNotExists) {
            try {
              this.logger.info(`[MODIFY] User not found, creating new user: ${user.username || user.email}`);

              // Prepare user data for creation (without enabled field)
              const userData = {
                name: {
                  given: user.firstName || user.givenName || '',
                  family: user.lastName || user.familyName || ''
                },
                email: user.email,
                username: user.username || user.email,
                population: {
                  id: user.populationId || defaultPopulationId || this.getSettings().populationId
                }
              };

              // Determine if user should be enabled (for later status update)
              let userEnabledStatus = defaultEnabled;
              if (user.enabled !== undefined) {
                if (typeof user.enabled === 'string') {
                  userEnabledStatus = user.enabled.toLowerCase() === 'true' || user.enabled === '1';
                } else {
                  userEnabledStatus = user.enabled;
                }
              }

              // Add password if generatePasswords is enabled
              if (generatePasswords) {
                userData.password = {
                  value: this.generateTemporaryPassword()
                };
              }

              // Create the user
              const createdUser = await this.request('POST', `/environments/${this.getSettings().environmentId}/users`, userData);

              // After creation, update status if needed
              if (userEnabledStatus === false) {
                try {
                  await this.updateUserStatus(createdUser.id, false);
                  this.logger.info(`[MODIFY] Disabled user after creation: ${createdUser.username || createdUser.email} (ID: ${createdUser.id})`);
                } catch (statusErr) {
                  this.logger.warn(`[MODIFY] Failed to disable user after creation: ${createdUser.username || createdUser.email} (ID: ${createdUser.id})`, statusErr);
                }
              }
              results.created++;
              results.details.push({
                user,
                status: 'created',
                pingOneId: createdUser.id,
                reason: 'User created because createIfNotExists was enabled'
              });
              this.logger.info(`[MODIFY] Successfully created user: ${createdUser.username || createdUser.email} (ID: ${createdUser.id})`);

              // Update progress
              if (onProgress) {
                onProgress({
                  current,
                  total: users.length,
                  modified: results.modified,
                  created: results.created,
                  failed: results.failed,
                  skipped: results.skipped,
                  noChanges: results.noChanges
                });
              }
              return;
            } catch (error) {
              this.logger.error(`[MODIFY] Failed to create user ${user.username || user.email}:`, error.message);
              results.failed++;
              results.details.push({
                user,
                status: 'failed',
                error: `Failed to create user: ${error.message}`,
                reason: 'User creation failed'
              });
              return;
            }
          }

          // If user not found and createIfNotExists is disabled, skip the user
          if (!existingUser) {
            results.skipped++;
            results.details.push({
              user,
              status: 'skipped',
              reason: 'User not found and createIfNotExists is disabled'
            });
            this.logger.warn(`[MODIFY] User not found: ${user.username || user.email}. Skipping (createIfNotExists: ${createIfNotExists})`);
            return;
          }

          // Log the user we're about to modify
          this.logger.info(`[MODIFY] Modifying user found by ${lookupMethod}:`, {
            username: existingUser.username,
            email: existingUser.email,
            id: existingUser.id,
            originalLookup: {
              username: user.username,
              email: user.email
            }
          });

          // Compare CSV data with existing user data
          const changes = {};
          let hasChanges = false;

          // Map CSV fields to PingOne API fields
          const fieldMappings = {
            firstName: 'name.given',
            lastName: 'name.family',
            givenName: 'name.given',
            familyName: 'name.family',
            email: 'email',
            phoneNumber: 'phoneNumber',
            title: 'title',
            department: 'department'
          };

          // Add enabled field to mappings if updateUserStatus is enabled
          if (updateUserStatus) {
            fieldMappings.enabled = 'enabled';
          }

          // Check each field for changes with proper mapping
          for (const [csvField, apiField] of Object.entries(fieldMappings)) {
            if (user[csvField] !== undefined) {
              // Handle nested name fields
              if (apiField.startsWith('name.')) {
                const nameField = apiField.split('.')[1]; // 'given' or 'family'
                if (!changes.name) {
                  changes.name = {
                    ...existingUser.name
                  };
                }
                if (user[csvField] !== existingUser.name?.[nameField]) {
                  changes.name[nameField] = user[csvField];
                  hasChanges = true;
                  this.logger.debug(`[MODIFY] Name field "${nameField}" will be changed from "${existingUser.name?.[nameField]}" to "${user[csvField]}"`);
                }
              } else {
                // Handle regular fields
                if (user[csvField] !== existingUser[apiField]) {
                  changes[apiField] = user[csvField];
                  hasChanges = true;
                  this.logger.debug(`[MODIFY] Field "${apiField}" will be changed from "${existingUser[apiField]}" to "${user[csvField]}"`);
                }
              }
            }
          }

          // Check for enabled status updates if updateUserStatus is enabled
          let enabledStatusToUpdate = null;
          if (updateUserStatus && user.enabled !== undefined && user.enabled !== existingUser.enabled) {
            // Convert string values to boolean if needed
            let newEnabledValue = user.enabled;
            if (typeof newEnabledValue === 'string') {
              newEnabledValue = newEnabledValue.toLowerCase() === 'true' || newEnabledValue === '1';
            }
            if (newEnabledValue !== existingUser.enabled) {
              enabledStatusToUpdate = newEnabledValue;
              this.logger.debug(`[MODIFY] Enabled status will be changed from "${existingUser.enabled}" to "${newEnabledValue}"`);
            }
          } else if (!updateUserStatus && user.enabled !== undefined && user.enabled !== existingUser.enabled) {
            // Show warning only if updateUserStatus is not enabled
            this.logger.warn(`[MODIFY] Cannot modify 'enabled' status for user ${existingUser.username} - updateUserStatus option is disabled`);
            if (window.app && window.app.uiManager) {
              window.app.uiManager.showWarning(`Cannot modify 'enabled' status for user ${existingUser.username} - updateUserStatus option is disabled`);
            }
          }

          // Remove enabled from changes if present
          if (changes.enabled !== undefined) {
            delete changes.enabled;
          }

          // For PingOne API, we need to include required fields in the update
          // Always include username and email as they are required
          if (hasChanges) {
            changes.username = existingUser.username;
            changes.email = existingUser.email;
            this.logger.debug(`[MODIFY] Including required fields: username=${existingUser.username}, email=${existingUser.email}`);
          }
          if (!hasChanges && enabledStatusToUpdate === null) {
            results.noChanges++;
            results.details.push({
              user,
              status: 'no_changes',
              pingOneId: existingUser.id,
              lookupMethod: lookupMethod
            });
            this.logger.info(`[MODIFY] No changes needed for user: ${existingUser.username || existingUser.email} (ID: ${existingUser.id})`);
            return;
          }
          this.logger.info(`[MODIFY] Applying changes to user:`, {
            userId: existingUser.id,
            changes: changes
          });

          // Update the user with changes if there are any
          if (hasChanges) {
            await this.request('PUT', `/environments/${this.getSettings().environmentId}/users/${existingUser.id}`, changes);
          }

          // Update enabled status if needed
          if (enabledStatusToUpdate !== null) {
            try {
              await this.updateUserStatus(existingUser.id, enabledStatusToUpdate);
              this.logger.info(`[MODIFY] Updated enabled status for user: ${existingUser.username || existingUser.email} (ID: ${existingUser.id}) to ${enabledStatusToUpdate}`);
            } catch (statusErr) {
              this.logger.warn(`[MODIFY] Failed to update enabled status for user: ${existingUser.username || existingUser.email} (ID: ${existingUser.id})`, statusErr);
            }
          }
          results.modified++;
          results.details.push({
            user,
            status: 'modified',
            pingOneId: existingUser.id,
            changes,
            lookupMethod: lookupMethod
          });
          this.logger.info(`[MODIFY] Successfully modified user: ${existingUser.username || existingUser.email} (ID: ${existingUser.id}) with changes:`, changes);
        } catch (error) {
          // Get friendly error message if available
          const friendlyMessage = error.friendlyMessage || error.message;

          // Check if this is a 404 error (user not found)
          if (error.status === 404 || error.message.includes('404') || error.message.includes('not found')) {
            results.skipped++;
            results.details.push({
              user,
              status: 'skipped',
              reason: 'User not found (404)'
            });
            this.logger.warn(`[MODIFY] User '${user.username || user.email}' not found in PingOne (404). Skipping this user.`);
          } else {
            results.failed++;

            // Provide more context for different error types
            let errorReason = friendlyMessage;
            if (error.status === 400) {
              errorReason = `Data validation failed: ${friendlyMessage}`;
            } else if (error.status === 429) {
              errorReason = `Rate limited: ${friendlyMessage}`;
            } else if (error.status === 403) {
              errorReason = `Permission denied: ${friendlyMessage}`;
            }
            results.details.push({
              user,
              status: 'failed',
              error: errorReason,
              statusCode: error.status
            });
            this.logger.error(`[MODIFY] Failed to modify user '${user.username || user.email}': ${errorReason}`);

            // Show user-friendly error in UI for specific error types
            if (window.app && window.app.uiManager && (error.status === 400 || error.status === 403)) {
              window.app.uiManager.showWarning(`User '${user.username || user.email}': ${friendlyMessage}`);
            }
          }
        }

        // Update progress for each user
        if (onProgress) {
          onProgress({
            current,
            total: users.length,
            modified: results.modified,
            failed: results.failed,
            skipped: results.skipped,
            noChanges: results.noChanges
          });
        }

        // Process users sequentially within each batch to avoid overwhelming the API
        for (let batchIndex = 0; batchIndex < batch.length; batchIndex++) {
          const user = batch[batchIndex];
          const userIndex = i + batchIndex;
          const current = userIndex + 1;
          try {
            // Enhanced logging for user lookup
            this.logger.info(`[MODIFY] Processing user ${current}/${users.length}:`, {
              userId: user.userId || user.id || 'NOT_PROVIDED',
              username: user.username || 'NOT_PROVIDED',
              email: user.email || 'NOT_PROVIDED',
              rawUserData: user
            });

            // Find user by userId, username, or email with enhanced fallback
            let existingUser = null;
            let lookupMethod = null;

            // First, try to find user by userId if provided (direct lookup)
            if (user.userId || user.id) {
              const userId = user.userId || user.id;
              try {
                this.logger.debug(`[MODIFY] Looking up user by ID: "${userId}"`);
                const response = await this.request('GET', `/environments/${this.getSettings().environmentId}/users/${userId}`);
                existingUser = response;
                lookupMethod = 'userId';
                this.logger.info(`[MODIFY] Found user by ID: "${userId}" -> ID: ${existingUser.id}`);
              } catch (error) {
                this.logger.debug(`[MODIFY] Error looking up user by ID "${userId}":`, error.message);
              }
            }

            // If no user found by ID, try username (if provided)
            if (!existingUser && user.username) {
              try {
                this.logger.debug(`[MODIFY] Looking up user by username: "${user.username}"`);
                const response = await this.request('GET', `/environments/${this.getSettings().environmentId}/users?filter=username eq "${encodeURIComponent(user.username)}"`);
                if (response._embedded && response._embedded.users && response._embedded.users.length > 0) {
                  existingUser = response._embedded.users[0];
                  lookupMethod = 'username';
                  this.logger.info(`[MODIFY] Found user by username: "${user.username}" -> ID: ${existingUser.id}`);
                } else {
                  this.logger.debug(`[MODIFY] No user found by username: "${user.username}"`);
                }
              } catch (error) {
                this.logger.debug(`[MODIFY] Error looking up user by username "${user.username}":`, error.message);
              }
            }

            // If no user found by ID or username, try email (if provided)
            if (!existingUser && user.email) {
              try {
                this.logger.debug(`[MODIFY] Looking up user by email: "${user.email}"`);
                const response = await this.request('GET', `/environments/${this.getSettings().environmentId}/users?filter=email eq "${encodeURIComponent(user.email)}"`);
                if (response._embedded && response._embedded.users && response._embedded.users.length > 0) {
                  const emailUser = response._embedded.users[0];

                  // If we already found a user by username, check if it's the same user
                  if (existingUser) {
                    if (existingUser.id === emailUser.id) {
                      this.logger.info(`[MODIFY] Email lookup confirmed same user: "${user.email}" -> ID: ${emailUser.id}`);
                    } else {
                      this.logger.warn(`[MODIFY] Found different users by username and email! Username: "${user.username}" -> ID: ${existingUser.id}, Email: "${user.email}" -> ID: ${emailUser.id}`);
                      // Use the email user as it might be more reliable
                      existingUser = emailUser;
                      lookupMethod = 'email';
                    }
                  } else {
                    existingUser = emailUser;
                    lookupMethod = 'email';
                    this.logger.info(`[MODIFY] Found user by email: "${user.email}" -> ID: ${existingUser.id}`);
                  }
                } else {
                  this.logger.debug(`[MODIFY] No user found by email: "${user.email}"`);
                }
              } catch (error) {
                this.logger.debug(`[MODIFY] Error looking up user by email "${user.email}":`, error.message);
              }
            }

            // If user not found and createIfNotExists is enabled, create the user
            if (!existingUser && createIfNotExists) {
              try {
                this.logger.info(`[MODIFY] User not found, creating new user: ${user.username || user.email}`);

                // Prepare user data for creation (without enabled field)
                const userData = {
                  name: {
                    given: user.firstName || user.givenName || '',
                    family: user.lastName || user.familyName || ''
                  },
                  email: user.email,
                  username: user.username || user.email,
                  population: {
                    id: user.populationId || defaultPopulationId || this.getSettings().populationId
                  }
                };

                // Determine if user should be enabled (for later status update)
                let userEnabledStatus = defaultEnabled;
                if (user.enabled !== undefined) {
                  if (typeof user.enabled === 'string') {
                    userEnabledStatus = user.enabled.toLowerCase() === 'true' || user.enabled === '1';
                  } else {
                    userEnabledStatus = user.enabled;
                  }
                }

                // Add password if generatePasswords is enabled
                if (generatePasswords) {
                  userData.password = {
                    value: this.generateTemporaryPassword()
                  };
                }

                // Create the user
                const createdUser = await this.request('POST', `/environments/${this.getSettings().environmentId}/users`, userData);

                // After creation, update status if needed
                if (userEnabledStatus === false) {
                  try {
                    await this.updateUserStatus(createdUser.id, false);
                    this.logger.info(`[MODIFY] Disabled user after creation: ${createdUser.username || createdUser.email} (ID: ${createdUser.id})`);
                  } catch (statusErr) {
                    this.logger.warn(`[MODIFY] Failed to disable user after creation: ${createdUser.username || createdUser.email} (ID: ${createdUser.id})`, statusErr);
                  }
                }
                results.created++;
                results.details.push({
                  user,
                  status: 'created',
                  pingOneId: createdUser.id,
                  reason: 'User created because createIfNotExists was enabled'
                });
                this.logger.info(`[MODIFY] Successfully created user: ${createdUser.username || createdUser.email} (ID: ${createdUser.id})`);

                // Update progress
                if (onProgress) {
                  onProgress({
                    current,
                    total: users.length,
                    modified: results.modified,
                    created: results.created,
                    failed: results.failed,
                    skipped: results.skipped,
                    noChanges: results.noChanges
                  });
                }
                continue;
              } catch (error) {
                this.logger.error(`[MODIFY] Failed to create user ${user.username || user.email}:`, error.message);
                results.failed++;
                results.details.push({
                  user,
                  status: 'failed',
                  error: `Failed to create user: ${error.message}`,
                  reason: 'User creation failed'
                });
                continue;
              }
            }

            // If user not found and createIfNotExists is disabled, skip the user
            if (!existingUser) {
              results.skipped++;
              results.details.push({
                user,
                status: 'skipped',
                reason: 'User not found and createIfNotExists is disabled'
              });
              this.logger.warn(`[MODIFY] User not found: ${user.username || user.email}. Skipping (createIfNotExists: ${createIfNotExists})`);
              continue;
            }

            // Log the user we're about to modify
            this.logger.info(`[MODIFY] Modifying user found by ${lookupMethod}:`, {
              username: existingUser.username,
              email: existingUser.email,
              id: existingUser.id,
              originalLookup: {
                username: user.username,
                email: user.email
              }
            });

            // Compare CSV data with existing user data
            const changes = {};
            let hasChanges = false;

            // Map CSV fields to PingOne API fields
            const fieldMappings = {
              firstName: 'name.given',
              lastName: 'name.family',
              givenName: 'name.given',
              familyName: 'name.family',
              email: 'email',
              phoneNumber: 'phoneNumber',
              title: 'title',
              department: 'department'
            };

            // Add enabled field to mappings if updateUserStatus is enabled
            if (updateUserStatus) {
              fieldMappings.enabled = 'enabled';
            }

            // Check each field for changes
            Object.keys(fieldMappings).forEach(csvField => {
              if (user[csvField] !== undefined && user[csvField] !== null && user[csvField] !== '') {
                const apiField = fieldMappings[csvField];
                const currentValue = this.getNestedValue(existingUser, apiField);
                const newValue = user[csvField];
                if (currentValue !== newValue) {
                  this.setNestedValue(changes, apiField, newValue);
                  hasChanges = true;
                  this.logger.debug(`[MODIFY] Field "${csvField}" changed: "${currentValue}" -> "${newValue}"`);
                }
              }
            });

            // If no changes detected, skip the user
            if (!hasChanges) {
              results.noChanges++;
              results.details.push({
                user,
                status: 'no_changes',
                reason: 'No changes detected'
              });
              this.logger.info(`[MODIFY] No changes detected for user: ${user.username || user.email}`);

              // Update progress
              if (onProgress) {
                onProgress({
                  current,
                  total: users.length,
                  modified: results.modified,
                  created: results.created,
                  failed: results.failed,
                  skipped: results.skipped,
                  noChanges: results.noChanges
                });
              }
              continue;
            }

            // Update the user with changes
            try {
              this.logger.info(`[MODIFY] Updating user ${existingUser.id} with changes:`, changes);
              const updatedUser = await this.request('PUT', `/environments/${this.getSettings().environmentId}/users/${existingUser.id}`, changes);
              results.modified++;
              results.details.push({
                user,
                status: 'modified',
                pingOneId: updatedUser.id,
                changes: changes
              });
              this.logger.info(`[MODIFY] Successfully modified user: ${updatedUser.username || updatedUser.email} (ID: ${updatedUser.id})`);
            } catch (error) {
              // Get friendly error message if available
              const friendlyMessage = error.friendlyMessage || error.message;

              // Check if this is a 404 error (user not found)
              if (error.status === 404 || error.message.includes('404') || error.message.includes('not found')) {
                results.skipped++;
                results.details.push({
                  user,
                  status: 'skipped',
                  reason: 'User not found (404)'
                });
                this.logger.warn(`[MODIFY] User '${user.username || user.email}' not found in PingOne (404). Skipping this user.`);
              } else {
                results.failed++;

                // Provide more context for different error types
                let errorReason = friendlyMessage;
                if (error.status === 400) {
                  errorReason = `Data validation failed: ${friendlyMessage}`;
                } else if (error.status === 429) {
                  errorReason = `Rate limited: ${friendlyMessage}`;
                } else if (error.status === 403) {
                  errorReason = `Permission denied: ${friendlyMessage}`;
                }
                results.details.push({
                  user,
                  status: 'failed',
                  error: errorReason,
                  statusCode: error.status
                });
                this.logger.error(`[MODIFY] Failed to modify user '${user.username || user.email}': ${errorReason}`);

                // Show user-friendly error in UI for specific error types
                if (window.app && window.app.uiManager && (error.status === 400 || error.status === 403)) {
                  window.app.uiManager.showWarning(`User '${user.username || user.email}': ${friendlyMessage}`);
                }
              }
            }

            // Update progress for each user
            if (onProgress) {
              onProgress({
                current,
                total: users.length,
                modified: results.modified,
                failed: results.failed,
                skipped: results.skipped,
                noChanges: results.noChanges
              });
            }

            // Add small delay between individual user operations to prevent rate limiting
            if (batchIndex < batch.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay between users
            }
          } catch (error) {
            this.logger.error(`[MODIFY] Unexpected error processing user ${user.username || user.email}:`, error.message);
            results.failed++;
            results.details.push({
              user,
              status: 'failed',
              error: error.message,
              reason: 'Unexpected error'
            });
          }
        }

        // Add delay between batches to avoid rate limiting
        if (i + batchSize < users.length && delayBetweenBatches > 0) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }

        // Log batch completion
        this.logger.info(`[MODIFY] Completed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(users.length / batchSize)}`);
      }
      return results;
    }

    /**
     * Fetch all users in a specific population (paginated)
     * @param {string} populationId - The population ID
     * @returns {Promise<Array>} Array of user objects
     */
    return results;
  }

  /**
   * Fetch all users in a specific population (paginated)
   * @param {string} populationId - The population ID
   * @returns {Promise<Array>} Array of user objects
   */
  async getAllUsersInPopulation(populationId) {
    const settings = this.getSettings();
    const users = [];
    let page = 1;
    const pageSize = 100;
    const maxPages = 1000;
    let fetched = 0;
    do {
      if (page > maxPages) break;
      try {
        const resp = await this.request('GET', `/environments/${settings.environmentId}/users?limit=${pageSize}&page=${page}&filter=population.id eq "${populationId}"`);
        if (resp && resp._embedded && resp._embedded.users && Array.isArray(resp._embedded.users)) {
          const pageUsers = resp._embedded.users;
          fetched = pageUsers.length;
          if (fetched > 0) users.push(...pageUsers);
        } else {
          break;
        }
      } catch (error) {
        break;
      }
      page++;
    } while (fetched > 0 && page <= maxPages);
    return users;
  }

  /**
   * Fetch all users in a specific population using search-like filtering (alternative to pagination)
   * @param {string} populationId - The population ID
   * @returns {Promise<Array>} Array of user objects
   */
  async getAllUsersInPopulationUsingSearch(populationId) {
    const settings = this.getSettings();
    this.logger.info(`[SEARCH-FILTER] Starting filter-based fetch for population: ${populationId}`);
    try {
      // Use the standard users endpoint with a filter parameter instead of search endpoint
      const response = await this.request('GET', `/environments/${settings.environmentId}/users?filter=population.id eq "${populationId}"&limit=1000`);
      if (response && response._embedded && response._embedded.users && Array.isArray(response._embedded.users)) {
        const users = response._embedded.users;
        this.logger.info(`[SEARCH-FILTER] Found ${users.length} users via filter for population ${populationId}`);
        return users;
      } else {
        this.logger.warn(`[SEARCH-FILTER] Invalid response structure for population ${populationId}`);
        return [];
      }
    } catch (error) {
      this.logger.error(`[SEARCH-FILTER] Error filtering users for population ${populationId}:`, error);
      return [];
    }
  }

  /**
   * Fetch all users in a specific population using offset-based approach (alternative to page-based)
   * @param {string} populationId - The population ID
   * @returns {Promise<Array>} Array of user objects
   */
  async getAllUsersInPopulationUsingOffset(populationId) {
    const settings = this.getSettings();
    const users = [];
    let offset = 0;
    const limit = 100;
    const maxUsers = 5000; // Reduced safety limit
    let fetched = 0;
    this.logger.info(`[OFFSET] Starting offset-based fetch for population: ${populationId}`);
    do {
      // Safety check to prevent infinite loops
      if (users.length >= maxUsers) {
        this.logger.warn(`[OFFSET] Reached maximum user limit (${maxUsers}) for population ${populationId}. Stopping fetch.`);
        break;
      }
      try {
        // Use limit and skip instead of offset (some APIs prefer skip) with proper filter format
        const resp = await this.request('GET', `/environments/${settings.environmentId}/users?limit=${limit}&skip=${offset}&filter=population.id eq "${populationId}"`);
        if (resp && resp._embedded && resp._embedded.users && Array.isArray(resp._embedded.users)) {
          const offsetUsers = resp._embedded.users;
          fetched = offsetUsers.length;
          if (fetched > 0) {
            users.push(...offsetUsers);
            this.logger.debug(`[OFFSET] Skip ${offset}: fetched ${fetched} users, total so far: ${users.length}`);
            offset += fetched; // Move offset by actual fetched count
          } else {
            this.logger.debug(`[OFFSET] No more users returned at offset ${offset}, stopping`);
            break;
          }
        } else {
          this.logger.warn(`[OFFSET] Invalid response structure at offset ${offset} for population ${populationId}`);
          break;
        }
      } catch (error) {
        this.logger.error(`[OFFSET] Error fetching at offset ${offset} for population ${populationId}:`, error);
        break;
      }

      // Add small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (fetched > 0);
    this.logger.info(`[OFFSET] Finished offset-based fetch for population ${populationId}: ${users.length} users total`);
    return users;
  }

  /**
   * Fetch all users in a specific population using single large request (no pagination)
   * @param {string} populationId - The population ID
   * @returns {Promise<Array>} Array of user objects
   */
  async getAllUsersInPopulationSingleRequest(populationId) {
    const settings = this.getSettings();
    this.logger.info(`[SINGLE] Starting single request fetch for population: ${populationId}`);
    try {
      // Try with a more reasonable limit first (1000) with proper filter format
      const resp = await this.request('GET', `/environments/${settings.environmentId}/users?limit=1000&filter=population.id eq "${populationId}"`);
      if (resp && resp._embedded && resp._embedded.users && Array.isArray(resp._embedded.users)) {
        const users = resp._embedded.users;
        this.logger.info(`[SINGLE] Found ${users.length} users in single request for population ${populationId}`);

        // Check if we might have hit the limit (indicating there could be more)
        if (users.length === 1000) {
          this.logger.warn(`[SINGLE] Hit limit of 1000 users - there may be more users not fetched`);
        }
        return users;
      } else {
        this.logger.warn(`[SINGLE] Invalid response structure for population ${populationId}`);
        return [];
      }
    } catch (error) {
      this.logger.error(`[SINGLE] Error in single request for population ${populationId}:`, error);
      return [];
    }
  }

  /**
   * Fetch all users in a specific population using the most reliable method
   * This tries multiple approaches in order of preference
   * @param {string} populationId - The population ID
   * @returns {Promise<Array>} Array of user objects
   */
  async getAllUsersInPopulationReliable(populationId) {
    this.logger.info(`[RELIABLE] Starting reliable fetch for population: ${populationId}`);

    // Method 1: Try the original working method first
    try {
      const originalUsers = await this.getUsersByPopulation(populationId);
      if (originalUsers.length > 0) {
        this.logger.info(`[RELIABLE] Successfully used original method: ${originalUsers.length} users`);
        return originalUsers;
      }
    } catch (error) {
      this.logger.warn(`[RELIABLE] Original method failed:`, error.message);
    }

    // Method 2: Try filter-based approach
    try {
      const filterUsers = await this.getAllUsersInPopulationUsingSearch(populationId);
      if (filterUsers.length > 0) {
        this.logger.info(`[RELIABLE] Successfully used filter method: ${filterUsers.length} users`);
        return filterUsers;
      }
    } catch (error) {
      this.logger.warn(`[RELIABLE] Filter method failed:`, error.message);
    }

    // Method 3: Try single large request with smaller limit
    try {
      const singleUsers = await this.getAllUsersInPopulationSingleRequest(populationId);
      if (singleUsers.length > 0) {
        this.logger.info(`[RELIABLE] Successfully used single request method: ${singleUsers.length} users`);
        return singleUsers;
      }
    } catch (error) {
      this.logger.warn(`[RELIABLE] Single request method failed:`, error.message);
    }

    // Method 4: Try offset-based approach
    try {
      const offsetUsers = await this.getAllUsersInPopulationUsingOffset(populationId);
      if (offsetUsers.length > 0) {
        this.logger.info(`[RELIABLE] Successfully used offset method: ${offsetUsers.length} users`);
        return offsetUsers;
      }
    } catch (error) {
      this.logger.warn(`[RELIABLE] Offset method failed:`, error.message);
    }

    // Method 5: Fall back to limited pagination as last resort
    this.logger.warn(`[RELIABLE] All alternative methods failed, falling back to limited pagination`);
    return await this.getAllUsersInPopulationLimited(populationId);
  }

  /**
   * Limited pagination approach with very strict controls
   * @param {string} populationId - The population ID
   * @returns {Promise<Array>} Array of user objects
   */
  async getAllUsersInPopulationLimited(populationId) {
    const settings = this.getSettings();
    const users = [];
    let page = 1;
    const pageSize = 50; // Smaller page size
    const maxPages = 20; // Much stricter limit
    let fetched = 0;
    let consecutiveEmptyPages = 0;
    this.logger.info(`[LIMITED] Starting limited pagination for population: ${populationId}`);
    do {
      // Multiple safety checks
      if (page > maxPages) {
        this.logger.warn(`[LIMITED] Reached maximum page limit (${maxPages})`);
        break;
      }
      if (consecutiveEmptyPages >= 3) {
        this.logger.warn(`[LIMITED] Too many consecutive empty pages, stopping`);
        break;
      }
      try {
        const resp = await this.request('GET', `/environments/${settings.environmentId}/users?limit=${pageSize}&page=${page}&filter=population.id eq "${populationId}"`);
        if (resp && resp._embedded && resp._embedded.users && Array.isArray(resp._embedded.users)) {
          const pageUsers = resp._embedded.users;
          fetched = pageUsers.length;
          if (fetched > 0) {
            users.push(...pageUsers);
            consecutiveEmptyPages = 0;
            this.logger.debug(`[LIMITED] Page ${page}: fetched ${fetched} users, total: ${users.length}`);
          } else {
            consecutiveEmptyPages++;
            this.logger.debug(`[LIMITED] Page ${page}: no users (consecutive empty: ${consecutiveEmptyPages})`);
          }
        } else {
          consecutiveEmptyPages++;
          this.logger.warn(`[LIMITED] Invalid response at page ${page}`);
        }
      } catch (error) {
        this.logger.error(`[LIMITED] Error at page ${page}:`, error);
        break;
      }
      page++;

      // Add small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (fetched > 0 && page <= maxPages && consecutiveEmptyPages < 3);
    this.logger.info(`[LIMITED] Finished limited pagination: ${users.length} users total (${page - 1} pages)`);
    return users;
  }

  /**
   * Fetch all users in a specific population using the correct API endpoint
   * @param {string} populationId - The population ID
   * @returns {Promise<Array>} Array of user objects
   */
  async getUsersByPopulation(populationId) {
    let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    const settings = this.getSettings();
    const users = [];
    let page = 1;
    const pageSize = 100;
    const maxPages = 1000; // Safety limit to prevent infinite loops
    let fetched = 0;
    this.logger.info(`[DELETE] Starting to fetch users for population: ${populationId}`);
    do {
      if (options.signal && options.signal.aborted) {
        throw new DOMException('Population fetch aborted', 'AbortError');
      }

      // Safety check to prevent infinite loops
      if (page > maxPages) {
        this.logger.warn(`[DELETE] Reached maximum page limit (${maxPages}) for population ${populationId}. Stopping fetch.`);
        break;
      }
      this.logger.debug(`[DELETE] Fetching page ${page} for population ${populationId}...`);
      try {
        // Use the general users endpoint with proper population filter format
        const resp = await this.request('GET', `/environments/${settings.environmentId}/users?limit=${pageSize}&page=${page}&filter=population.id eq "${populationId}"`, null, options);
        if (resp && resp._embedded && resp._embedded.users && Array.isArray(resp._embedded.users)) {
          const pageUsers = resp._embedded.users;
          fetched = pageUsers.length;
          if (fetched > 0) {
            users.push(...pageUsers);
            this.logger.debug(`[DELETE] Page ${page}: fetched ${fetched} users, total so far: ${users.length}`);

            // Log first few users for debugging
            if (page === 1) {
              this.logger.debug(`[DELETE] First page users:`, pageUsers.slice(0, 3).map(u => ({
                id: u.id,
                username: u.username,
                email: u.email
              })));
            }
          } else {
            this.logger.debug(`[DELETE] Page ${page}: no users returned, stopping pagination`);
          }
        } else {
          this.logger.warn(`[DELETE] Invalid response structure on page ${page} for population ${populationId}`);
          break;
        }
      } catch (error) {
        this.logger.error(`[DELETE] Error fetching page ${page} for population ${populationId}:`, error);
        break;
      }
      page++;
    } while (fetched > 0 && page <= maxPages);
    this.logger.info(`[DELETE] Finished fetching users for population ${populationId}: ${users.length} users total (${page - 1} pages)`);

    // Log summary of fetched users
    if (users.length > 0) {
      this.logger.debug(`[DELETE] User summary:`, {
        totalUsers: users.length,
        firstUser: {
          id: users[0].id,
          username: users[0].username,
          email: users[0].email
        },
        lastUser: {
          id: users[users.length - 1].id,
          username: users[users.length - 1].username,
          email: users[users.length - 1].email
        }
      });
    } else {
      this.logger.warn(`[DELETE] No users found in population ${populationId}`);
    }
    return users;
  }

  /**
   * Fetch all users in the environment (paginated)
   * @returns {Promise<Array>} Array of user objects
   */
  async getAllUsersInEnvironment() {
    const settings = this.getSettings();
    const users = [];
    let page = 1;
    const pageSize = 100;
    let total = 0;
    let fetched = 0;
    do {
      const resp = await this.request('GET', `/environments/${settings.environmentId}/users?limit=${pageSize}&page=${page}`);
      if (resp._embedded && resp._embedded.users) {
        users.push(...resp._embedded.users);
        fetched = resp._embedded.users.length;
        total = resp.page && resp.page.totalElements ? resp.page.totalElements : users.length;
      } else {
        break;
      }
      page++;
    } while (users.length < total && fetched > 0);
    return users;
  }

  /**
   * Helper to get a nested value from an object using dot notation (e.g., 'name.given')
   */
  getNestedValue(obj, path) {
    if (!obj || !path) return undefined;
    return path.split('.').reduce((acc, part) => acc && acc[part] !== undefined ? acc[part] : undefined, obj);
  }

  /**
   * Helper to set a nested value in an object using dot notation (e.g., 'name.given')
   */
  setNestedValue(obj, path, value) {
    if (!obj || !path) return;
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
  }
}
exports.PingOneClient = PingOneClient;

},{"./local-api.js":9}],12:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.settingsManager = exports.SettingsManager = void 0;
var _cryptoUtils = require("./crypto-utils.js");
// File: settings-manager.js
// Description: Application settings management with encryption support
// 
// This module handles all application configuration including:
// - Secure storage of API credentials and settings
// - Encryption/decryption of sensitive data
// - Settings validation and default values
// - Local storage management with fallbacks
// - Device-specific encryption keys
// 
// Provides a secure way to store and retrieve application settings.

/**
 * Settings Manager Class
 * 
 * Manages application settings with secure storage and encryption.
 * Handles API credentials, user preferences, and configuration data
 * with automatic encryption for sensitive information.
 * 
 * @param {Object} logger - Logger instance for debugging
 */
class SettingsManager {
  constructor(logger) {
    // Initialize settings with default values
    this.settings = this.getDefaultSettings();
    this.storageKey = 'pingone-import-settings';
    this.crypto = new _cryptoUtils.CryptoUtils();
    this.encryptionKey = null;

    // Initialize logger for debugging and error reporting
    this.initializeLogger(logger);

    // Encryption will be initialized in the init method
    this.encryptionInitialized = false;
  }

  /**
   * Initialize the settings manager
   */
  async init() {
    try {
      await this.initializeEncryption();
      this.encryptionInitialized = true;
      this.logger.info('Settings manager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize settings manager:', error);
      // Continue without encryption if it fails
      this.encryptionInitialized = false;
    }
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
      const safeLog = function (level, message) {
        const logFn = console[level] || console.log;
        try {
          for (var _len = arguments.length, args = new Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
            args[_key - 2] = arguments[_key];
          }
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
        debug: function (msg) {
          for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
            args[_key2 - 1] = arguments[_key2];
          }
          return safeLog('debug', msg, ...args);
        },
        log: function (msg) {
          for (var _len3 = arguments.length, args = new Array(_len3 > 1 ? _len3 - 1 : 0), _key3 = 1; _key3 < _len3; _key3++) {
            args[_key3 - 1] = arguments[_key3];
          }
          return safeLog('log', msg, ...args);
        },
        info: function (msg) {
          for (var _len4 = arguments.length, args = new Array(_len4 > 1 ? _len4 - 1 : 0), _key4 = 1; _key4 < _len4; _key4++) {
            args[_key4 - 1] = arguments[_key4];
          }
          return safeLog('info', msg, ...args);
        },
        warn: function (msg) {
          for (var _len5 = arguments.length, args = new Array(_len5 > 1 ? _len5 - 1 : 0), _key5 = 1; _key5 < _len5; _key5++) {
            args[_key5 - 1] = arguments[_key5];
          }
          return safeLog('warn', msg, ...args);
        },
        error: function (msg) {
          for (var _len6 = arguments.length, args = new Array(_len6 > 1 ? _len6 - 1 : 0), _key6 = 1; _key6 < _len6; _key6++) {
            args[_key6 - 1] = arguments[_key6];
          }
          return safeLog('error', msg, ...args);
        }
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
      this.encryptionKey = await _cryptoUtils.CryptoUtils.generateKey(deviceId);
    } catch (error) {
      this.logger.error('Failed to initialize encryption:', error);
      // Fallback to a less secure but functional approach
      this.encryptionKey = await _cryptoUtils.CryptoUtils.generateKey('fallback-encryption-key');
    }
  }

  /**
   * Generate a device ID based on browser and system information
   * @returns {Promise<string>} A unique device ID
   */
  async getDeviceId() {
    try {
      // Try to get a stored device ID first
      if (this.isLocalStorageAvailable()) {
        const storedDeviceId = localStorage.getItem('pingone-device-id');
        if (storedDeviceId) {
          return storedDeviceId;
        }
      }

      // Generate a new device ID based on stable browser characteristics
      const navigatorInfo = {
        platform: navigator.platform,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: navigator.deviceMemory,
        maxTouchPoints: navigator.maxTouchPoints,
        language: navigator.language,
        languages: navigator.languages ? navigator.languages.slice(0, 3).join(',') : '',
        userAgent: navigator.userAgent ? navigator.userAgent.substring(0, 100) : ''
      };

      // Create a hash of the navigator info
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify(navigatorInfo));
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const deviceId = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // Store the device ID for future use
      if (this.isLocalStorageAvailable()) {
        localStorage.setItem('pingone-device-id', deviceId);
      }
      return deviceId;
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
      populationId: 'not set',
      region: 'NorthAmerica',
      // Rate limiting
      rateLimit: 90,
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
  validateSettings() {
    let settings = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;
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
          let serverSettings = await response.json();
          // Handle stringified JSON in data
          if (typeof serverSettings === 'string') {
            try {
              serverSettings = JSON.parse(serverSettings);
            } catch (e) {}
          }
          // Accept both {success, data} and {success, fileSettings}
          let parsedSettings = null;
          if (serverSettings.success && serverSettings.data) {
            parsedSettings = serverSettings.data;
          } else if (serverSettings.success && serverSettings.fileSettings) {
            parsedSettings = serverSettings.fileSettings;
          } else if (serverSettings.environmentId || serverSettings.apiClientId) {
            parsedSettings = serverSettings;
          }
          if (parsedSettings) {
            // Decrypt sensitive fields if they exist
            if (parsedSettings.apiSecret) {
              try {
                parsedSettings.apiSecret = await this.decryptIfNeeded(parsedSettings.apiSecret);
              } catch (error) {
                this.logger.warn('Failed to decrypt API secret - device ID may have changed');
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
                this.logger.warn('Failed to decrypt API secret from localStorage - device ID may have changed');
                parsedSettings.apiSecret = '';
              }
            }

            // Deep merge with defaults
            this.settings = this.deepMerge(this.getDefaultSettings(), parsedSettings);
            this.logger.log('Settings loaded from localStorage (fallback)', 'warning');

            // Try to save to server for next time
            this.saveSettings(this.settings, false).catch(e => this.logger.warn('Failed to sync settings to server', e));
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
  async saveSettings(newSettings) {
    let validate = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;
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
      const settingsToSave = {
        ...updatedSettings
      };

      // Only send apiSecret if a new value is provided (not blank or ********)
      if (newSettings.apiSecret === '' || newSettings.apiSecret === '********') {
        delete newSettings.apiSecret;
      }

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
            'Content-Type': 'application/json'
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
      const encrypted = await _cryptoUtils.CryptoUtils.encrypt(value, this.encryptionKey);
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
      return await _cryptoUtils.CryptoUtils.decrypt(encryptedValue, this.encryptionKey);
    } catch (error) {
      // Log the error but don't show it to the user unless it's a critical failure
      if (error.name === 'OperationError') {
        this.logger.warn('Decryption failed due to key mismatch - this is normal when device ID changes');
        // Clear the encrypted value from localStorage to prevent future decryption attempts
        if (this.isLocalStorageAvailable()) {
          const savedSettings = localStorage.getItem(this.storageKey);
          if (savedSettings) {
            try {
              const parsedSettings = JSON.parse(savedSettings);
              if (parsedSettings.apiSecret && parsedSettings.apiSecret.startsWith('enc:')) {
                delete parsedSettings.apiSecret;
                localStorage.setItem(this.storageKey, JSON.stringify(parsedSettings));
                this.logger.info('Cleared encrypted API secret from localStorage');
              }
            } catch (e) {
              this.logger.warn('Failed to clear encrypted data from localStorage');
            }
          }
        }
      } else {
        this.logger.error('Decryption failed:', error);
      }
      // Return empty string instead of throwing error to prevent app from crashing
      return '';
    }
  }

  /**
   * Deep merge objects
   * @param {Object} target - Target object
   * @param {Object} source - Source object
   * @returns {Object} Merged object
   */
  deepMerge(target, source) {
    const output = {
      ...target
    };
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, {
              [key]: source[key]
            });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, {
            [key]: source[key]
          });
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
   * Update settings in memory
   * @param {Object} newSettings - New settings to update
   * @returns {Object} The updated settings
   */
  updateSettings(newSettings) {
    try {
      if (!newSettings || typeof newSettings !== 'object') {
        throw new Error('Invalid settings object');
      }

      // Merge new settings with existing ones
      this.settings = {
        ...this.settings,
        ...newSettings
      };
      this.logger.info('Settings updated in memory');
      return this.settings;
    } catch (error) {
      this.logger.error(`Error updating settings: ${error.message}`);
      throw error;
    }
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
   * Get all settings
   * @returns {Object} Current settings object
   */
  getSettings() {
    return {
      ...this.settings
    }; // Return a shallow copy to prevent direct modification
  }

  /**
   * Get a setting value
   * @param {string} key - Setting key
   * @param {*} defaultValue - Default value if setting doesn't exist
   * @returns {*} Setting value or default value
   */
  getSetting(key) {
    let defaultValue = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
    return this.settings.hasOwnProperty(key) ? this.settings[key] : defaultValue;
  }

  /**
   * Update a setting
   * @param {string} key - Setting key
   * @param {*} value - New value
   * @returns {Promise<boolean>} True if setting was updated successfully
   */
  async updateSetting(key, value) {
    return this.saveSettings({
      [key]: value
    });
  }
}

// Export the class and a singleton instance
exports.SettingsManager = SettingsManager;
const settingsManager = exports.settingsManager = new SettingsManager();

},{"./crypto-utils.js":5}],13:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
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
    this.logger = logger || console;
    this.settings = settings || {};
    this.tokenCache = {
      accessToken: null,
      expiresAt: 0,
      tokenType: 'Bearer',
      lastRefresh: 0
    };
    this.tokenExpiryBuffer = 5 * 60 * 1000; // 5 minutes buffer before token expiry
    this.isRefreshing = false;
    this.refreshQueue = [];

    // Bind methods
    this.getAccessToken = this.getAccessToken.bind(this);
    this._requestNewToken = this._requestNewToken.bind(this);
    this._isTokenValid = this._isTokenValid.bind(this);
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

    // If a refresh is already in progress, queue this request
    if (this.isRefreshing) {
      return new Promise(resolve => {
        this.refreshQueue.push(resolve);
      });
    }

    // Otherwise, request a new token
    try {
      this.isRefreshing = true;
      const token = await this._requestNewToken();

      // Resolve all queued requests
      while (this.refreshQueue.length > 0) {
        const resolve = this.refreshQueue.shift();
        resolve(token);
      }
      return token;
    } catch (error) {
      // Clear token cache on error
      this.tokenCache = {
        accessToken: null,
        expiresAt: 0,
        tokenType: 'Bearer',
        lastRefresh: 0
      };

      // Reject all queued requests
      while (this.refreshQueue.length > 0) {
        const resolve = this.refreshQueue.shift();
        resolve(Promise.reject(error));
      }
      throw error;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Get token information including expiry details
   * @returns {Object|null} Token info object or null if no token
   */
  getTokenInfo() {
    if (!this.tokenCache.accessToken) {
      return null;
    }
    const now = Date.now();
    const expiresIn = Math.max(0, this.tokenCache.expiresAt - now);
    return {
      accessToken: this.tokenCache.accessToken,
      expiresIn: Math.floor(expiresIn / 1000),
      // Convert to seconds
      tokenType: this.tokenCache.tokenType,
      expiresAt: this.tokenCache.expiresAt,
      lastRefresh: this.tokenCache.lastRefresh,
      isValid: this._isTokenValid()
    };
  }

  /**
   * Check if the current token is still valid
   * @returns {boolean} True if token is valid, false otherwise
   * @private
   */
  _isTokenValid() {
    const now = Date.now();
    return this.tokenCache.accessToken && this.tokenCache.expiresAt > now + this.tokenExpiryBuffer &&
    // Ensure token isn't too old (max 1 hour)
    now - this.tokenCache.lastRefresh < 60 * 60 * 1000;
  }

  /**
   * Get the auth domain for a given region
   * @private
   */
  _getAuthDomain(region) {
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
    return authDomainMap[region] || 'auth.pingone.com';
  }

  /**
   * Request a new access token from PingOne
   * @returns {Promise<string>} The new access token
   * @private
   */
  async _requestNewToken() {
    const {
      apiClientId,
      apiSecret,
      environmentId,
      region = 'NorthAmerica'
    } = this.settings;
    const requestId = `req_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    // Validate required settings
    if (!apiClientId || !apiSecret || !environmentId) {
      const error = new Error('Missing required API credentials in settings');
      this.logger.error('Token request failed: Missing credentials', {
        requestId,
        hasClientId: !!apiClientId,
        hasSecret: !!apiSecret,
        hasEnvId: !!environmentId
      });
      throw error;
    }

    // Prepare request
    const authDomain = this._getAuthDomain(region);
    const tokenUrl = `https://${authDomain}/${environmentId}/as/token`;
    const credentials = btoa(`${apiClientId}:${apiSecret}`);
    try {
      this.logger.debug('Requesting new access token from PingOne...', {
        requestId,
        authDomain,
        environmentId,
        region
      });
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`
        },
        body: 'grant_type=client_credentials',
        credentials: 'omit'
      });
      const responseTime = Date.now() - startTime;
      let responseData;
      try {
        responseData = await response.json();
      } catch (e) {
        const text = await response.text().catch(() => 'Failed to read response text');
        throw new Error(`Invalid JSON response: ${e.message}. Response: ${text}`);
      }
      if (!response.ok) {
        const errorMsg = responseData.error_description || responseData.error || `HTTP ${response.status} ${response.statusText}`;
        this.logger.error('Token request failed', {
          requestId,
          status: response.status,
          error: responseData.error,
          errorDescription: responseData.error_description,
          responseTime: `${responseTime}ms`,
          url: tokenUrl
        });
        throw new Error(errorMsg);
      }
      if (!responseData.access_token) {
        throw new Error('No access token in response');
      }

      // Update token cache
      const expiresInMs = (responseData.expires_in || 3600) * 1000;
      this.tokenCache = {
        accessToken: responseData.access_token,
        expiresAt: Date.now() + expiresInMs,
        tokenType: responseData.token_type || 'Bearer',
        lastRefresh: Date.now()
      };
      this.logger.info('Successfully obtained new access token', {
        requestId,
        tokenType: this.tokenCache.tokenType,
        expiresIn: Math.floor(expiresInMs / 1000) + 's',
        responseTime: `${responseTime}ms`
      });
      return this.tokenCache.accessToken;
    } catch (error) {
      this.logger.error('Error getting access token', {
        requestId,
        error: error.toString(),
        message: error.message,
        url: tokenUrl,
        responseTime: `${Date.now() - startTime}ms`
      });

      // Clear token cache on error
      this.tokenCache = {
        accessToken: null,
        expiresAt: 0,
        tokenType: 'Bearer',
        lastRefresh: 0
      };
      throw error;
    }
  }

  /**
   * Update settings and clear token cache if credentials changed
   * @param {Object} newSettings - New settings object
   */
  updateSettings(newSettings) {
    const credentialsChanged = newSettings.apiClientId !== this.settings.apiClientId || newSettings.apiSecret !== this.settings.apiSecret || newSettings.environmentId !== this.settings.environmentId || newSettings.region !== this.settings.region;
    this.settings = {
      ...this.settings,
      ...newSettings
    };
    if (credentialsChanged) {
      this.logger.debug('API credentials changed, clearing token cache');
      this.tokenCache = {
        accessToken: null,
        expiresAt: 0,
        tokenType: 'Bearer',
        lastRefresh: 0
      };
    }
  }
}
var _default = exports.default = TokenManager;

},{}],14:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.UIManager = void 0;
var _logger = require("./logger.js");
var _circularProgress = require("./circular-progress.js");
// File: ui-manager.js
// Description: UI management for PingOne user import tool
// 
// This module handles all user interface interactions and state management:
// - Status notifications and user feedback
// - Progress tracking and real-time updates
// - View transitions and navigation
// - Debug logging and error display
// - Connection status indicators
// - Form handling and validation feedback
// 
// Provides a centralized interface for updating the UI based on application events.

// Enable debug mode for development (set to false in production)
const DEBUG_MODE = true;

/**
 * UI Manager Class
 * 
 * Centralizes all UI-related operations and state management.
 * Provides methods for updating progress, showing notifications,
 * handling view transitions, and managing user feedback.
 * 
 * @param {Logger} logger - Logger instance for UI logging
 */
class UIManager {
  constructor(logger) {
    this.logger = logger;

    // Application state tracking
    // Tracks current view and operation states to prevent conflicts
    this.currentView = 'import';
    this.isImporting = false;
    this.isExporting = false;
    this.isDeleting = false;
    this.isModifying = false;
    this.isPopulationDeleting = false;

    // Navigation elements cache
    this.navItems = [];

    // Progress tracking for last run status
    this.lastRunStatus = {};
  }

  /**
   * Initialize the UI Manager
   * 
   * Sets up navigation elements and initializes progress tracking state.
   * Called during application startup to prepare the UI for user interaction.
   * 
   * @returns {Promise<void>}
   */
  async init() {
    try {
      // Initialize navigation elements for view switching
      this.navItems = document.querySelectorAll('[data-view]');

      // Initialize progress tracking for all operation types
      // Each operation maintains its last run status for display
      this.lastRunStatus = {
        import: {
          status: 'idle',
          message: 'No import run yet'
        },
        export: {
          status: 'idle',
          message: 'No export run yet'
        },
        delete: {
          status: 'idle',
          message: 'No delete run yet'
        },
        modify: {
          status: 'idle',
          message: 'No modify run yet'
        },
        'population-delete': {
          status: 'idle',
          message: 'No population delete run yet'
        }
      };

      // Initialize universal token status system
      this.initUniversalTokenStatus();
    } catch (error) {
      this.logger.error('UI Manager initialization error:', error);
      throw error;
    }
  }

  /**
   * Initialize the universal token status system
   * 
   * Sets up the token status bar that appears on all pages,
   * including automatic refresh timer and event handlers.
   * This provides users with real-time visibility into their
   * PingOne token status and expiration time.
   */
  initUniversalTokenStatus() {
    try {
      // Get token status elements
      this.tokenStatusBar = document.getElementById('universal-token-status');
      this.tokenStatusIcon = this.tokenStatusBar?.querySelector('.token-status-icon');
      this.tokenStatusText = this.tokenStatusBar?.querySelector('.token-status-text');
      this.tokenStatusTime = this.tokenStatusBar?.querySelector('.token-status-time');
      this.refreshTokenBtn = this.tokenStatusBar?.querySelector('#refresh-token-status');
      this.getTokenQuickBtn = this.tokenStatusBar?.querySelector('#get-token-quick');
      if (!this.tokenStatusBar) {
        console.warn('Universal token status bar not found');
        return;
      }

      // Set up event listeners for token status actions
      this.setupTokenStatusEventListeners();

      // Initialize token status display
      this.updateUniversalTokenStatus();

      // Start automatic refresh timer (every 60 seconds)
      this.startTokenStatusTimer();
      this.logger.info('Universal token status system initialized');
    } catch (error) {
      this.logger.error('Error initializing universal token status:', error);
    }
  }

  /**
   * Set up event listeners for token status actions
   * 
   * Handles refresh button clicks and quick token acquisition
   * to provide immediate user feedback and token management.
   */
  setupTokenStatusEventListeners() {
    try {
      // Refresh token status button
      if (this.refreshTokenBtn) {
        this.refreshTokenBtn.addEventListener('click', () => {
          this.refreshTokenStatus();
        });
      }

      // Quick get token button
      if (this.getTokenQuickBtn) {
        this.getTokenQuickBtn.addEventListener('click', () => {
          this.quickGetToken();
        });
      }
    } catch (error) {
      this.logger.error('Error setting up token status event listeners:', error);
    }
  }

  /**
   * Start automatic token status refresh timer
   * 
   * Updates token status every 60 seconds to keep countdown accurate
   * and provide real-time feedback on token expiration.
   */
  startTokenStatusTimer() {
    try {
      // Clear any existing timer
      if (this.tokenStatusTimer) {
        clearInterval(this.tokenStatusTimer);
      }

      // Set up 60-second refresh timer
      this.tokenStatusTimer = setInterval(() => {
        this.updateUniversalTokenStatus();
      }, 60000); // 60 seconds

      this.logger.debug('Token status auto-refresh timer started (60s interval)');
    } catch (error) {
      this.logger.error('Error starting token status timer:', error);
    }
  }

  /**
   * Stop the automatic token status refresh timer
   * 
   * Called during cleanup or when the application is shutting down
   * to prevent memory leaks and unnecessary API calls.
   */
  stopTokenStatusTimer() {
    try {
      if (this.tokenStatusTimer) {
        clearInterval(this.tokenStatusTimer);
        this.tokenStatusTimer = null;
        this.logger.debug('Token status auto-refresh timer stopped');
      }
    } catch (error) {
      this.logger.error('Error stopping token status timer:', error);
    }
  }

  /**
   * Update the universal token status display
   * 
   * Retrieves current token information and updates the status bar
   * with appropriate colors, icons, and time remaining. This is
   * the main method for keeping token status current across all pages.
   * 
   * @param {Object} tokenInfo - Optional token info object (if already retrieved)
   */
  updateUniversalTokenStatus() {
    let tokenInfo = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;
    try {
      if (!this.tokenStatusBar) {
        return;
      }

      // Show loading state
      this.setTokenStatusLoading();

      // Get token info if not provided
      if (!tokenInfo && window.app && window.app.pingOneClient) {
        tokenInfo = window.app.pingOneClient.getCurrentTokenTimeRemaining();
      }

      // Update display based on token status
      if (!tokenInfo) {
        this.setTokenStatusNoToken();
      } else if (tokenInfo.isExpired) {
        this.setTokenStatusExpired();
      } else if (tokenInfo.timeRemaining <= 300) {
        // 5 minutes or less
        this.setTokenStatusWarning(tokenInfo);
      } else {
        this.setTokenStatusValid(tokenInfo);
      }

      // Log status for debugging
      if (window.DEBUG_MODE) {
        console.log('Token status updated:', tokenInfo);
      }
    } catch (error) {
      this.logger.error('Error updating universal token status:', error);
      this.setTokenStatusError();
    }
  }

  /**
   * Set token status to loading state
   * 
   * Shows a loading indicator while checking token status
   * to provide immediate feedback to users.
   */
  setTokenStatusLoading() {
    try {
      if (!this.tokenStatusBar) return;
      this.tokenStatusBar.className = 'universal-token-status loading';
      this.tokenStatusIcon.textContent = '⏳';
      this.tokenStatusText.textContent = 'Checking token status...';
      this.tokenStatusTime.textContent = '';
      this.getTokenQuickBtn.style.display = 'none';
    } catch (error) {
      this.logger.error('Error setting token status loading:', error);
    }
  }

  /**
   * Set token status to no token state
   * 
   * Indicates that no valid token is available and shows
   * the quick get token button for immediate action.
   */
  setTokenStatusNoToken() {
    try {
      if (!this.tokenStatusBar) return;
      this.tokenStatusBar.className = 'universal-token-status no-token';
      this.tokenStatusIcon.textContent = '❌';
      this.tokenStatusText.textContent = 'No valid token available';
      this.tokenStatusTime.textContent = '';
      this.getTokenQuickBtn.style.display = 'inline-block';
    } catch (error) {
      this.logger.error('Error setting token status no token:', error);
    }
  }

  /**
   * Set token status to expired state
   * 
   * Indicates that the token has expired and shows
   * the quick get token button for immediate renewal.
   */
  setTokenStatusExpired() {
    try {
      if (!this.tokenStatusBar) return;
      this.tokenStatusBar.className = 'universal-token-status expired';
      this.tokenStatusIcon.textContent = '⚠️';
      this.tokenStatusText.textContent = 'Token expired';
      this.tokenStatusTime.textContent = '';
      this.getTokenQuickBtn.style.display = 'inline-block';
    } catch (error) {
      this.logger.error('Error setting token status expired:', error);
    }
  }

  /**
   * Set token status to warning state (near expiration)
   * 
   * Indicates that the token will expire soon (within 5 minutes)
   * and shows the remaining time with a warning color.
   * 
   * @param {Object} tokenInfo - Token information with time remaining
   */
  setTokenStatusWarning(tokenInfo) {
    try {
      if (!this.tokenStatusBar) return;
      this.tokenStatusBar.className = 'universal-token-status warning';
      this.tokenStatusIcon.textContent = '⚠️';
      this.tokenStatusText.textContent = 'Token expires soon';
      this.tokenStatusTime.textContent = `(${tokenInfo.formattedTime} remaining)`;
      this.getTokenQuickBtn.style.display = 'inline-block';
    } catch (error) {
      this.logger.error('Error setting token status warning:', error);
    }
  }

  /**
   * Set token status to valid state
   * 
   * Indicates that the token is valid and shows
   * the remaining time until expiration.
   * 
   * @param {Object} tokenInfo - Token information with time remaining
   */
  setTokenStatusValid(tokenInfo) {
    try {
      if (!this.tokenStatusBar) return;
      this.tokenStatusBar.className = 'universal-token-status valid';
      this.tokenStatusIcon.textContent = '✅';
      this.tokenStatusText.textContent = 'Token valid';
      this.tokenStatusTime.textContent = `(${tokenInfo.formattedTime} remaining)`;
      this.getTokenQuickBtn.style.display = 'none';
    } catch (error) {
      this.logger.error('Error setting token status valid:', error);
    }
  }

  /**
   * Set token status to error state
   * 
   * Indicates that there was an error checking token status
   * and provides a way to retry or get a new token.
   */
  setTokenStatusError() {
    try {
      if (!this.tokenStatusBar) return;
      this.tokenStatusBar.className = 'universal-token-status no-token';
      this.tokenStatusIcon.textContent = '❓';
      this.tokenStatusText.textContent = 'Error checking token status';
      this.tokenStatusTime.textContent = '';
      this.getTokenQuickBtn.style.display = 'inline-block';
    } catch (error) {
      this.logger.error('Error setting token status error:', error);
    }
  }

  /**
   * Refresh token status manually
   * 
   * Called when user clicks the refresh button to get
   * immediate token status update.
   */
  refreshTokenStatus() {
    try {
      this.logger.info('Manual token status refresh requested');
      this.updateUniversalTokenStatus();

      // Show brief update animation
      if (this.tokenStatusBar) {
        this.tokenStatusBar.classList.add('updating');
        setTimeout(() => {
          this.tokenStatusBar.classList.remove('updating');
        }, 500);
      }
    } catch (error) {
      this.logger.error('Error refreshing token status:', error);
    }
  }

  /**
   * Quick token acquisition from status bar
   * 
   * Provides immediate token acquisition without navigating
   * to the settings page, for user convenience.
   */
  async quickGetToken() {
    try {
      this.logger.info('Quick token acquisition requested');

      // Show loading state
      this.setTokenStatusLoading();

      // Attempt to get token
      if (window.app && window.app.getToken) {
        await window.app.getToken();

        // Update status after token acquisition
        setTimeout(() => {
          this.updateUniversalTokenStatus();
        }, 1000);
      } else {
        this.logger.error('App getToken method not available');
        this.setTokenStatusError();
      }
    } catch (error) {
      this.logger.error('Error in quick token acquisition:', error);
      this.setTokenStatusError();
    }
  }

  /**
   * Show success notification to user
   * 
   * @param {string} message - Success message to display
   * @param {string} details - Optional additional details
   */
  showSuccess(message) {
    let details = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';
    this.showNotification('success', message, details);
  }

  /**
   * Show error notification to user
   * 
   * @param {string} message - Error message to display
   * @param {string} details - Optional additional details
   */
  showError(message) {
    let details = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';
    this.showNotification('error', message, details);
  }

  /**
   * Show warning notification to user
   * 
   * @param {string} message - Warning message to display
   * @param {string} details - Optional additional details
   */
  showWarning(message) {
    let details = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';
    this.showNotification('warning', message, details);
  }

  /**
   * Show info notification to user
   * 
   * @param {string} message - Info message to display
   * @param {string} details - Optional additional details
   */
  showInfo(message) {
    let details = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';
    this.showNotification('info', message, details);
  }

  /**
   * Display a notification to the user
   * 
   * Creates and displays a Bootstrap alert with appropriate styling,
   * icon, and auto-dismiss functionality. Supports different types
   * of notifications (success, error, warning, info).
   * 
   * @param {string} type - Notification type ('success', 'error', 'warning', 'info')
   * @param {string} message - Main notification message
   * @param {string} details - Optional additional details
   */
  showNotification(type, message) {
    let details = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : '';
    try {
      // Get notification container and clear existing notifications
      const container = document.getElementById('notification-area');
      if (container) {
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
      }

      // Create notification element with Bootstrap classes
      const notification = document.createElement('div');
      notification.className = `status-message status-${type} alert-dismissible fade show`;
      notification.setAttribute('role', 'alert');
      notification.setAttribute('aria-live', 'polite');

      // Debug log for rendered message
      console.log(`Message rendered: "${message}", type = ${type}, class = ${notification.className}`);

      // Get icon and styling configuration based on notification type
      const iconConfig = this.getStatusIconConfig(type);

      // Build notification HTML with icon, message, and close button
      notification.innerHTML = `
                <div class="status-message-content">
                    <span class="status-icon" aria-hidden="true">${iconConfig.icon}</span>
                    <div class="status-text">
                        <strong class="status-title">${message}</strong>
                        ${details ? `<div class="status-details">${details}</div>` : ''}
                    </div>
                    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close notification">
                        <span aria-hidden="true">&times;</span>
                    </button>
                </div>
            `;

      // Add notification to container and set auto-dismiss timer
      if (container) {
        container.appendChild(notification);

        // Auto-remove notification after 5 seconds
        setTimeout(() => {
          if (notification.parentNode) {
            notification.remove();
          }
        }, 5000);
      }
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }
  getStatusIconConfig(type) {
    const configs = {
      success: {
        icon: '✅',
        bgColor: '#d4edda',
        borderColor: '#c3e6cb',
        textColor: '#155724',
        iconColor: '#28a745'
      },
      warning: {
        icon: '⚠️',
        bgColor: '#fff3cd',
        borderColor: '#ffeaa7',
        textColor: '#856404',
        iconColor: '#ffc107'
      },
      error: {
        icon: '❌',
        bgColor: '#f8d7da',
        borderColor: '#f5c6cb',
        textColor: '#721c24',
        iconColor: '#dc3545'
      },
      info: {
        icon: 'ℹ️',
        bgColor: '#d1ecf1',
        borderColor: '#bee5eb',
        textColor: '#0c5460',
        iconColor: '#17a2b8'
      }
    };
    return configs[type] || configs.info;
  }

  /**
   * Display current token status with time remaining
   * 
   * Shows the current token status on the settings page, including
   * time remaining until expiration or if no valid token exists.
   * 
   * @param {Object} tokenInfo - Token information object from PingOneClient
   */
  showCurrentTokenStatus() {
    let tokenInfo = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;
    try {
      const statusElement = document.getElementById('token-status');
      if (!statusElement) {
        console.warn('Token status element not found');
        return;
      }
      if (!tokenInfo) {
        // No valid token
        statusElement.innerHTML = `
                    <div class="token-status-display">
                        <span class="status-icon">❌</span>
                        <span class="status-text">No valid token available</span>
                    </div>
                `;
        statusElement.className = 'token-status no-token';
        return;
      }
      if (tokenInfo.isExpired) {
        // Token is expired
        statusElement.innerHTML = `
                    <div class="token-status-display">
                        <span class="status-icon">⚠️</span>
                        <span class="status-text">Token expired</span>
                    </div>
                `;
        statusElement.className = 'token-status expired';
        return;
      }

      // Valid token with time remaining
      statusElement.innerHTML = `
                <div class="token-status-display">
                    <span class="status-icon">✅</span>
                    <span class="status-text">Token valid</span>
                    <span class="time-remaining">(${tokenInfo.formattedTime} remaining)</span>
                </div>
            `;
      statusElement.className = 'token-status valid';
    } catch (error) {
      console.error('Error showing current token status:', error);
    }
  }

  /**
   * Update connection status display
   * 
   * Updates the connection status indicator with current state and message.
   * Used to show real-time connection status to the user.
   * 
   * @param {string} status - Connection status ('connected', 'disconnected', 'connecting', 'error')
   * @param {string} message - Status message to display
   */
  updateConnectionStatus(status) {
    let message = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';
    try {
      // Update main connection status indicator
      const statusElement = document.getElementById('connection-status');
      if (statusElement) {
        const iconElement = statusElement.querySelector('.status-icon');
        const messageElement = statusElement.querySelector('.status-message');

        // Update icon based on status
        if (iconElement) {
          iconElement.className = `status-icon fas ${this.getStatusIcon(status)}`;
        }

        // Update message text
        if (messageElement) {
          messageElement.textContent = message || this.getDefaultStatusMessage(status);
        }

        // Update CSS class for styling
        statusElement.className = `connection-status ${status}`;
      }

      // Also update settings page connection status if present
      const settingsStatus = document.getElementById('settings-connection-status');
      if (settingsStatus) {
        const iconElement = settingsStatus.querySelector('.status-icon');
        const messageElement = settingsStatus.querySelector('.status-message');
        if (iconElement) {
          iconElement.className = `status-icon fas ${this.getStatusIcon(status)}`;
        }
        if (messageElement) {
          messageElement.textContent = message || this.getDefaultStatusMessage(status);
        }
        settingsStatus.className = `settings-connection-status ${status}`;

        // Log for debugging
        console.log('[UI] Settings connection status updated:', status, message);
      }
    } catch (error) {
      console.error('Error updating connection status:', error);
    }
  }
  updateHomeTokenStatus(show) {
    let message = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';
    try {
      const tokenStatusElement = document.getElementById('home-token-status');
      if (!tokenStatusElement) return;
      if (show) {
        tokenStatusElement.style.display = 'block';
        const messageElement = tokenStatusElement.querySelector('.token-status-message');
        if (messageElement) {
          messageElement.textContent = message;
        }
      } else {
        tokenStatusElement.style.display = 'none';
      }
    } catch (error) {
      console.error('Error updating home token status:', error);
    }
  }
  updateSettingsSaveStatus(message) {
    let type = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'info';
    try {
      const statusElement = document.getElementById('settings-connection-status');
      if (!statusElement) return;
      const iconElement = statusElement.querySelector('.status-icon');
      const messageElement = statusElement.querySelector('.status-message');
      if (iconElement) {
        iconElement.className = `status-icon fas ${this.getStatusIcon(type)}`;
      }
      if (messageElement) {
        messageElement.textContent = message;
      }
      statusElement.className = `settings-connection-status ${type}`;
    } catch (error) {
      console.error('Error updating settings save status:', error);
    }
  }
  getStatusIcon(status) {
    const icons = {
      connected: 'fa-check-circle text-success',
      disconnected: 'fa-times-circle text-danger',
      connecting: 'fa-spinner fa-spin text-warning',
      error: 'fa-exclamation-triangle text-danger',
      success: 'fa-check-circle text-success',
      warning: 'fa-exclamation-triangle text-warning',
      info: 'fa-info-circle text-info'
    };
    return icons[status] || 'fa-question-circle text-muted';
  }
  getDefaultStatusMessage(status) {
    const messages = {
      connected: 'Connected to PingOne',
      disconnected: 'Not connected to PingOne',
      connecting: 'Connecting to PingOne...',
      error: 'Connection error',
      success: 'Operation completed successfully',
      warning: 'Warning',
      info: 'Information'
    };
    return messages[status] || 'Unknown status';
  }

  /**
   * Shows the import progress section and initializes progress display
   * @param {number} totalUsers - Total number of users to import
   * @param {string} populationName - Name of the selected population
   * @param {string} populationId - ID of the selected population
   */
  showImportStatus(totalUsers) {
    let populationName = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';
    let populationId = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : '';
    // Show import status section (no modal overlay needed)
    const importStatus = document.getElementById('import-status');
    if (importStatus) {
      importStatus.style.display = 'block';
      this.debugLog('UI', 'Import status section displayed');
    } else {
      console.error('Import status element not found');
    }
    this.isImporting = true;
    this.updateLastRunStatus('import', 'User Import', 'In Progress', `Importing ${totalUsers} users`, {
      total: totalUsers,
      success: 0,
      failed: 0,
      skipped: 0
    });
    this.updateImportProgress(0, totalUsers, 'Starting import...', {}, populationName, populationId);
  }

  /**
   * Updates the import progress bar, counters, and log
   * @param {number} current - Current user index
   * @param {number} total - Total users
   * @param {string} message - Progress message
   * @param {object} counts - Success/fail/skip counts
   * @param {string} populationName - Population name
   * @param {string} populationId - Population ID
   */
  updateImportProgress(current, total, message) {
    let counts = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};
    let populationName = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : '';
    let populationId = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : '';
    const percent = total > 0 ? Math.min(100, Math.round(current / total * 100)) : 0;
    const spinnerContainer = document.getElementById('import-progress-spinner');
    if (spinnerContainer) {
      spinnerContainer.innerHTML = '';
      spinnerContainer.appendChild((0, _circularProgress.createCircularProgress)({
        value: percent,
        label: message || 'Importing Users'
      }));
    }
    // Update counts
    if (typeof successCount !== 'undefined' && successCount) successCount.textContent = counts.succeeded || counts.success || 0;
    if (typeof failedCount !== 'undefined' && failedCount) failedCount.textContent = counts.failed || 0;
    if (typeof skippedCount !== 'undefined' && skippedCount) skippedCount.textContent = counts.skipped || 0;

    // Update population name (show 'Not selected' if empty)
    if (typeof populationNameElement !== 'undefined' && populationNameElement) {
      const displayName = populationName && populationName.trim() ? populationName : 'Not selected';
      populationNameElement.textContent = displayName;
      populationNameElement.setAttribute('data-content', displayName);
    }
    // Update population ID (show 'Not set' if empty)
    if (typeof populationIdElement !== 'undefined' && populationIdElement) {
      const displayId = populationId && populationId.trim() ? populationId : 'Not set';
      populationIdElement.textContent = displayId;
      populationIdElement.setAttribute('data-content', displayId);
    }

    // Add progress log entry
    this.addProgressLogEntry(message, 'info', counts, 'import');

    // Update last run status with current progress
    this.updateLastRunStatus('import', 'User Import', 'In Progress', message, counts);
  }
  resetImportProgress() {
    const progressBar = document.getElementById('import-progress-bar');
    const progressPercent = document.getElementById('import-progress-percent');
    const progressText = document.getElementById('import-progress-text');
    const progressCount = document.getElementById('import-progress-count');
    const successCount = document.getElementById('import-success-count');
    const failedCount = document.getElementById('import-failed-count');
    const skippedCount = document.getElementById('import-skipped-count');
    const populationNameElement = document.getElementById('import-population-name');
    if (progressBar) {
      progressBar.style.width = '0%';
      progressBar.setAttribute('aria-valuenow', 0);
    }
    if (progressPercent) progressPercent.textContent = '0%';
    if (progressText) progressText.textContent = 'Ready to import';
    if (progressCount) progressCount.textContent = '0/0';
    if (successCount) successCount.textContent = '0';
    if (failedCount) failedCount.textContent = '0';
    if (skippedCount) skippedCount.textContent = '0';

    // Population name
    if (populationNameElement) {
      populationNameElement.textContent = 'Not selected';
      populationNameElement.setAttribute('data-content', 'Not selected');
    }

    // Reset error status
    this.hideImportErrorStatus();
  }
  showImportErrorStatus() {
    let errorSummary = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '';
    let errorDetails = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];
    const errorStatusElement = document.getElementById('import-error-status');
    const errorSummaryElement = document.getElementById('import-error-summary');
    const errorDetailsElement = document.getElementById('import-error-details');
    if (errorStatusElement) {
      errorStatusElement.style.display = 'block';
    }
    if (errorSummaryElement && errorSummary) {
      errorSummaryElement.innerHTML = `
                <div style="color: #dc3545; font-weight: bold; margin-bottom: 10px;">
                    <i class="fas fa-exclamation-circle"></i> ${errorSummary}
                </div>
            `;
    }
    if (errorDetailsElement && errorDetails.length > 0) {
      let detailsHtml = '<div style="font-size: 0.9em; color: #666;">';
      errorDetails.forEach((error, index) => {
        detailsHtml += `
                    <div style="margin-bottom: 8px; padding: 8px; background-color: #fff; border-left: 3px solid #dc3545; border-radius: 3px;">
                        <strong>Error ${index + 1}:</strong> ${error}
                    </div>
                `;
      });
      detailsHtml += '</div>';
      errorDetailsElement.innerHTML = detailsHtml;
    }
  }
  hideImportErrorStatus() {
    const errorStatusElement = document.getElementById('import-error-status');
    const errorSummaryElement = document.getElementById('import-error-summary');
    const errorDetailsElement = document.getElementById('import-error-details');
    if (errorStatusElement) {
      errorStatusElement.style.display = 'none';
    }
    if (errorSummaryElement) {
      errorSummaryElement.innerHTML = '';
    }
    if (errorDetailsElement) {
      errorDetailsElement.innerHTML = '';
    }
  }
  updateImportErrorStatus(summary, errors) {
    const errorStatus = document.getElementById('import-error-status');
    if (!errorStatus) return;
    errorStatus.style.display = 'block';
    errorStatus.innerHTML = `
            <div class="error-summary">
                <i class="fas fa-exclamation-triangle"></i> <strong>Error Overview</strong>
            </div>
            <div class="error-main-message">
                <i class="fas fa-exclamation-circle"></i> ${summary}
            </div>
            <div class="error-list">
                ${errors.map((err, idx) => {
      // Support error as string or { message, details }
      let message = typeof err === 'string' ? err : err.message || 'Unknown error';
      let details = typeof err === 'object' && err.details ? err.details : '';
      return `
                        <div class="error-row" data-error-idx="${idx}">
                            <div class="error-row-header">
                                <span class="error-label"><strong>Error ${idx + 1}:</strong> ${message}</span>
                                ${details ? `<button class="error-toggle-btn" data-toggle-idx="${idx}"><i class="fas fa-chevron-down"></i> Details</button>` : ''}
                            </div>
                            ${details ? `<div class="error-details" id="error-details-${idx}" style="display:none;"><pre>${details}</pre></div>` : ''}
                        </div>
                    `;
    }).join('')}
            </div>
        `;
    // Add toggle listeners
    Array.from(errorStatus.querySelectorAll('.error-toggle-btn')).forEach(btn => {
      btn.onclick = e => {
        const idx = btn.getAttribute('data-toggle-idx');
        const detailsDiv = document.getElementById(`error-details-${idx}`);
        if (detailsDiv) {
          const isOpen = detailsDiv.style.display === 'block';
          detailsDiv.style.display = isOpen ? 'none' : 'block';
          btn.innerHTML = isOpen ? '<i class="fas fa-chevron-down"></i> Details' : '<i class="fas fa-chevron-up"></i> Hide';
        }
      };
    });
  }
  showExportStatus() {
    const overlay = document.getElementById('export-progress-modal-overlay');
    if (overlay) overlay.style.display = 'flex';
    const exportStatus = document.getElementById('export-status');
    if (exportStatus) {
      exportStatus.style.display = 'block';
    }
    this.isExporting = true;
    this.updateLastRunStatus('export', 'User Export', 'In Progress', 'Starting export...', {
      total: 0,
      success: 0,
      failed: 0,
      skipped: 0
    });
    this.updateExportProgress(0, 0, 'Starting export...');
  }
  updateExportProgress(current, total, message) {
    let counts = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};
    const percent = total > 0 ? Math.min(100, Math.round(current / total * 100)) : 0;
    const spinnerContainer = document.getElementById('export-progress-spinner');
    if (spinnerContainer) {
      spinnerContainer.innerHTML = '';
      spinnerContainer.appendChild((0, _circularProgress.createCircularProgress)({
        value: percent,
        label: message || 'Exporting Users'
      }));
    }
    if (successCount) successCount.textContent = counts.success || 0;
    if (failedCount) failedCount.textContent = counts.failed || 0;
    if (skippedCount) skippedCount.textContent = counts.skipped || 0;
    this.addProgressLogEntry(message, 'info', counts, 'export');
    this.updateLastRunStatus('export', 'User Export', 'In Progress', message, counts);
  }
  resetExportProgress() {
    const progressBar = document.getElementById('export-progress');
    const progressPercent = document.getElementById('export-progress-percent');
    const progressText = document.getElementById('export-progress-text');
    const progressCount = document.getElementById('export-progress-count');
    const successCount = document.getElementById('export-success-count');
    const failedCount = document.getElementById('export-failed-count');
    const skippedCount = document.getElementById('export-skipped-count');
    if (progressBar) {
      progressBar.style.width = '0%';
      progressBar.setAttribute('aria-valuenow', 0);
    }
    if (progressPercent) progressPercent.textContent = '0%';
    if (progressText) progressText.textContent = 'Ready to export';
    if (progressCount) progressCount.textContent = '0/0';
    if (successCount) successCount.textContent = '0';
    if (failedCount) failedCount.textContent = '0';
    if (skippedCount) skippedCount.textContent = '0';
  }
  showDeleteStatus(totalUsers) {
    let populationName = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';
    let populationId = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : '';
    const overlay = document.getElementById('delete-progress-modal-overlay');
    if (overlay) overlay.style.display = 'flex';
    const deleteStatus = document.getElementById('delete-status');
    if (deleteStatus) {
      deleteStatus.style.display = 'block';
    }
    this.isDeleting = true;
    this.updateLastRunStatus('delete', 'User Delete', 'In Progress', `Deleting ${totalUsers} users`, {
      total: totalUsers,
      success: 0,
      failed: 0,
      skipped: 0
    });
    this.updateDeleteProgress(0, totalUsers, 'Starting delete...', {}, populationName, populationId);
  }
  updateDeleteProgress(current, total, message) {
    let counts = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};
    let populationName = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : '';
    let populationId = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : '';
    const percent = total > 0 ? Math.min(100, Math.round(current / total * 100)) : 0;
    const spinnerContainer = document.getElementById('delete-progress-spinner');
    if (spinnerContainer) {
      spinnerContainer.innerHTML = '';
      spinnerContainer.appendChild((0, _circularProgress.createCircularProgress)({
        value: percent,
        label: message || 'Deleting Users'
      }));
    }
    if (successCount) successCount.textContent = counts.success || 0;
    if (failedCount) failedCount.textContent = counts.failed || 0;
    if (skippedCount) skippedCount.textContent = counts.skipped || 0;

    // Update population name (show 'Not selected' if empty)
    if (populationNameElement) {
      const displayName = populationName && populationName.trim() ? populationName : 'Not selected';
      populationNameElement.textContent = displayName;
      populationNameElement.setAttribute('data-content', displayName);
    }
    // Update population ID (show 'Not set' if empty)
    if (populationIdElement) {
      const displayId = populationId && populationId.trim() ? populationId : 'Not set';
      populationIdElement.textContent = displayId;
      populationIdElement.setAttribute('data-content', displayId);
    }
    this.addProgressLogEntry(message, 'info', counts, 'delete');
    this.updateLastRunStatus('delete', 'User Delete', 'In Progress', message, counts);
  }
  resetDeleteProgress() {
    const progressBar = document.getElementById('delete-progress');
    const progressPercent = document.getElementById('delete-progress-percent');
    const progressText = document.getElementById('delete-progress-text');
    const progressCount = document.getElementById('delete-progress-count');
    const successCount = document.getElementById('delete-success-count');
    const failedCount = document.getElementById('delete-failed-count');
    const skippedCount = document.getElementById('delete-skipped-count');
    if (progressBar) {
      progressBar.style.width = '0%';
      progressBar.setAttribute('aria-valuenow', 0);
    }
    if (progressPercent) progressPercent.textContent = '0%';
    if (progressText) progressText.textContent = 'Ready to delete';
    if (progressCount) progressCount.textContent = '0/0';
    if (successCount) successCount.textContent = '0';
    if (failedCount) failedCount.textContent = '0';
    if (skippedCount) skippedCount.textContent = '0';
  }
  showModifyStatus(totalUsers) {
    const overlay = document.getElementById('modify-progress-modal-overlay');
    if (overlay) overlay.style.display = 'flex';
    const modifyStatus = document.getElementById('modify-status');
    if (modifyStatus) {
      modifyStatus.style.display = 'block';
    }
    this.isModifying = true;
    this.updateLastRunStatus('modify', 'User Modify', 'In Progress', `Modifying ${totalUsers} users`, {
      total: totalUsers,
      success: 0,
      failed: 0,
      skipped: 0
    });
    this.updateModifyProgress(0, totalUsers, 'Starting modify...');
  }
  updateModifyProgress(current, total, message) {
    let counts = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};
    const percent = total > 0 ? Math.min(100, Math.round(current / total * 100)) : 0;
    const spinnerContainer = document.getElementById('modify-progress-spinner');
    if (spinnerContainer) {
      spinnerContainer.innerHTML = '';
      spinnerContainer.appendChild((0, _circularProgress.createCircularProgress)({
        value: percent,
        label: message || 'Modifying Users'
      }));
    }
    if (successCount) successCount.textContent = counts.success || 0;
    if (failedCount) failedCount.textContent = counts.failed || 0;
    if (skippedCount) skippedCount.textContent = counts.skipped || 0;
    this.addProgressLogEntry(message, 'info', counts, 'modify');
    this.updateLastRunStatus('modify', 'User Modify', 'In Progress', message, counts);
  }
  resetModifyProgress() {
    const progressBar = document.getElementById('modify-progress');
    const progressPercent = document.getElementById('modify-progress-percent');
    const progressText = document.getElementById('modify-progress-text');
    const progressCount = document.getElementById('modify-progress-count');
    const successCount = document.getElementById('modify-success-count');
    const failedCount = document.getElementById('modify-failed-count');
    const skippedCount = document.getElementById('modify-skipped-count');
    if (progressBar) {
      progressBar.style.width = '0%';
      progressBar.setAttribute('aria-valuenow', 0);
    }
    if (progressPercent) progressPercent.textContent = '0%';
    if (progressText) progressText.textContent = 'Ready to modify';
    if (progressCount) progressCount.textContent = '0/0';
    if (successCount) successCount.textContent = '0';
    if (failedCount) failedCount.textContent = '0';
    if (skippedCount) skippedCount.textContent = '0';
  }
  showPopulationDeleteStatus(populationName) {
    const overlay = document.getElementById('population-delete-progress-modal-overlay');
    if (overlay) overlay.style.display = 'flex';
    const populationDeleteStatus = document.getElementById('population-delete-status');
    if (populationDeleteStatus) {
      populationDeleteStatus.style.display = 'block';
    }
    this.isPopulationDeleting = true;
    this.updateLastRunStatus('population-delete', 'Population Delete', 'In Progress', `Deleting population: ${populationName}`, {
      total: 1,
      success: 0,
      failed: 0,
      skipped: 0
    });
    this.updatePopulationDeleteProgress(0, 1, 'Starting population delete...');
  }
  updatePopulationDeleteProgress(current, total, message) {
    let counts = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};
    const percent = total > 0 ? Math.min(100, Math.round(current / total * 100)) : 0;
    const spinnerContainer = document.getElementById('population-delete-progress-spinner');
    if (spinnerContainer) {
      spinnerContainer.innerHTML = '';
      spinnerContainer.appendChild((0, _circularProgress.createCircularProgress)({
        value: percent,
        label: message || 'Deleting Population'
      }));
    }
    if (successCount) successCount.textContent = counts.success || 0;
    if (failedCount) failedCount.textContent = counts.failed || 0;
    if (skippedCount) skippedCount.textContent = counts.skipped || 0;
    this.addProgressLogEntry(message, 'info', counts, 'population-delete');
    this.updateLastRunStatus('population-delete', 'Population Delete', 'In Progress', message, counts);
  }
  resetPopulationDeleteProgress() {
    const progressBar = document.getElementById('population-delete-progress');
    const progressPercent = document.getElementById('population-delete-progress-percent');
    const progressText = document.getElementById('population-delete-progress-text');
    const progressCount = document.getElementById('population-delete-progress-count');
    if (progressBar) {
      progressBar.style.width = '0%';
      progressBar.setAttribute('aria-valuenow', 0);
    }
    if (progressPercent) progressPercent.textContent = '0%';
    if (progressText) progressText.textContent = 'Ready to delete population';
    if (progressCount) progressCount.textContent = '0/0';
  }
  updateLastRunStatus(operation, title, status, message) {
    let counts = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : {};
    this.lastRunStatus[operation] = {
      title,
      status,
      message,
      counts,
      timestamp: new Date().toISOString()
    };
  }
  addProgressLogEntry(message, level) {
    let counts = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
    let operation = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : '';
    try {
      const logEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        counts,
        operation
      };

      // Add to progress logs if available
      const progressLogs = document.getElementById('progress-logs');
      if (progressLogs) {
        const logElement = document.createElement('div');
        logElement.className = `log-entry log-${level}`;
        const timeStr = new Date().toLocaleTimeString();

        // Create header with timestamp, level, message, and expand icon if details exist
        const headerElement = document.createElement('div');
        headerElement.className = 'log-header';
        headerElement.style.display = 'flex';
        headerElement.style.alignItems = 'center';
        headerElement.style.gap = '8px';
        const timeElement = document.createElement('span');
        timeElement.className = 'log-timestamp';
        timeElement.textContent = timeStr;
        const levelElement = document.createElement('span');
        levelElement.className = 'log-level';
        levelElement.textContent = level.toUpperCase();
        const messageElement = document.createElement('span');
        messageElement.className = 'log-message';
        messageElement.textContent = message;
        headerElement.appendChild(timeElement);
        headerElement.appendChild(levelElement);
        headerElement.appendChild(messageElement);

        // Add count badges to header
        if (counts.success !== undefined) {
          const successElement = document.createElement('span');
          successElement.className = 'log-success';
          successElement.textContent = `✓ ${counts.success}`;
          headerElement.appendChild(successElement);
        }
        if (counts.failed !== undefined) {
          const failedElement = document.createElement('span');
          failedElement.className = 'log-failed';
          failedElement.textContent = `✗ ${counts.failed}`;
          headerElement.appendChild(failedElement);
        }
        if (counts.skipped !== undefined) {
          const skippedElement = document.createElement('span');
          skippedElement.className = 'log-skipped';
          skippedElement.textContent = `- ${counts.skipped}`;
          headerElement.appendChild(skippedElement);
        }

        // Check if we have additional details for expandable content
        const hasDetails = Object.keys(counts).length > 0 || operation;
        let expandIcon = null;
        if (hasDetails) {
          expandIcon = document.createElement('span');
          expandIcon.className = 'log-expand-icon';
          expandIcon.innerHTML = '▶'; // Right-pointing triangle for collapsed state
          expandIcon.style.cursor = 'pointer';
          headerElement.appendChild(expandIcon);
        }
        logElement.appendChild(headerElement);

        // Create details container for expandable content
        if (hasDetails) {
          const detailsElement = document.createElement('div');
          detailsElement.className = 'log-details';
          detailsElement.style.display = 'none'; // Initially hidden

          // Add counts section if counts exist
          if (Object.keys(counts).length > 0) {
            const countsSection = document.createElement('div');
            countsSection.className = 'log-detail-section';
            const countsTitle = document.createElement('h4');
            countsTitle.textContent = 'Counts';
            countsSection.appendChild(countsTitle);
            const countsContent = document.createElement('pre');
            countsContent.className = 'log-detail-json';
            countsContent.textContent = JSON.stringify(counts, null, 2);
            countsSection.appendChild(countsContent);
            detailsElement.appendChild(countsSection);
          }

          // Add operation section if operation exists
          if (operation) {
            const operationSection = document.createElement('div');
            operationSection.className = 'log-detail-section';
            const operationTitle = document.createElement('h4');
            operationTitle.textContent = 'Operation';
            operationSection.appendChild(operationTitle);
            const operationContent = document.createElement('pre');
            operationContent.className = 'log-detail-json';
            operationContent.textContent = operation;
            operationSection.appendChild(operationContent);
            detailsElement.appendChild(operationSection);
          }
          logElement.appendChild(detailsElement);

          // Add click handler for expand/collapse functionality
          logElement.addEventListener('click', e => {
            // Don't expand if clicking on the expand icon itself
            if (e.target === expandIcon) {
              return;
            }
            const details = logElement.querySelector('.log-details');
            const icon = logElement.querySelector('.log-expand-icon');
            if (details && icon) {
              const isExpanded = details.style.display !== 'none';
              if (isExpanded) {
                // Collapse
                details.style.display = 'none';
                icon.innerHTML = '▶';
                logElement.classList.remove('expanded');
              } else {
                // Expand
                details.style.display = 'block';
                icon.innerHTML = '▼';
                logElement.classList.add('expanded');
              }
            }
          });

          // Add click handler for expand icon specifically
          if (expandIcon) {
            expandIcon.addEventListener('click', e => {
              e.stopPropagation(); // Prevent triggering the log entry click

              const details = logElement.querySelector('.log-details');
              const icon = logElement.querySelector('.log-expand-icon');
              if (details && icon) {
                const isExpanded = details.style.display !== 'none';
                if (isExpanded) {
                  // Collapse
                  details.style.display = 'none';
                  icon.innerHTML = '▶';
                  logElement.classList.remove('expanded');
                } else {
                  // Expand
                  details.style.display = 'block';
                  icon.innerHTML = '▼';
                  logElement.classList.add('expanded');
                }
              }
            });
          }
        }
        progressLogs.appendChild(logElement);
        progressLogs.scrollTop = progressLogs.scrollHeight;
      }
    } catch (error) {
      console.error('Error adding progress log entry:', error);
    }
  }
  refreshProgressData() {
    // Refresh progress data from server
    fetch('/api/queue/status').then(response => response.json()).then(data => {
      if (data.success && data.jobs) {
        // Update progress displays
        this.updateProgressFromServer(data.jobs);
      }
    }).catch(error => {
      this.logger.error('Error refreshing progress data:', error);
    });
  }
  logMessage(type, message) {
    let details = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : '';
    const logContainer = document.getElementById('log-entries');
    if (!logContainer) return;
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    const iconMap = {
      success: '✅',
      api: '🔄',
      warning: '⚠️',
      info: 'ℹ️',
      error: '❌'
    };
    const icon = iconMap[type] || '';
    const timestamp = new Date().toLocaleTimeString();

    // Create header with icon, timestamp, message, and expand icon if details exist
    const headerElement = document.createElement('div');
    headerElement.className = 'log-header';
    headerElement.style.display = 'flex';
    headerElement.style.alignItems = 'center';
    headerElement.style.gap = '8px';
    const iconElement = document.createElement('span');
    iconElement.className = 'log-icon';
    iconElement.textContent = icon;
    const timestampElement = document.createElement('span');
    timestampElement.className = 'log-timestamp';
    timestampElement.textContent = `[${timestamp}]`;
    const messageElement = document.createElement('span');
    messageElement.className = 'log-message';
    messageElement.textContent = message;
    headerElement.appendChild(iconElement);
    headerElement.appendChild(timestampElement);
    headerElement.appendChild(messageElement);

    // Add expand icon if details exist
    let expandIcon = null;
    if (details) {
      expandIcon = document.createElement('span');
      expandIcon.className = 'log-expand-icon';
      expandIcon.innerHTML = '▶'; // Right-pointing triangle for collapsed state
      expandIcon.style.cursor = 'pointer';
      headerElement.appendChild(expandIcon);
    }
    entry.appendChild(headerElement);

    // Add details if they exist
    if (details) {
      const detailsElement = document.createElement('div');
      detailsElement.className = 'log-details';
      detailsElement.style.display = 'none'; // Initially hidden
      detailsElement.innerHTML = details;
      entry.appendChild(detailsElement);

      // Add click handler for expand/collapse functionality
      entry.addEventListener('click', e => {
        // Don't expand if clicking on the expand icon itself
        if (e.target === expandIcon) {
          return;
        }
        const details = entry.querySelector('.log-details');
        const icon = entry.querySelector('.log-expand-icon');
        if (details && icon) {
          const isExpanded = details.style.display !== 'none';
          if (isExpanded) {
            // Collapse
            details.style.display = 'none';
            icon.innerHTML = '▶';
            entry.classList.remove('expanded');
          } else {
            // Expand
            details.style.display = 'block';
            icon.innerHTML = '▼';
            entry.classList.add('expanded');
          }
        }
      });

      // Add click handler for expand icon specifically
      if (expandIcon) {
        expandIcon.addEventListener('click', e => {
          e.stopPropagation(); // Prevent triggering the log entry click

          const details = entry.querySelector('.log-details');
          const icon = entry.querySelector('.log-expand-icon');
          if (details && icon) {
            const isExpanded = details.style.display !== 'none';
            if (isExpanded) {
              // Collapse
              details.style.display = 'none';
              icon.innerHTML = '▶';
              entry.classList.remove('expanded');
            } else {
              // Expand
              details.style.display = 'block';
              icon.innerHTML = '▼';
              entry.classList.add('expanded');
            }
          }
        });
      }
    }
    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
  }
  updateFileInfo(fileInfo) {
    console.log('File info section repositioned under CSV file input');
    console.log('File info section moved below file upload input.');
  }

  // Missing methods that were removed during cleanup

  async showView(viewName) {
    return await this.switchView(viewName);
  }
  switchView(viewName) {
    try {
      // Hide all views
      const views = document.querySelectorAll('[data-view]');
      views.forEach(view => {
        view.style.display = 'none';
      });

      // Show the requested view
      const targetView = document.querySelector(`[data-view="${viewName}"]`);
      if (!targetView) {
        throw new Error(`View '${viewName}' not found`);
      }
      targetView.style.display = 'block';

      // Update navigation
      this.navItems.forEach(item => {
        item.classList.remove('active');
      });
      const activeNav = document.querySelector(`[data-view="${viewName}"]`);
      if (activeNav) {
        activeNav.classList.add('active');
      }
      this.currentView = viewName;
      this.logger.info(`Switched to view: ${viewName}`);

      // Load logs if switching to logs view
      if (viewName === 'logs') {
        this.loadAndDisplayLogs();
      }
    } catch (error) {
      this.logger.error(`Error switching to view '${viewName}':`, error);
      throw error;
    }
  }

  /**
   * Load and display logs from the server
   */
  async loadAndDisplayLogs() {
    var _this = this;
    if (!this.logsView) {
      console.warn('Logs view element not found');
      return;
    }

    // Safe logging function
    const safeLog = function (message) {
      let level = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'log';
      let data = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;
      try {
        if (_this.logger) {
          if (typeof _this.logger[level] === 'function') {
            _this.logger[level](message, data);
            return;
          } else if (typeof _this.logger.log === 'function') {
            _this.logger.log(message, level, data);
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
      safeLog('Fetching logs from /api/logs...', 'debug');
      const response = await fetch('/api/logs?limit=200');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const responseData = await response.json();
      safeLog('Received logs from server', 'debug', {
        count: responseData.logs?.length
      });

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

        // === LOG LOADING: NEWEST FIRST ===
        // Process logs in reverse chronological order (newest first)
        // Logs are reversed so newest entries show first (top of the list)
        // Makes recent events immediately visible without scrolling
        // Maintain this ordering for all future log-related features
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

              // Insert at the top of the container (newest first)
              if (logEntries.firstChild) {
                logEntries.insertBefore(logElement, logEntries.firstChild);
              } else {
                logEntries.appendChild(logElement);
              }
            } else {
              safeLog(`Skipping invalid log entry at index ${index}`, 'warn', log);
            }
          } catch (logError) {
            safeLog(`Error processing log entry at index ${index}: ${logError.message}`, 'error', {
              error: logError
            });
          }
        });

        // Scroll to top since newest entries are at the top
        logEntries.scrollTop = 0;
      } else {
        const errorMsg = responseData.error || 'Failed to load logs';
        logEntries.innerHTML = `<div class="error">${errorMsg}</div>`;
        console.error('Failed to load logs:', errorMsg);
        if (this.logger && typeof this.logger.error === 'function') {
          this.logger.error('Failed to load logs:', errorMsg);
        }
      }
    } catch (error) {
      safeLog(`Error loading logs: ${error.message}`, 'error', {
        error
      });
      logEntries.innerHTML = `<div class="error">Failed to load logs: ${error.message}</div>`;
    }
  }
  addForm(formId, action, onSuccess, onError) {
    try {
      const form = document.getElementById(formId);
      if (!form) {
        this.logger.error(`Form with ID '${formId}' not found`);
        return;
      }

      // Store form handlers
      if (!this.forms) {
        this.forms = {};
      }
      this.forms[formId] = {
        action,
        onSuccess,
        onError
      };

      // Add submit handler
      form.addEventListener('submit', async event => {
        event.preventDefault();
        await this.handleFormSubmit(formId, event);
      });
      this.logger.info(`Form '${formId}' added with action '${action}'`);
    } catch (error) {
      this.logger.error(`Error adding form '${formId}':`, error);
    }
  }
  async handleFormSubmit(formId, event) {
    try {
      const formConfig = this.forms[formId];
      if (!formConfig) {
        this.logger.error(`No configuration found for form '${formId}'`);
        return;
      }

      // Convert FormData to JSON for testing compatibility
      const formData = new FormData(event.target);
      const jsonData = {};
      for (const [key, value] of formData.entries()) {
        jsonData[key] = value;
      }
      const response = await fetch(formConfig.action, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(jsonData)
      });
      const data = await response.json();
      if (data.success) {
        if (formConfig.onSuccess) {
          formConfig.onSuccess(data);
        }
      } else {
        if (formConfig.onError) {
          formConfig.onError(data);
        }
      }
    } catch (error) {
      this.logger.error(`Error submitting form '${formId}':`, error);
      if (this.forms[formId] && this.forms[formId].onError) {
        this.forms[formId].onError({
          error: error.message
        });
      }
    }
  }
  updateElementContent(elementId, content) {
    try {
      const element = document.getElementById(elementId);
      if (!element) {
        console.warn(`Element with ID '${elementId}' not found`);
        return;
      }
      element.innerHTML = content;
    } catch (error) {
      this.logger.error(`Error updating element '${elementId}':`, error);
    }
  }
  savePersistedStatus() {
    try {
      const status = {
        import: this.lastRunStatus.import,
        export: this.lastRunStatus.export,
        delete: this.lastRunStatus.delete,
        modify: this.lastRunStatus.modify,
        'population-delete': this.lastRunStatus['population-delete']
      };
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('pingone_import_status', JSON.stringify(status));
      }
    } catch (error) {
      this.logger.error('Error saving persisted status:', error);
    }
  }
  setButtonLoading(buttonId, isLoading) {
    try {
      const button = document.getElementById(buttonId);
      if (!button) {
        this.logger.warn(`Button with ID '${buttonId}' not found`);
        return;
      }
      if (isLoading) {
        // Add loading state
        button.disabled = true;
        button.classList.add('loading');

        // Add spinner if not already present
        if (!button.querySelector('.spinner-border')) {
          const spinner = document.createElement('span');
          spinner.className = 'spinner-border spinner-border-sm me-2';
          spinner.setAttribute('role', 'status');
          spinner.setAttribute('aria-hidden', 'true');
          button.insertBefore(spinner, button.firstChild);
        }
      } else {
        // Remove loading state
        button.disabled = false;
        button.classList.remove('loading');

        // Remove spinner
        const spinner = button.querySelector('.spinner-border');
        if (spinner) {
          spinner.remove();
        }
      }
    } catch (error) {
      this.logger.error(`Error setting button loading state for '${buttonId}':`, error);
    }
  }
  updateLiveStatus(message) {
    let type = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'info';
    const el = document.getElementById('status-live');
    if (!el) return;
    el.textContent = message;
    el.className = `status-message status-${type}`;
    el.style.display = 'block';
  }
  clearLiveStatus() {
    const el = document.getElementById('status-live');
    if (!el) return;
    el.textContent = '';
    el.style.display = 'none';
  }

  /**
   * Centralized debug logger for UI and import flow
   * @param {string} area - Tag/category for the log (e.g., 'Import', 'SSE')
   * @param {string} message - Log message
   * @param {any} data - Optional data to log
   */
  debugLog(area, message) {
    let data = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;
    if (!DEBUG_MODE) return;
    const formatted = `[DEBUG - ${area}] ${message}`;
    if (data !== null) {
      console.log(formatted, data);
    } else {
      console.log(formatted);
    }
    // Also log to debug window if present
    this.logDebugToWindow(area, message, data);
  }

  /**
   * Appends a debug log entry to the debug log window in the UI (if present)
   * @param {string} area - Log area/tag
   * @param {string} message - Log message
   * @param {any} data - Optional data
   */
  logDebugToWindow(area, message) {
    let data = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;
    const debugContent = document.getElementById('debug-log-content');
    if (!debugContent) return;
    // Create a new log entry element
    const entry = document.createElement('div');
    entry.className = `debug-log-entry debug-${area.toLowerCase()}`;
    entry.setAttribute('data-area', area.toLowerCase());
    entry.innerHTML = `<span class="debug-tag">[${area}]</span> <span class="debug-msg">${message}</span> ${data ? `<pre class='debug-data'>${JSON.stringify(data, null, 2)}</pre>` : ''}`;
    debugContent.appendChild(entry);
    debugContent.scrollTop = debugContent.scrollHeight;
    // Apply current filters
    applyDebugFilters();
  }
}
exports.UIManager = UIManager;

},{"./circular-progress.js":4,"./logger.js":10}],15:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.VersionManager = void 0;
class VersionManager {
  constructor() {
    this.version = '4.9'; // Update this with each new version
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

    // Update the top version badge
    this.updateTopVersionBadge();

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
  updateTopVersionBadge() {
    const versionText = document.getElementById('version-text');
    if (versionText) {
      versionText.textContent = this.getFormattedVersion();
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

// ES Module export
exports.VersionManager = VersionManager;

},{}]},{},[2]);
