(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
"use strict";

var _logger = require("./modules/logger.js");
var _uiManager = require("./modules/ui-manager.js");
var _fileHandler = require("./modules/file-handler.js");
var _settingsManager = require("./modules/settings-manager.js");
var _apiFactory = require("./modules/api-factory.js");
var _versionManager = require("./modules/version-manager.js");
// Main application entry point

class App {
  constructor() {
    try {
      console.log('App constructor starting...');

      // Initialize logger with the log container
      const logContainer = document.getElementById('logs-container');
      console.log('Log container found:', !!logContainer);
      this.logger = new _logger.Logger(logContainer);

      // Initialize settings manager first as it's used by other components
      this.settingsManager = new _settingsManager.SettingsManager(this.logger);

      // Initialize UI components
      this.uiManager = new _uiManager.UIManager(this.logger);
      this.fileHandler = new _fileHandler.FileHandler(this.logger, this.uiManager);

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
      this.versionManager = new _versionManager.VersionManager();

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
        this.logger.fileLogger.error(errorMsg, {
          error
        });
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
    var _this = this;
    try {
      // Add initial test logs
      this.logger.fileLogger.info('Application starting...');
      this.logger.fileLogger.debug('Logger initialized');

      // Initialize API factory and clients
      try {
        this.logger.fileLogger.info('Initializing API factory...');
        await (0, _apiFactory.initAPIFactory)(this.logger, this.settingsManager);

        // Now that factory is initialized, get the clients
        this.pingOneClient = _apiFactory.apiFactory.getPingOneClient();
        this.localClient = _apiFactory.apiFactory.getLocalClient();

        // Patch localClient to show UI warning on 429 errors
        if (this.localClient && this.localClient.post) {
          const origPost = this.localClient.post.bind(this.localClient);
          this.localClient.post = async function () {
            try {
              return await origPost(...arguments);
            } catch (error) {
              if (error?.response?.status === 429 && _this.uiManager) {
                _this.uiManager.showRateLimitWarning('You are being rate limited. Please wait and try again.');
              }
              throw error;
            }
          };
        }
        this.logger.fileLogger.info('API clients initialized successfully');

        // Patch fetch to show UI warning on 429 errors
        const originalFetch = window.fetch;
        window.fetch = async function () {
          try {
            const response = await originalFetch(...arguments);
            if (response.status === 429 && _this.uiManager) {
              _this.uiManager.showRateLimitWarning('You are being rate limited. Please wait and try again.');
            }
            return response;
          } catch (error) {
            if (error?.response?.status === 429 && _this.uiManager) {
              _this.uiManager.showRateLimitWarning('You are being rate limited. Please wait and try again.');
            }
            throw error;
          }
        };
        this.logger.fileLogger.info('Fetch patched for rate limit warnings');
      } catch (error) {
        const errorMsg = `Failed to initialize API: ${error.message}`;
        this.logger.fileLogger.error(errorMsg, {
          error
        });
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
      this.logger.fileLogger.error(errorMsg, {
        error
      });
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
        this.logger.fileLogger.info('Found saved settings', {
          hasSettings: true
        });

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
      this.logger.fileLogger.error(errorMsg, {
        error
      });
      console.error(errorMsg, error);
      throw error; // Re-throw to be handled by the caller
    }
  }
  setupEventListeners() {
    console.log('Setting up event listeners...');

    // General navigation event listeners for all nav items
    document.querySelectorAll('.nav-item').forEach(navItem => {
      navItem.addEventListener('click', e => {
        e.preventDefault();
        const view = navItem.getAttribute('data-view');
        if (view) {
          this.showView(view);
        }
      });
    });

    // Feature card navigation event listeners
    document.querySelectorAll('.feature-card').forEach(featureCard => {
      featureCard.addEventListener('click', e => {
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
      settingsForm.addEventListener('submit', async e => {
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
          this.logger.fileLogger.error('Error getting token', {
            error: error.message
          });
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
          this.logger.fileLogger.error('Error refreshing token', {
            error: error.message
          });
          this.uiManager.showNotification('Failed to refresh token: ' + error.message, 'error');
        }
      });
    }

    // Export button
    const exportBtn = document.getElementById('start-export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', async e => {
        e.preventDefault();
        await this.startExport();
      });
    }

    // Cancel export button
    const cancelExportBtn = document.getElementById('cancel-export-btn');
    if (cancelExportBtn) {
      cancelExportBtn.addEventListener('click', e => {
        e.preventDefault();
        this.cancelExport();
      });
    }

    // Delete CSV button
    const deleteCsvBtn = document.getElementById('start-delete-csv-btn');
    if (deleteCsvBtn) {
      deleteCsvBtn.addEventListener('click', async e => {
        e.preventDefault();
        await this.startDeleteCsv();
      });
    }

    // Cancel delete CSV button
    const cancelDeleteCsvBtn = document.getElementById('cancel-delete-csv-btn');
    if (cancelDeleteCsvBtn) {
      cancelDeleteCsvBtn.addEventListener('click', e => {
        e.preventDefault();
        this.cancelDeleteCsv();
      });
    }

    // Modify CSV button
    const modifyCsvBtn = document.getElementById('start-modify-csv-btn');
    if (modifyCsvBtn) {
      modifyCsvBtn.addEventListener('click', async e => {
        e.preventDefault();
        await this.startModifyCsv();
      });
    }

    // Cancel modify CSV button
    const cancelModifyCsvBtn = document.getElementById('cancel-modify-csv-btn');
    if (cancelModifyCsvBtn) {
      cancelModifyCsvBtn.addEventListener('click', e => {
        e.preventDefault();
        this.cancelModifyCsv();
      });
    }

    // Eye icon toggle for API secret visibility
    const apiSecretInput = document.getElementById('api-secret');
    const toggleApiSecretBtn = document.getElementById('toggle-api-secret-visibility');
    console.log('API Secret toggle setup:', {
      apiSecretInput: !!apiSecretInput,
      toggleApiSecretBtn: !!toggleApiSecretBtn
    });
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
      console.error('API Secret toggle elements not found:', {
        apiSecretInput: !!apiSecretInput,
        toggleApiSecretBtn: !!toggleApiSecretBtn
      });
    }

    // File upload event listeners
    const csvFileInput = document.getElementById('csv-file');
    console.log('CSV file input element:', csvFileInput);
    if (csvFileInput) {
      csvFileInput.addEventListener('change', event => {
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
    const populationDeleteSelect = document.getElementById('population-delete-select');
    if (populationDeleteSelect) {
      populationDeleteSelect.addEventListener('change', () => {
        this.updatePopulationDeleteButtonState();
      });
    }
    const cancelPopulationDeleteProgressBtn = document.getElementById('cancel-population-delete-progress');
    if (cancelPopulationDeleteProgressBtn) {
      cancelPopulationDeleteProgressBtn.addEventListener('click', e => {
        e.preventDefault();
        this.cancelPopulationDelete();
      });
    }

    // Cancel delete CSV progress button
    const cancelDeleteCsvProgressBtn = document.getElementById('cancel-delete-csv-progress');
    if (cancelDeleteCsvProgressBtn) {
      cancelDeleteCsvProgressBtn.addEventListener('click', e => {
        e.preventDefault();
        this.cancelDeleteCsv();
      });
    }

    // Cancel import progress button
    const cancelImportProgressBtn = document.getElementById('cancel-import-progress');
    if (cancelImportProgressBtn) {
      cancelImportProgressBtn.addEventListener('click', e => {
        e.preventDefault();
        this.cancelImport();
      });
    }

    // Cancel export progress button
    const cancelExportProgressBtn = document.getElementById('cancel-export-progress');
    if (cancelExportProgressBtn) {
      cancelExportProgressBtn.addEventListener('click', e => {
        e.preventDefault();
        this.cancelExport();
      });
    }

    // Cancel modify progress button
    const cancelModifyProgressBtn = document.getElementById('cancel-modify-progress');
    if (cancelModifyProgressBtn) {
      cancelModifyProgressBtn.addEventListener('click', e => {
        e.preventDefault();
        this.cancelModifyCsv();
      });
    }
    const closePopulationDeleteStatusBtn = document.getElementById('close-population-delete-status');
    if (closePopulationDeleteStatusBtn) {
      closePopulationDeleteStatusBtn.addEventListener('click', e => {
        e.preventDefault();
        this.uiManager.hidePopulationDeleteStatus();
      });
    }

    // Import button event listeners (top and bottom)
    const importButton = document.getElementById('start-import-btn');
    const importButtonBottom = document.getElementById('start-import-btn-bottom');
    if (importButton) {
      importButton.addEventListener('click', e => {
        console.log('Top import button clicked');
        e.preventDefault();
        this.startImport();
      });
      console.log('Top import button event listener attached');
    } else {
      console.error('Top import button not found');
    }
    if (importButtonBottom) {
      importButtonBottom.addEventListener('click', e => {
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
      cancelImportButton.addEventListener('click', e => {
        console.log('Top cancel import button clicked');
        e.preventDefault();
        this.cancelImport();
      });
      console.log('Top cancel import button event listener attached');
    } else {
      console.error('Top cancel import button not found');
    }
    if (cancelImportButtonBottom) {
      cancelImportButtonBottom.addEventListener('click', e => {
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
        this.logger.fileLogger.error('Failed to refresh populations', {
          error: error.message
        });
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
      this.logger.fileLogger.error('Error showing view', {
        view,
        error: error.message
      });
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
      this.pingOneClient = _apiFactory.apiFactory.getPingOneClient(this.logger, this.settingsManager);

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
      return {
        success: true
      };
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      this.logger.fileLogger.error('Error saving settings', {
        error: errorMessage
      });
      this.uiManager.updateConnectionStatus('error', `❌ Error: ${errorMessage}`, false);
      if (this.uiManager.showNotification) {
        this.uiManager.showNotification(`Error: ${errorMessage}`, 'error');
      }
      this.uiManager.updateSettingsSaveStatus(`❌ Error saving settings: ${errorMessage}`, 'error');
      return {
        success: false,
        error: errorMessage
      };
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
      this.logger.fileLogger.error('Error getting token', {
        error: errorMessage
      });
      this.uiManager.updateConnectionStatus('error', `❌ Error: ${errorMessage}`, false);
      if (this.uiManager.showNotification) {
        this.uiManager.showNotification(`Error getting token: ${errorMessage}`, 'error');
      }
      return {
        success: false,
        error: errorMessage
      };
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
      const settingsChanged = storedSettings.environmentId !== newSettings.environmentId || storedSettings.apiClientId !== newSettings.apiClientId || storedSettings.apiSecret !== newSettings.apiSecret || storedSettings.populationId !== newSettings.populationId || storedSettings.region !== newSettings.region;
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
          this.logger.fileLogger.warn('Failed to get new token with updated settings', {
            error: result.error
          });
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
      this.logger.fileLogger.error('Error checking settings and refreshing token', {
        error: error.message
      });
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
      const {
        server
      } = response;
      if (!server) {
        throw new Error('Server status not available');
      }
      const {
        pingOneInitialized,
        lastError
      } = server;
      if (pingOneInitialized) {
        this.logger.fileLogger.info('Server is connected to PingOne');
        this.uiManager.updateConnectionStatus('connected', 'Connected to PingOne');
        return true;
      } else {
        const errorMessage = lastError || 'Not connected to PingOne';
        this.logger.fileLogger.warn('Server is not connected to PingOne', {
          error: errorMessage
        });
        this.uiManager.updateConnectionStatus('disconnected', errorMessage);
        return false;
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      this.logger.fileLogger.error('Error checking server connection status', {
        error: errorMessage
      });

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
  async testPingOneConnection() {
    let customSettings = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;
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
        return {
          success: true,
          warning
        };
      } else {
        throw new Error(response.message || 'Failed to connect to PingOne API');
      }
    } catch (error) {
      const errorMessage = error.message || 'Connection failed';
      this.logger.fileLogger.error('Failed to connect to PingOne', {
        error: errorMessage
      });

      // Update connection status in settings
      const settings = this.settingsManager.getSettings() || {};
      settings.connectionStatus = 'disconnected';
      settings.connectionMessage = errorMessage;
      settings.lastConnectionTest = new Date().toISOString();

      // Save updated settings
      await this.settingsManager.saveSettings(settings);

      // Update UI status
      this.uiManager.updateConnectionStatus('error', errorMessage);
      return {
        success: false,
        error: errorMessage
      };
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
        const errorData = await response.json().catch(() => ({
          message: 'Unknown error'
        }));
        throw new Error(errorData.message || `Token refresh failed: ${response.status}`);
      }
      const result = await response.json();
      if (result.success) {
        this.logger.fileLogger.info('Successfully refreshed PingOne worker token');
        this.uiManager.updateConnectionStatus('connected', result.message || '✅ Token refreshed successfully');
        this.uiManager.showNotification('✅ Token refreshed successfully', 'success');
        return {
          success: true
        };
      } else {
        throw new Error(result.message || 'Failed to refresh token');
      }
    } catch (error) {
      const errorMessage = error.message || 'Token refresh failed';
      this.logger.fileLogger.error('Failed to refresh token', {
        error: errorMessage
      });

      // Update UI status
      this.uiManager.updateConnectionStatus('error', errorMessage);
      this.uiManager.showNotification(`❌ Token refresh failed: ${errorMessage}`, 'error');
      return {
        success: false,
        error: errorMessage
      };
    }
  }
  async startImport() {
    if (this.isImporting) return;
    this.isImporting = true;
    this.uiManager.setImporting(true);
    // Create AbortController for cancellation
    this.currentImportAbortController = new AbortController();

    // FIX: Declare importOptions at the top
    let importOptions = {};
    try {
      // Get the parsed users from the file handler
      const users = this.fileHandler.getParsedUsers();
      if (!users || users.length === 0) {
        throw new Error('No users found in CSV file. Please check your file and try again.');
      }

      // Get import options
      importOptions = this.getImportOptions();
      this.logger.fileLogger.info('Import options', importOptions);

      // Validate population selection
      const hasSelectedPopulation = importOptions.selectedPopulationId && importOptions.selectedPopulationId.trim() !== '';
      const useDefaultPopulation = importOptions.useDefaultPopulation;
      const useCsvPopulationId = importOptions.useCsvPopulationId;

      // Check if user has made a population choice
      if (!hasSelectedPopulation && !useDefaultPopulation && !useCsvPopulationId) {
        throw new Error('Please select a population or choose "Use default population from settings" before importing users.');
      }

      // Show import progress with population name
      this.uiManager.showImportStatus(users.length, importOptions.selectedPopulationName);
      this.uiManager.updateImportProgress(0, 0, 'Starting import...', {
        success: 0,
        failed: 0,
        skipped: 0
      }, importOptions.selectedPopulationName);

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
        userSample: users.slice(0, 3).map(u => ({
          email: u.email,
          username: u.username
        })),
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
        this.uiManager.showNotification(`${validationResults.invalidUsers.length} users failed validation and will be skipped. ${validationResults.validUsers.length} users will be imported.`, 'warning');
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
        importOptions,
        // Pass population selection options
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
    const confirmed = await this.confirmDeleteAction('<strong>⚠️ WARNING:</strong> This will permanently delete the selected users from PingOne. This action cannot be undone.<br><br>Are you absolutely sure you want to continue?');
    if (!confirmed) return;
    this.isDeletingCsv = true;
    this.uiManager.setDeletingCsv(true);
    this.uiManager.showDeleteCsvStatus(this.deleteCsvUsers.length);
    try {
      const results = await this.pingOneClient.deleteUsersFromCsv(this.deleteCsvUsers, {
        onProgress: progress => {
          this.uiManager.updateDeleteCsvProgress(progress.current, progress.total, `Deleting user ${progress.current} of ${progress.total}...`, progress);
        }
      });
      this.uiManager.updateDeleteCsvProgress(results.total, results.total, `Delete completed. Deleted: ${results.success}, Failed: ${results.failed}, Skipped: ${results.skipped}`, results);
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
  updateDeleteCsvProgress(current, total, message) {
    let counts = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};
    const percent = total ? Math.round(current / total * 100) : 0;
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
      this.logger.fileLogger.debug('File selected', {
        fileName: file.name,
        fileSize: file.size
      });

      // Use the file handler's handleFileObject method
      await this.fileHandler.handleFileObject(file);
    } catch (error) {
      const errorMsg = error.message || 'An unknown error occurred while processing the file';
      this.logger.fileLogger.error('Error processing file', {
        error: errorMsg
      });
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
      this.logger.fileLogger.error('Error checking settings', {
        error: error.message
      });
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
      this.logger.fileLogger.error('Error updating delete button state', {
        error: error.message
      });
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
      this.logger.fileLogger.error('Error updating modify button state', {
        error: error.message
      });
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
      this.factory = await (0, _apiFactory.initAPIFactory)(this.logger, this.settingsManager);

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
      this.logger.fileLogger.error(errorMsg, {
        error
      });
      this.uiManager.showError('Initialization Error', errorMsg);
    }
  }
  setupDisclaimerAgreement() {
    const acceptButton = document.getElementById('accept-disclaimer');
    const agreementCheckboxes = [document.getElementById('disclaimer-agreement'), document.getElementById('risk-acceptance')];
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
        onProgress: progress => {
          this.uiManager.updateModifyProgress(progress.current, progress.total, `Modifying user ${progress.current} of ${progress.total}...`, progress);
        },
        createIfNotExists: modifyOptions.createIfNotExists,
        updateUserStatus: modifyOptions.updateUserStatus,
        defaultPopulationId: modifyOptions.defaultPopulationId,
        defaultEnabled: modifyOptions.defaultEnabled,
        generatePasswords: modifyOptions.generatePasswords
      });
      this.uiManager.updateModifyProgress(results.total, results.total, `Modify completed. Modified: ${results.modified}, Created: ${results.created || 0}, Failed: ${results.failed}, Skipped: ${results.skipped}, No Changes: ${results.noChanges}`, results);
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
        this.logger.fileLogger.error(errorMsg, {
          error
        });
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
        const blob = new Blob([content], {
          type: mimeType
        });
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
      this.logger.fileLogger.error('Error saving file', {
        error,
        fileName,
        mimeType
      });
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
      this.logger.fileLogger.error('Failed to load populations', {
        error: error.message
      });

      // Show error but don't block the UI
      this.uiManager.showWarning('Population Loading Warning', 'Failed to load populations from PingOne. You can still use manual population ID entry.');

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
      this.logger.fileLogger.error('Failed to load populations for import', {
        error: error.message
      });

      // Show error but don't block the UI
      this.uiManager.showWarning('Population Loading Warning', 'Failed to load populations from PingOne. You can still use default population or manual entry.');

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
      this.logger.fileLogger.error('Failed to load export preferences', {
        error
      });
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
      const blob = new Blob([content], {
        type: mimeType
      });
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
      this.uiManager.showWarning('File Open Warning', `Could not open file with preferred application: ${error.message}. File was saved successfully.`);
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
      this.uiManager.showInfo('File Download Complete (macOS)', `File ${fileName} has been downloaded successfully.\n\n` + `To open the file on macOS:\n` + `1. Check your Downloads folder\n` + `2. Double-click the file to open with your default application\n` + `3. Or right-click and select "Open with" to choose a specific application\n` + `4. If the file doesn't open, right-click and select "Open" (this bypasses Gatekeeper)\n\n` + `💡 Tip: You can also drag the file to your preferred application's icon in the Dock.`);
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
      this.logger.fileLogger.warn('Failed to open with window.open', {
        error
      });
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
      this.uiManager.showInfo('Microsoft Excel (macOS)', `File ${fileName} has been downloaded successfully.\n\n` + `To open with Microsoft Excel on macOS:\n` + `1. Open Microsoft Excel\n` + `2. Click "File" > "Open"\n` + `3. Navigate to your Downloads folder\n` + `4. Select the file and click "Open"\n\n` + `💡 Alternative: Right-click the file and select "Open with" > "Microsoft Excel"`);
      return;
    }

    // For non-macOS systems, try to use the ms-excel protocol
    try {
      const excelUrl = `ms-excel:ofe|u|${url}`;
      window.location.href = excelUrl;
      this.uiManager.showSuccess(`Opening ${fileName} with Microsoft Excel`);
    } catch (error) {
      this.logger.fileLogger.warn('Failed to open with Excel protocol', {
        error
      });
      await this.openWithSystemDefault(url, fileName);
    }
  }

  /**
   * Open file with Google Sheets
   */
  async openWithGoogleSheets(content, fileName) {
    try {
      // For Google Sheets, we need to upload the file or provide instructions
      this.uiManager.showInfo('Google Sheets Integration', `File ${fileName} has been downloaded. To open in Google Sheets:\n\n` + `1. Go to sheets.google.com\n` + `2. Click "File" > "Import"\n` + `3. Select the downloaded file\n` + `4. Choose your import settings and click "Import data"`);
    } catch (error) {
      this.logger.fileLogger.warn('Failed to provide Google Sheets instructions', {
        error
      });
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
      this.uiManager.showInfo('LibreOffice Calc (macOS)', `File ${fileName} has been downloaded successfully.\n\n` + `To open with LibreOffice Calc on macOS:\n` + `1. Open LibreOffice Calc (from Applications folder)\n` + `2. Click "File" > "Open"\n` + `3. Navigate to your Downloads folder\n` + `4. Select the file and click "Open"\n\n` + `💡 Alternative: Right-click the file and select "Open with" > "LibreOffice Calc"\n` + `💡 Note: If LibreOffice isn't installed, you can download it from libreoffice.org`);
      return;
    }

    // For non-macOS systems, try to open with system default first
    try {
      await this.openWithSystemDefault(url, fileName);

      // Show additional instructions for LibreOffice
      this.uiManager.showInfo('LibreOffice Calc', `File ${fileName} has been downloaded. If LibreOffice Calc doesn't open automatically:\n\n` + `1. Open LibreOffice Calc\n` + `2. Click "File" > "Open"\n` + `3. Select the downloaded file\n` + `4. Choose your import settings if prompted`);
    } catch (error) {
      this.logger.fileLogger.warn('Failed to open with LibreOffice', {
        error
      });
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
      this.uiManager.showInfo('Apple Numbers (macOS)', `File ${fileName} has been downloaded successfully.\n\n` + `To open with Apple Numbers on macOS:\n` + `1. Open Numbers (from Applications folder or Spotlight)\n` + `2. Click "File" > "Open"\n` + `3. Navigate to your Downloads folder\n` + `4. Select the file and click "Open"\n\n` + `💡 Alternative: Right-click the file and select "Open with" > "Numbers"\n` + `💡 Tip: You can also drag the file to the Numbers icon in your Dock`);
      return;
    }

    // For non-macOS systems, try to open with system default first
    try {
      await this.openWithSystemDefault(url, fileName);

      // Show additional instructions for Numbers
      this.uiManager.showInfo('Apple Numbers', `File ${fileName} has been downloaded. If Numbers doesn't open automatically:\n\n` + `1. Open Numbers\n` + `2. Click "File" > "Open"\n` + `3. Select the downloaded file\n` + `4. Choose your import settings if prompted`);
    } catch (error) {
      this.logger.fileLogger.warn('Failed to open with Numbers', {
        error
      });
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
      this.uiManager.showInfo('Text Editor (macOS)', `File ${fileName} has been downloaded successfully.\n\n` + `To open with a text editor on macOS:\n` + `1. Right-click the file in Finder\n` + `2. Select "Open with" > "TextEdit" (or your preferred editor)\n` + `3. Or drag the file to TextEdit in your Applications folder\n\n` + `💡 Popular text editors on macOS:\n` + `• TextEdit (built-in)\n` + `• Visual Studio Code\n` + `• Sublime Text\n` + `• BBEdit`);
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
      this.logger.fileLogger.warn('Failed to open with text editor', {
        error
      });
    }

    // Show instructions
    this.uiManager.showInfo('Text Editor', `File ${fileName} has been downloaded. To open in your preferred text editor:\n\n` + `1. Right-click the downloaded file\n` + `2. Select "Open with" > "Text Editor" (or your preferred editor)\n` + `3. The CSV data will be displayed as plain text`);
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
        this.uiManager.showInfo('Custom Application (macOS)', `File ${fileName} has been downloaded successfully.\n\n` + `To open with your custom application on macOS:\n` + `1. Right-click the file in Finder\n` + `2. Select "Open with" > "Choose another app"\n` + `3. Navigate to: ${customPath}\n` + `4. Select your application and click "Open"\n\n` + `💡 Alternative: Drag the file to your application's icon in the Dock\n` + `�� Note: You may need to hold Option (⌥) when selecting "Open with" to see all applications`);
        return;
      }

      // For non-macOS systems, show instructions
      this.uiManager.showInfo('Custom Application', `File ${fileName} has been downloaded. To open with your custom application:\n\n` + `1. Locate the downloaded file\n` + `2. Right-click and select "Open with" > "Choose another app"\n` + `3. Navigate to: ${customPath}\n` + `4. Select your application and click "Open"`);
    } catch (error) {
      this.logger.fileLogger.warn('Failed to open with custom app', {
        error
      });
      this.showFileOpenInstructions(fileName);
    }
  }

  /**
   * Show general file open instructions
   */
  showFileOpenInstructions(fileName) {
    this.uiManager.showInfo('File Download Complete', `File ${fileName} has been downloaded successfully.\n\n` + `To open the file:\n` + `1. Check your Downloads folder\n` + `2. Double-click the file to open with your default application\n` + `3. Or right-click and select "Open with" to choose a specific application`);
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
    return new Promise(resolve => {
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
        resolve({
          action: 'back'
        });
      };

      // Handle continue button
      continueBtn.onclick = () => {
        modal.style.display = 'none';
        modal.classList.remove('show');
        resolve({
          action: 'continue'
        });
      };

      // Handle close button
      const closeBtn = modal.querySelector('.close');
      if (closeBtn) {
        closeBtn.onclick = () => {
          modal.style.display = 'none';
          modal.classList.remove('show');
          resolve({
            action: 'back'
          });
        };
      }
    });
  }
  async handleDeleteCsvFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      this.logger.fileLogger.info('Processing delete CSV file', {
        fileName: file.name,
        fileSize: file.size
      });

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
      this.logger.fileLogger.error('Error processing delete CSV file', {
        error: error.message
      });
      this.uiManager.showNotification(`Error processing file: ${error.message}`, 'error');
    } finally {
      this.uiManager.showLoading(false);
    }
  }
  async handleModifyCsvFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      this.logger.fileLogger.info('Processing modify CSV file', {
        fileName: file.name,
        fileSize: file.size
      });

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
      this.logger.fileLogger.error('Error processing modify CSV file', {
        error: error.message
      });
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
    const confirmed = await this.confirmDeleteAction(`<strong>⚠️ WARNING:</strong> This will permanently delete <b>ALL</b> users in the population <b>"${populationName}"</b>. This action cannot be undone.<br><br>Are you absolutely sure you want to continue?`);
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
    return new Promise(resolve => {
      const confirmed = confirm(`⚠️ WARNING: This action will permanently delete ALL users in the population "${populationName}".\n\n` + `This action cannot be undone. Are you absolutely sure you want to proceed?\n\n` + `Type "DELETE" to confirm:`);
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
        const progress = (i + 1) / totalUsers * 100;
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
  updatePopulationDeleteProgress(current, total, message) {
    let counts = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};
    const progressBar = document.getElementById('population-delete-progress');
    const progressPercent = document.getElementById('population-delete-progress-percent');
    const progressText = document.getElementById('population-delete-progress-text');
    const progressCount = document.getElementById('population-delete-progress-count');
    const successCount = document.getElementById('population-delete-success-count');
    const failedCount = document.getElementById('population-delete-failed-count');
    const skippedCount = document.getElementById('population-delete-skipped-count');
    if (progressBar) {
      const percent = total > 0 ? current / total * 100 : 0;
      progressBar.style.width = `${percent}%`;
      progressBar.setAttribute('aria-valuenow', percent);
    }
    if (progressPercent) progressPercent.textContent = `${Math.round(current / total * 100)}%`;
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
    this.showDeleteWarningModal = message => {
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
    const confirmed = await this.confirmDeleteAction(`<strong>⚠️ FINAL WARNING:</strong> This will permanently delete <b>ALL</b> users in your PingOne environment (${users.length} users). This action cannot be undone.<br><br>Are you absolutely sure you want to continue?`);
    if (!confirmed) return;
    // Show progress UI
    this.uiManager.showLoading(true, 'Deleting all users in environment...');
    let deleted = 0,
      failed = 0;
    for (let i = 0; i < users.length; i++) {
      try {
        await this.pingOneClient.deleteUser(users[i].id);
        deleted++;
      } catch (err) {
        failed++;
      }
      this.uiManager.showLoading(true, `Deleting user ${i + 1} of ${users.length}... (${deleted} deleted, ${failed} failed)`);
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
      deleteCsvCheckbox.addEventListener('change', e => {
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
      deletePopulationCheckbox.addEventListener('change', e => {
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
      deleteEnvironmentCheckbox.addEventListener('change', e => {
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
    modal.onclick = e => {
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
      const populations = populationsResp && populationsResp._embedded && populationsResp._embedded.populations ? populationsResp._embedded.populations : [];
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
      reader.onload = e => resolve(e.target.result);
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

},{"./modules/api-factory.js":2,"./modules/file-handler.js":4,"./modules/logger.js":8,"./modules/settings-manager.js":10,"./modules/ui-manager.js":11,"./modules/version-manager.js":12}],2:[function(require,module,exports){
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

},{"./local-api-client.js":6,"./pingone-client.js":9}],3:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.cryptoUtils = exports.CryptoUtils = void 0;
class CryptoUtils {
  /**
   * Generate a cryptographic key for encryption/decryption
   * @param {string} password - The password to derive the key from
   * @returns {Promise<CryptoKey>} A CryptoKey object
   */
  static async generateKey(password) {
    const encoder = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits', 'deriveKey']);
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
    const encrypted = await window.crypto.subtle.encrypt({
      name: 'AES-GCM',
      iv
    }, key, data);

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

},{}],4:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FileHandler = void 0;
class FileHandler {
  constructor(logger, uiManager) {
    this.logger = logger;
    this.uiManager = uiManager;
    this.requiredFields = ['username'];
    this.validationResults = {
      total: 0,
      valid: 0,
      errors: 0,
      warnings: 0
    };
    this.lastParsedUsers = [];
    this.currentFile = null;

    // Initialize UI elements
    this.fileInput = document.getElementById('csv-file');
    this.fileInfo = document.getElementById('file-info');
    this.previewContainer = document.getElementById('preview-container');

    // Load last file info from localStorage
    this.lastFileInfo = this.loadLastFileInfo();

    // Initialize event listeners
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
   * @returns {File|null} The current file or null if none
   */
  getCurrentFile() {
    return this.currentFile;
  }

  /**
   * Get the list of parsed users
   * @returns {Array} Array of user objects
   */
  getUsers() {
    return this.lastParsedUsers || [];
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
    await this._handleFileInternal(file, event);
  }

  /**
   * Shared internal file handling logic
   * @param {File} file
   * @param {Event} [event]
   * @private
   */
  async _handleFileInternal(file, event) {
    // Debug: Log the file object structure
    this.logger.debug('File object received:', {
      hasFile: !!file,
      fileType: typeof file,
      hasName: !!file.name,
      hasSize: !!file.size,
      fileName: file.name,
      fileSize: file.size
    });

    // Validate file has required properties
    if (!file.name) {
      this.logger.error('File object missing name property', {
        file
      });
      this.uiManager.showNotification('Invalid file object: missing file name', 'error');
      return;
    }

    // Permissive file type validation: only block known bad extensions
    const knownBadExtensions = ['.exe', '.js', '.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.tar', '.gz'];
    const fileNameLower = file.name.toLowerCase();
    const hasBadExtension = knownBadExtensions.some(ext => fileNameLower.endsWith(ext));
    if (hasBadExtension) {
      this.logger.error('Invalid file type. Please select a CSV or text file.');
      this.uiManager.showNotification('Please select a CSV or text file.', 'error');
      return;
    }
    // Warn if not .csv/.txt, but allow
    const allowedExtensions = ['.csv', '.txt', ''];
    const hasAllowedExtension = allowedExtensions.some(ext => fileNameLower.endsWith(ext));
    if (!hasAllowedExtension) {
      this.logger.warn('File does not have a standard CSV or text extension, attempting to process anyway.', {
        fileName: file.name
      });
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      this.logger.error('File too large. Maximum size is 10MB.');
      this.uiManager.showNotification('File too large. Maximum size is 10MB.', 'error');
      return;
    }
    try {
      this.logger.info('Processing CSV file', {
        fileName: file.name,
        fileSize: file.size,
        lastModified: file.lastModified
      });
      console.log('About to parse CSV file', file);

      // Show loading state
      this.uiManager.showNotification('Processing CSV file...', 'info');

      // Parse CSV file with robust validation
      const parseResults = await this.parseCSVFile(file);
      console.log('CSV parsing completed', parseResults);
      this.logger.info('CSV parsing completed', {
        totalRows: parseResults.totalRows,
        validUsers: parseResults.validUsers,
        invalidUsers: parseResults.invalidUsers,
        errorCount: parseResults.errors.length,
        headers: parseResults.headers
      });

      // Store the parsed results
      this.currentFile = file;
      this.parsedUsers = parseResults.users;
      this.lastParsedUsers = parseResults.users; // Also store in lastParsedUsers for compatibility
      this.parseResults = parseResults;

      // Show results to user
      let message = `CSV file processed successfully! Found ${parseResults.validUsers} valid users.`;
      if (parseResults.invalidUsers > 0) {
        message += ` ${parseResults.invalidUsers} users had validation errors and will be skipped.`;
      }
      if (parseResults.errors.length > 0) {
        message += ` ${parseResults.errors.length} rows had parsing errors.`;
      }
      this.uiManager.showNotification(message, parseResults.invalidUsers > 0 ? 'warning' : 'success');

      // Update UI with enhanced file info display
      this.updateFileInfoForElement(file, 'file-info');

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
  async processCSV(file) {
    // Log file object for debugging
    this.logger.log('Processing file object:', 'debug', file);

    // Validate file
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
          const {
            headers,
            rows
          } = this.parseCSV(text);

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
  // CSV Parsing
  // ======================

  parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) {
      throw new Error('CSV must contain at least a header row and one data row');
    }
    const headers = this.parseCSVLine(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      rows.push(row);
    }
    return {
      headers,
      rows
    };
  }
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
   * Parse CSV file and extract users
   * @param {File} file - CSV file to parse
   * @returns {Promise<Object>} Parsed users with validation results
   */
  async parseCSVFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = event => {
        try {
          const csvContent = event.target.result;
          const lines = csvContent.split('\n').filter(line => line.trim());
          if (lines.length < 2) {
            reject(new Error('CSV file must contain at least a header row and one data row'));
            return;
          }

          // Parse header row
          const headers = this.parseCSVRow(lines[0]);
          const requiredHeaders = ['username'];
          const missingHeaders = requiredHeaders.filter(header => !headers.some(h => h.toLowerCase() === header.toLowerCase()));
          if (missingHeaders.length > 0) {
            reject(new Error(`Missing required headers: ${missingHeaders.join(', ')}. Required headers are: ${requiredHeaders.join(', ')}`));
            return;
          }

          // Parse data rows
          const users = [];
          const errors = [];
          for (let i = 1; i < lines.length; i++) {
            try {
              const user = this.parseUserRow(lines[i], headers, i + 1);
              if (user) {
                users.push(user);
              }
            } catch (error) {
              errors.push({
                row: i + 1,
                error: error.message,
                line: lines[i]
              });
            }
          }

          // Validate parsed users
          const validationResults = this.validateParsedUsers(users);
          resolve({
            users: validationResults.validUsers,
            totalRows: lines.length - 1,
            validUsers: validationResults.validUsers.length,
            invalidUsers: validationResults.invalidUsers.length,
            errors: [...errors, ...validationResults.errors],
            headers: headers,
            sample: users.slice(0, 5) // First 5 users for preview
          });
        } catch (error) {
          reject(new Error(`Failed to parse CSV file: ${error.message}`));
        }
      };
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      reader.readAsText(file);
    });
  }

  /**
   * Parse a single CSV row
   * @param {string} line - CSV line to parse
   * @returns {Array<string>} Array of header values
   * @private
   */
  parseCSVRow(line) {
    // Handle quoted fields and commas within quotes
    const headers = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        headers.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    // Add the last field
    headers.push(current.trim());
    return headers;
  }

  /**
   * Parse a user row from CSV
   * @param {string} line - CSV line to parse
   * @param {Array<string>} headers - Header row
   * @param {number} rowNumber - Row number for error reporting
   * @returns {Object|null} Parsed user object or null if invalid
   * @private
   */
  parseUserRow(line, headers, rowNumber) {
    if (!line.trim()) {
      return null; // Skip empty lines
    }
    const values = this.parseCSVRow(line);
    if (values.length !== headers.length) {
      throw new Error(`Row ${rowNumber}: Number of columns (${values.length}) doesn't match headers (${headers.length})`);
    }
    const user = {};
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i].toLowerCase().trim();
      let value = values[i].trim();

      // Handle boolean values
      if (header === 'enabled') {
        if (value === 'true' || value === '1') {
          value = true;
        } else if (value === 'false' || value === '0') {
          value = false;
        } else if (value === '') {
          value = true; // Default to enabled
        } else {
          throw new Error(`Row ${rowNumber}: Invalid enabled value '${value}'. Must be true/false or 1/0`);
        }
      }

      // Map common header variations
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
      const mappedHeader = headerMap[header] || header;
      user[mappedHeader] = value;
    }

    // Validate required fields
    if (!user.username) {
      throw new Error(`Row ${rowNumber}: User must have a username`);
    }

    // Set default username if not provided
    if (!user.username && user.email) {
      user.username = user.email;
    }
    return user;
  }

  /**
   * Validate parsed users
   * @param {Array<Object>} users - Users to validate
   * @returns {Object} Validation results
   * @private
   */
  validateParsedUsers(users) {
    const validUsers = [];
    const invalidUsers = [];
    const errors = [];
    const seenEmails = new Set();
    const seenUsernames = new Set();
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const rowNumber = i + 1;
      let isValid = true;
      let errorMessage = '';

      // Check for duplicate emails
      if (user.email) {
        if (seenEmails.has(user.email.toLowerCase())) {
          errorMessage = `Duplicate email '${user.email}' found in row ${rowNumber}`;
          isValid = false;
        } else {
          seenEmails.add(user.email.toLowerCase());
        }

        // Validate email format
        if (!this.isValidEmail(user.email)) {
          errorMessage = `Invalid email format '${user.email}' in row ${rowNumber}`;
          isValid = false;
        }
      }

      // Check for duplicate usernames
      if (user.username) {
        if (seenUsernames.has(user.username.toLowerCase())) {
          errorMessage = `Duplicate username '${user.username}' found in row ${rowNumber}`;
          isValid = false;
        } else {
          seenUsernames.add(user.username.toLowerCase());
        }

        // Validate username format
        if (!this.isValidUsername(user.username)) {
          errorMessage = `Invalid username format '${user.username}' in row ${rowNumber} (no spaces or special characters)`;
          isValid = false;
        }
      }
      if (isValid) {
        validUsers.push(user);
      } else {
        invalidUsers.push(user);
        errors.push({
          row: rowNumber,
          user: user.email || user.username || `Row ${rowNumber}`,
          error: errorMessage
        });
      }
    }
    return {
      validUsers,
      invalidUsers,
      errors
    };
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
    if (!container || !file) return;
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
      // Disable import buttons if no rows
      const importBtn = document.getElementById('start-import-btn');
      const importBtnBottom = document.getElementById('start-import-btn-bottom');
      if (importBtn) {
        importBtn.disabled = true;
      }
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

    // Enable import buttons after showing preview (only if population choice is made)
    const importBtn = document.getElementById('start-import-btn');
    const importBtnBottom = document.getElementById('start-import-btn-bottom');
    if (importBtn) {
      importBtn.disabled = !hasPopulationChoice;
      this.logger.log(`Import button ${hasPopulationChoice ? 'enabled' : 'disabled'}`, 'debug');
    } else {
      this.logger.warn('Could not find import button to enable', 'warn');
    }
    if (importBtnBottom) {
      importBtnBottom.disabled = !hasPopulationChoice;
      this.logger.log(`Bottom import button ${hasPopulationChoice ? 'enabled' : 'disabled'}`, 'debug');
    } else {
      this.logger.warn('Could not find bottom import button to enable', 'warn');
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

},{}],5:[function(require,module,exports){
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

},{}],6:[function(require,module,exports){
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

},{}],7:[function(require,module,exports){
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

},{}],8:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Logger = void 0;
var _fileLogger = require("./file-logger.js");
class Logger {
  constructor() {
    let logContainer = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;
    // Initialize properties
    this.logs = [];
    this.maxLogs = 1000;
    this.initialized = false;
    this.offlineLogs = [];
    this.isOnline = typeof window !== 'undefined' ? window.navigator.onLine : true;
    this.logContainer = null;

    // Initialize log container
    this._initLogContainer(logContainer);

    // Create a safe file logger that won't throw errors
    this.fileLogger = this._createSafeFileLogger();

    // Mark as initialized
    this.initialized = true;
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

      // Create a more structured log entry
      const timeElement = document.createElement('span');
      timeElement.className = 'log-time';
      timeElement.textContent = timeStr;
      const levelElement = document.createElement('span');
      levelElement.className = `log-level ${logEntry.level}`;
      levelElement.textContent = logEntry.level.toUpperCase();
      const messageElement = document.createElement('div');
      messageElement.className = 'log-message';
      messageElement.textContent = logEntry.message;

      // Create a container for the log header (time, level, message)
      const headerElement = document.createElement('div');
      headerElement.className = 'log-header';
      headerElement.appendChild(timeElement);
      headerElement.appendChild(levelElement);
      headerElement.appendChild(messageElement);
      logElement.appendChild(headerElement);

      // Add data if it exists
      if (logEntry.data) {
        const dataElement = document.createElement('pre');
        dataElement.className = 'log-data';
        dataElement.textContent = JSON.stringify(logEntry.data, null, 2);
        logElement.appendChild(dataElement);
      }

      // Add context if it exists
      if (logEntry.context) {
        const contextElement = document.createElement('pre');
        contextElement.className = 'log-context';
        contextElement.textContent = `Context: ${JSON.stringify(logEntry.context, null, 2)}`;
        logElement.appendChild(contextElement);
      }

      // Add to the top of the log container
      if (this.logContainer.firstChild) {
        this.logContainer.insertBefore(logElement, this.logContainer.firstChild);
      } else {
        this.logContainer.appendChild(logElement);
      }

      // Auto-scroll to top (since we're adding to the top)
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

    // Send log to server
    try {
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

},{"./file-logger.js":5}],9:[function(require,module,exports){
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
    // Check for cached token first
    const cachedToken = this.getCachedToken();
    if (cachedToken) {
      let timeLeftMsg = '';
      if (typeof localStorage !== 'undefined') {
        const expiry = localStorage.getItem('pingone_token_expiry');
        if (expiry) {
          const expiryTime = parseInt(expiry, 10);
          const now = Date.now();
          const msLeft = expiryTime - now;
          if (msLeft > 0) {
            const min = Math.floor(msLeft / 60000);
            const sec = Math.floor(msLeft % 60000 / 1000);
            timeLeftMsg = ` (expires in ${min}m ${sec}s)`;
          }
        }
      }
      const msg = `✅ Using cached PingOne Worker token${timeLeftMsg}`;
      if (typeof window !== 'undefined' && window.app && window.app.uiManager) {
        window.app.uiManager.updateConnectionStatus('connected', msg);
        window.app.uiManager.showNotification(msg, 'success');
      }
      this.accessToken = cachedToken; // Cache the token
      return cachedToken;
    }

    // If no cached token or it's expired, get a new one from the server
    try {
      const response = await fetch('/api/pingone/get-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to get access token: ${response.status} - ${error}`);
      }
      const data = await response.json();

      // Cache the new token
      try {
        if (typeof localStorage !== 'undefined' && typeof window !== 'undefined') {
          const expiryTime = Date.now() + data.expires_in * 1000;
          try {
            localStorage.setItem('pingone_worker_token', data.access_token);
            localStorage.setItem('pingone_token_expiry', expiryTime.toString());

            // Update status bar with new token info
            let timeLeftMsg = '';
            const min = Math.floor(data.expires_in / 60);
            const sec = data.expires_in % 60;
            timeLeftMsg = ` (expires in ${min}m ${sec}s)`;
            const msg = `✅ New PingOne Worker token obtained${timeLeftMsg}`;
            if (window.app && window.app.uiManager) {
              window.app.uiManager.updateConnectionStatus('connected', msg);
              window.app.uiManager.showNotification(msg, 'success');
            }
          } catch (storageError) {
            console.warn('Failed to store token in localStorage:', storageError);
            // Continue without storing the token
          }
        }
      } catch (error) {
        console.warn('Error accessing localStorage:', error);
        // Continue without storing the token
      }
      this.accessToken = data.access_token; // Cache the token
      return data.access_token;
    } catch (error) {
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

    // Retry logic
    let lastError = null;
    for (let attempt = 1; attempt <= (options.retries || 3); attempt++) {
      try {
        const response = await this.localAPI.request(method, url, data, options);

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
        return response;
      } catch (error) {
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
          throw error;
        }

        // Only retry for rate limits (429) and server errors (5xx)
        const shouldRetry = isRateLimit || error.status >= 500 || !error.status;
        if (!shouldRetry) {
          // Don't retry for client errors (4xx except 429), throw immediately
          throw error;
        }

        // Use the delay calculated above
        this.logger.info(`Retrying request in ${delay}ms... (attempt ${attempt + 1}/${options.retries || 3})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // If all retries fail, throw the last error
    throw lastError;
  }

  /**
   * Get all populations from PingOne
   * @returns {Promise<Array>} Array of population objects
   */
  async getPopulations() {
    const settings = this.getSettings();
    return this.request('GET', `/environments/${settings.environmentId}/populations`);
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

    // Validate input
    if (!users || !Array.isArray(users) || users.length === 0) {
      throw new Error('No users provided for import');
    }
    if (!settings.environmentId) {
      throw new Error('Environment ID not configured');
    }

    // Handle population selection based on import options
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
    }
    // Priority 2: Default population from settings
    else if (useDefaultPopulation && settings.populationId) {
      fallbackPopulationId = settings.populationId;
    }
    // Priority 3: Fetch populations from PingOne and use first one
    else {
      try {
        const populationsResp = await this.getPopulations();
        let populations = populationsResp && populationsResp._embedded && populationsResp._embedded.populations ? populationsResp._embedded.populations : [];
        if (populations.length > 0) {
          // Use the first population as default (or find one marked as default if available)
          fallbackPopulationId = populations[0].id;
          // Optionally, look for a population marked as default
          const defaultPop = populations.find(p => p.default === true);
          if (defaultPop) fallbackPopulationId = defaultPop.id;
        } else {
          // No populations exist, prompt the user and return
          if (window.app && window.app.uiManager) {
            window.app.uiManager.showNotification('No populations found in PingOne. Please create a population and try again.', 'error');
            window.app.showView('import');
          }
          return {
            total: totalUsers,
            success: 0,
            failed: 0,
            skipped: 0,
            results: [],
            error: 'No populations found in PingOne.'
          };
        }
      } catch (err) {
        this.logger.error('Failed to fetch populations from PingOne:', err);
        if (window.app && window.app.uiManager) {
          window.app.uiManager.showNotification('Failed to fetch populations from PingOne. Please check your connection and try again.', 'error');
          window.app.showView('import');
        }
        return {
          total: totalUsers,
          success: 0,
          failed: 0,
          skipped: 0,
          results: [],
          error: 'Failed to fetch populations from PingOne.'
        };
      }
    }
    this.logger.info('Population selection for import', {
      useCsvPopulationId,
      selectedPopulationId,
      useDefaultPopulation,
      fallbackPopulationId,
      settingsPopulationId: settings.populationId
    });

    // Process users in batches with improved error handling
    const batchSize = 10; // Increased from 5 to 10 for better throughput

    for (let i = 0; i < totalUsers; i += batchSize) {
      // Check for cancellation before processing each batch
      if (abortController && abortController.signal.aborted) {
        this.logger.info('Import cancelled by user during batch processing');
        throw new Error('Import cancelled by user');
      }

      // Process current batch
      const batch = users.slice(i, i + batchSize);

      // Process users sequentially within each batch to avoid overwhelming the API
      for (let batchIndex = 0; batchIndex < batch.length; batchIndex++) {
        const currentIndex = i + batchIndex;
        const currentUser = users[currentIndex];

        // Check for cancellation before processing each user
        if (abortController && abortController.signal.aborted) {
          this.logger.info('Import cancelled by user during user processing');
          throw new Error('Import cancelled by user');
        }
        try {
          // Call progress callback before processing each user
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
            continue; // Continue to next user
          }

          // Determine population ID for this user
          let userPopulationId = fallbackPopulationId;
          if (useCsvPopulationId && currentUser.populationId) {
            // Use population ID from CSV if available
            userPopulationId = currentUser.populationId;
            this.logger.info(`Using CSV population ID for user ${currentUser.email || currentUser.username}: ${userPopulationId}`);
          } else if (fallbackPopulationId) {
            // Use fallback population ID
            this.logger.info(`Using fallback population ID for user ${currentUser.email || currentUser.username}: ${fallbackPopulationId}`);
          } else {
            throw new Error('No population ID available for user');
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
            },
            enabled: currentUser.enabled !== false
          };

          // Add password only if provided, otherwise let PingOne generate one
          if (currentUser.password) {
            userData.password = {
              value: currentUser.password
            };
          }

          // Add any additional user properties
          if (currentUser.additionalProperties) {
            Object.assign(userData, currentUser.additionalProperties);
          }

          // Make the API request with retry logic
          let result;
          let lastError = null;
          for (let attempt = 1; attempt <= retryAttempts; attempt++) {
            // Check for cancellation before each retry attempt
            if (abortController && abortController.signal.aborted) {
              this.logger.info('Import cancelled by user during retry attempt');
              throw new Error('Import cancelled by user');
            }
            try {
              result = await this.request('POST', endpoint, userData);

              // Check for backend warning (uniqueness violation)
              if (result && result.warning === true && /already exists/i.test(result.message)) {
                this.logger.warn(`User ${currentUser.email || currentUser.username} already exists, skipping`, 'warn');
                skippedCount++;
                // Call progress callback for skipped user
                if (onProgress) {
                  onProgress(currentIndex + 1, totalUsers, currentUser, {
                    success: successCount,
                    failed: failedCount,
                    skipped: skippedCount
                  });
                }
                results.push({
                  success: false,
                  user: currentUser,
                  error: 'User already exists',
                  skipped: true
                });
                break; // Break out of retry loop and continue to next user
              }
              successCount++;
              results.push({
                success: true,
                user: currentUser,
                result
              });
              break; // Break out of retry loop on success
            } catch (error) {
              lastError = error;

              // Check if this is a retryable error
              if (this.isRetryableError(error) && attempt < retryAttempts) {
                this.logger.warn(`Attempt ${attempt} failed for user ${currentUser.email || currentUser.username}, retrying in ${delayBetweenRetries}ms...`, 'warn');
                retryCount++;
                await new Promise(resolve => setTimeout(resolve, delayBetweenRetries));
                continue;
              }

              // If we've exhausted retries or it's not retryable, break
              break;
            }
          }

          // If we get here, all attempts failed
          if (!result || result && result.warning === true && /already exists/i.test(result.message)) {
            // User was skipped, already handled above
            continue;
          }

          // If we get here, all attempts failed
          if (lastError) {
            this.logger.error(`All ${retryAttempts} attempts failed for user ${currentUser.email || currentUser.username}: ${lastError.message}`, 'error');
            failedCount++;
            if (options.continueOnError) {
              results.push({
                success: false,
                user: currentUser,
                error: lastError.message,
                skipped: false
              });
              continue; // Continue to next user instead of throwing
            }
            throw lastError;
          }
        } catch (error) {
          // Check if this was a cancellation
          if (error.message === 'Import cancelled by user' || error.name === 'AbortError') {
            this.logger.info('Import cancelled by user during user processing');
            throw error; // Re-throw to be caught by the main try-catch
          }
          this.logger.error('Error importing user:', error);
          failedCount++;
          if (options.continueOnError) {
            // Old logic for 409 Conflict (should not be needed now, but keep for safety)
            const isSkipped = error.response?.status === 409;
            if (isSkipped) {
              this.logger.warn(`User ${currentUser.email} already exists, skipping`, 'warn');
              skippedCount++;
              // Call progress callback for skipped user
              if (onProgress) {
                onProgress(currentIndex + 1, totalUsers, currentUser, {
                  success: successCount,
                  failed: failedCount,
                  skipped: skippedCount
                });
              }
              results.push({
                success: false,
                user: currentUser,
                error: 'User already exists',
                skipped: true
              });
              continue; // Continue to next user
            }
            results.push({
              success: false,
              user: currentUser,
              error: error.message,
              skipped: false
            });
            continue; // Continue to next user
          }
          throw error;
        }

        // Add small delay between individual user operations to prevent rate limiting
        if (batchIndex < batch.length - 1) {
          // Check for cancellation before delay
          if (abortController && abortController.signal.aborted) {
            this.logger.info('Import cancelled by user during delay');
            throw new Error('Import cancelled by user');
          }
          await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay between users
        }
      }

      // Add delay between batches to avoid rate limiting
      if (i + batchSize < totalUsers) {
        // Check for cancellation before batch delay
        if (abortController && abortController.signal.aborted) {
          this.logger.info('Import cancelled by user during batch delay');
          throw new Error('Import cancelled by user');
        }
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay between batches
      }

      // Call progress callback after batch completes
      if (onProgress) {
        const processedCount = Math.min(i + batch.length, totalUsers);
        onProgress(processedCount, totalUsers, null, {
          success: successCount,
          failed: failedCount,
          skipped: skippedCount,
          retries: retryCount
        });
      }
    }
    return {
      total: totalUsers,
      success: successCount,
      failed: failedCount,
      skipped: skippedCount,
      retries: retryCount,
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
   * Delete a single user by ID
   * @param {string} userId - User ID to delete
   * @returns {Promise<void>}
   */
  async deleteUser(userId) {
    if (!userId) {
      throw new Error('User ID is required for deletion');
    }
    try {
      this.logger.info(`[DELETE] Deleting user with ID: ${userId}`);
      await this.request('DELETE', `/environments/${this.getSettings().environmentId}/users/${userId}`);
      this.logger.info(`[DELETE] Successfully deleted user: ${userId}`);
    } catch (error) {
      this.logger.error(`[DELETE] Failed to delete user ${userId}: ${error.message}`);
      throw error;
    }
  }
  async modifyUsersFromCsv(users) {
    let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    const {
      onProgress,
      batchSize = 10,
      delayBetweenBatches = 1000,
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
      const batchPromises = batch.map(async (user, batchIndex) => {
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

              // Prepare user data for creation
              const userData = {
                name: {
                  given: user.firstName || user.givenName || '',
                  family: user.lastName || user.familyName || ''
                },
                email: user.email,
                username: user.username || user.email,
                population: {
                  id: user.populationId || defaultPopulationId || this.getSettings().populationId
                },
                enabled: user.enabled !== undefined ? user.enabled : defaultEnabled
              };

              // Add password if generatePasswords is enabled
              if (generatePasswords) {
                userData.password = {
                  value: this.generateTemporaryPassword()
                };
              }

              // Create the user
              const createdUser = await this.request('POST', `/environments/${this.getSettings().environmentId}/users`, userData);
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
          if (updateUserStatus && user.enabled !== undefined && user.enabled !== existingUser.enabled) {
            // Convert string values to boolean if needed
            let newEnabledValue = user.enabled;
            if (typeof newEnabledValue === 'string') {
              newEnabledValue = newEnabledValue.toLowerCase() === 'true' || newEnabledValue === '1';
            }
            if (newEnabledValue !== existingUser.enabled) {
              changes.enabled = newEnabledValue;
              hasChanges = true;
              this.logger.debug(`[MODIFY] Enabled status will be changed from "${existingUser.enabled}" to "${newEnabledValue}"`);
            }
          } else if (!updateUserStatus && user.enabled !== undefined && user.enabled !== existingUser.enabled) {
            // Show warning only if updateUserStatus is not enabled
            this.logger.warn(`[MODIFY] Cannot modify 'enabled' status for user ${existingUser.username} - updateUserStatus option is disabled`);
            if (window.app && window.app.uiManager) {
              window.app.uiManager.showWarning(`Cannot modify 'enabled' status for user ${existingUser.username} - updateUserStatus option is disabled`);
            }
          }

          // For PingOne API, we need to include required fields in the update
          // Always include username and email as they are required
          if (hasChanges) {
            changes.username = existingUser.username;
            changes.email = existingUser.email;
            this.logger.debug(`[MODIFY] Including required fields: username=${existingUser.username}, email=${existingUser.email}`);
          }
          if (!hasChanges) {
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

          // Update the user with changes
          await this.request('PUT', `/environments/${this.getSettings().environmentId}/users/${existingUser.id}`, changes);
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
      });

      // Wait for current batch to complete
      await Promise.all(batchPromises);

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
  async getAllUsersInPopulation(populationId) {
    const settings = this.getSettings();
    const users = [];
    let page = 1;
    const pageSize = 100;
    let total = 0;
    let fetched = 0;
    do {
      // Use the general users endpoint with population filter instead of the non-existent populations/users endpoint
      const resp = await this.request('GET', `/environments/${settings.environmentId}/users?limit=${pageSize}&page=${page}&population.id=${populationId}`);
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
   * Fetch all users in a specific population using the correct API endpoint
   * @param {string} populationId - The population ID
   * @returns {Promise<Array>} Array of user objects
   */
  async getUsersByPopulation(populationId) {
    const settings = this.getSettings();
    const users = [];
    let page = 1;
    const pageSize = 100;
    let total = 0;
    let fetched = 0;
    do {
      // Use the general users endpoint with population filter
      const resp = await this.request('GET', `/environments/${settings.environmentId}/users?limit=${pageSize}&page=${page}&population.id=${populationId}`);
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
}
exports.PingOneClient = PingOneClient;

},{"./local-api.js":7}],10:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.settingsManager = exports.SettingsManager = void 0;
var _cryptoUtils = require("./crypto-utils.js");
class SettingsManager {
  constructor(logger) {
    // Initialize settings and storage key
    this.settings = this.getDefaultSettings();
    this.storageKey = 'pingone-import-settings';
    this.crypto = new _cryptoUtils.CryptoUtils();
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
          const serverSettings = await response.json();
          if (serverSettings.success && serverSettings.data) {
            // Server settings are available, use them
            const parsedSettings = serverSettings.data;

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

},{"./crypto-utils.js":3}],11:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.UIManager = void 0;
class UIManager {
  constructor(logger) {
    this.logger = logger;
    this.currentView = 'import';

    // Status tracking for all views
    this.lastRunStatus = {
      import: {
        operation: 'None',
        status: 'Ready',
        timestamp: null,
        details: null,
        results: null
      },
      export: {
        operation: 'None',
        status: 'Ready',
        timestamp: null,
        details: null,
        results: null
      },
      'delete-csv': {
        operation: 'None',
        status: 'Ready',
        timestamp: null,
        details: null,
        results: null
      },
      modify: {
        operation: 'None',
        status: 'Ready',
        timestamp: null,
        details: null,
        results: null
      },
      settings: {
        operation: 'None',
        status: 'Ready',
        timestamp: null,
        details: null,
        results: null
      },
      logs: {
        operation: 'None',
        status: 'Ready',
        timestamp: null,
        details: null,
        results: null
      }
    };

    // Initialize UI elements
    this.views = {
      'home': document.getElementById('home-view'),
      'import': document.getElementById('import-view'),
      'settings': document.getElementById('settings-view'),
      'logs': document.getElementById('logs-view'),
      'delete-csv': document.getElementById('delete-csv-view'),
      'modify': document.getElementById('modify-view'),
      'export': document.getElementById('export-view')
    };
    // Navigation elements
    this.navItems = document.querySelectorAll('.nav-item');
    // Logs view elements
    this.logsView = this.views.logs;
    // Connection status element
    this.connectionStatusElement = document.getElementById('connection-status');

    // Attach navigation click listeners
    this.navItems.forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        const view = item.getAttribute('data-view');
        if (view) {
          this.showView(view);
        }
      });
    });

    // Load persisted status from localStorage
    this.loadPersistedStatus();

    // Rate limit warning tracking
    this.lastRateLimitWarning = null;
    this.rateLimitWarningCooldown = 30000; // 30 seconds cooldown

    // Progress log tracking
    this.progressLog = [];
    this.maxProgressLogEntries = 100; // Keep last 100 entries

    // Import state tracking
    this.isImporting = false;

    // Log pagination tracking
    this.logsPagination = {
      currentPage: 1,
      pageSize: 25,
      totalRecords: 0,
      totalPages: 0,
      allLogs: [],
      // Store all logs for pagination
      isLoading: false
    };

    // Set up progress close button handlers
    this.setupProgressCloseButtons();

    // Set up log navigation handlers
    this.setupLogNavigation();
  }

  /**
   * Set up event handlers for log navigation buttons
   */
  setupLogNavigation() {
    const logNavButtons = [{
      id: 'scroll-logs-top',
      action: 'scrollToTop'
    }, {
      id: 'scroll-logs-up',
      action: 'scrollUp'
    }, {
      id: 'scroll-logs-down',
      action: 'scrollDown'
    }, {
      id: 'scroll-logs-bottom',
      action: 'scrollToBottom'
    }];
    logNavButtons.forEach(_ref => {
      let {
        id,
        action
      } = _ref;
      const button = document.getElementById(id);
      if (button) {
        button.addEventListener('click', () => {
          this[action]();
          this.logger?.info(`Log navigation: ${action}`);
        });
      }
    });
  }

  /**
   * Scroll logs to the top
   */
  scrollToTop() {
    const logsContainer = document.getElementById('log-entries');
    if (logsContainer) {
      logsContainer.scrollTop = 0;
      this.showNotification('Scrolled to top of logs', 'info');
    }
  }

  /**
   * Scroll logs up by one page
   */
  scrollUp() {
    const logsContainer = document.getElementById('log-entries');
    if (logsContainer) {
      const scrollAmount = logsContainer.clientHeight * 0.8;
      logsContainer.scrollTop = Math.max(0, logsContainer.scrollTop - scrollAmount);
      this.showNotification('Scrolled up in logs', 'info');
    }
  }

  /**
   * Scroll logs down by one page
   */
  scrollDown() {
    const logsContainer = document.getElementById('log-entries');
    if (logsContainer) {
      const scrollAmount = logsContainer.clientHeight * 0.8;
      logsContainer.scrollTop = Math.min(logsContainer.scrollHeight - logsContainer.clientHeight, logsContainer.scrollTop + scrollAmount);
      this.showNotification('Scrolled down in logs', 'info');
    }
  }

  /**
   * Scroll logs to the bottom
   */
  scrollToBottom() {
    const logsContainer = document.getElementById('log-entries');
    if (logsContainer) {
      logsContainer.scrollTop = logsContainer.scrollHeight;
      this.showNotification('Scrolled to bottom of logs', 'info');
    }
  }

  /**
   * Update pagination controls and display
   */
  updatePaginationControls() {
    const counter = document.getElementById('logs-counter');
    const pageInput = document.getElementById('logs-page-input');
    const totalPages = document.getElementById('logs-total-pages');
    const firstBtn = document.getElementById('logs-first-page');
    const prevBtn = document.getElementById('logs-prev-page');
    const nextBtn = document.getElementById('logs-next-page');
    const lastBtn = document.getElementById('logs-last-page');
    const pageSizeSelect = document.getElementById('logs-page-size');
    if (!counter || !pageInput || !totalPages) return;
    const {
      currentPage,
      pageSize,
      totalRecords,
      totalPages: total
    } = this.logsPagination;

    // Update counter
    const startRecord = (currentPage - 1) * pageSize + 1;
    const endRecord = Math.min(currentPage * pageSize, totalRecords);
    counter.textContent = `${startRecord}-${endRecord} of ${totalRecords} records shown`;

    // Update page input and total pages
    pageInput.value = currentPage;
    totalPages.textContent = total;

    // Update navigation buttons
    firstBtn.disabled = currentPage <= 1;
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= total;
    lastBtn.disabled = currentPage >= total;

    // Update page size selector
    if (pageSizeSelect) {
      pageSizeSelect.value = pageSize;
    }
  }

  /**
   * Display logs for current page
   */
  displayCurrentPageLogs() {
    const {
      currentPage,
      pageSize,
      allLogs
    } = this.logsPagination;
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pageLogs = allLogs.slice(startIndex, endIndex);
    this.displayLogs(pageLogs);
    this.updatePaginationControls();
  }

  /**
   * Display logs in the log entries container
   */
  displayLogs(logs) {
    const logEntries = document.getElementById('log-entries');
    if (!logEntries) return;

    // Clear existing content
    logEntries.innerHTML = '';
    if (!logs || logs.length === 0) {
      const noLogsElement = document.createElement('div');
      noLogsElement.className = 'log-entry info';
      noLogsElement.textContent = 'No logs available';
      logEntries.appendChild(noLogsElement);
      return;
    }
    logs.forEach((log, index) => {
      try {
        if (log && typeof log === 'object') {
          const logElement = document.createElement('div');
          const logLevel = (log.level || 'info').toLowerCase();
          logElement.className = `log-entry log-${logLevel}`;
          logElement.style.cursor = 'pointer';
          const timestamp = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
          const level = log.level ? log.level.toUpperCase() : 'INFO';
          const message = log.message || 'No message';

          // Create the main log content with expand icon
          logElement.innerHTML = `
                        <div class="log-content">
                            <span class="log-timestamp">[${timestamp}]</span>
                            <span class="log-level">${level}</span>
                            <span class="log-message">${message}</span>
                            <span class="log-expand-icon">
                                <i class="fas fa-chevron-right"></i>
                            </span>
                        </div>
                    `;

          // Add expandable details section
          const detailsElement = document.createElement('div');
          detailsElement.className = 'log-details';
          detailsElement.style.display = 'none';
          detailsElement.innerHTML = `
                        <div class="log-details-content">
                            <pre class="log-detail-json">${JSON.stringify(log, null, 2)}</pre>
                        </div>
                    `;
          logElement.appendChild(detailsElement);

          // Add click handler for expand/collapse
          const logContent = logElement.querySelector('.log-content');
          const expandIcon = logElement.querySelector('.log-expand-icon i');
          logContent.addEventListener('click', function (e) {
            // Only toggle if not clicking a link or button inside
            if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON') return;
            const expanded = logElement.classList.toggle('expanded');
            if (detailsElement) {
              detailsElement.style.display = expanded ? 'block' : 'none';
            }

            // Update expand icon
            if (expandIcon) {
              expandIcon.className = expanded ? 'fas fa-chevron-down' : 'fas fa-chevron-right';
            }
          });
          logEntries.appendChild(logElement);
        }
      } catch (logError) {
        console.error(`Error processing log entry at index ${index}:`, logError);
      }
    });
  }

  /**
   * Setup pagination event handlers
   */
  setupPaginationHandlers() {
    const firstBtn = document.getElementById('logs-first-page');
    const prevBtn = document.getElementById('logs-prev-page');
    const nextBtn = document.getElementById('logs-next-page');
    const lastBtn = document.getElementById('logs-last-page');
    const pageInput = document.getElementById('logs-page-input');
    const pageSizeSelect = document.getElementById('logs-page-size');
    if (firstBtn) firstBtn.addEventListener('click', () => this.goToPage(1));
    if (prevBtn) prevBtn.addEventListener('click', () => this.goToPage(this.logsPagination.currentPage - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => this.goToPage(this.logsPagination.currentPage + 1));
    if (lastBtn) lastBtn.addEventListener('click', () => this.goToPage(this.logsPagination.totalPages));
    if (pageInput) {
      pageInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') {
          const page = parseInt(pageInput.value);
          if (page && page >= 1 && page <= this.logsPagination.totalPages) {
            this.goToPage(page);
          }
        }
      });
    }
    if (pageSizeSelect) {
      pageSizeSelect.addEventListener('change', e => {
        this.logsPagination.pageSize = parseInt(e.target.value);
        this.logsPagination.currentPage = 1;
        this.calculatePagination();
        this.displayCurrentPageLogs();
      });
    }
  }

  /**
   * Navigate to a specific page
   */
  goToPage(page) {
    if (page < 1 || page > this.logsPagination.totalPages) return;
    this.logsPagination.currentPage = page;
    this.displayCurrentPageLogs();
  }

  /**
   * Calculate pagination values
   */
  calculatePagination() {
    const {
      pageSize,
      totalRecords
    } = this.logsPagination;
    this.logsPagination.totalPages = Math.ceil(totalRecords / pageSize);

    // Ensure current page is within bounds
    if (this.logsPagination.currentPage > this.logsPagination.totalPages) {
      this.logsPagination.currentPage = this.logsPagination.totalPages || 1;
    }
  }

  /**
   * Hide a progress screen with a delay
   * @param {string} statusElementId - The ID of the status element to hide
   * @param {number} delay - Delay in milliseconds (default: 5000)
   */
  hideProgressScreenWithDelay(statusElementId) {
    let delay = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 5000;
    const statusElement = document.getElementById(statusElementId);
    if (!statusElement) return;

    // Clear any existing timeout for this element
    const timeoutKey = `hideTimeout_${statusElementId}`;
    if (this[timeoutKey]) {
      clearTimeout(this[timeoutKey]);
    }

    // Set new timeout to hide the progress screen
    this[timeoutKey] = setTimeout(() => {
      statusElement.style.display = 'none';
      delete this[timeoutKey]; // Clean up the timeout reference
      this.logger?.info(`Progress screen auto-hidden after delay: ${statusElementId}`);
    }, delay);
    this.logger?.info(`Progress screen will be hidden in ${delay}ms: ${statusElementId}`);
  }

  /**
   * Set up event handlers for progress screen close buttons
   */
  setupProgressCloseButtons() {
    const progressScreens = [{
      buttonId: 'close-import-status',
      statusId: 'import-status',
      viewName: 'import'
    }, {
      buttonId: 'close-export-status',
      statusId: 'export-status',
      viewName: 'export'
    }, {
      buttonId: 'close-delete-csv-status',
      statusId: 'delete-csv-status',
      viewName: 'delete-csv'
    }, {
      buttonId: 'close-modify-status',
      statusId: 'modify-status',
      viewName: 'modify'
    }];
    progressScreens.forEach(_ref2 => {
      let {
        buttonId,
        statusId,
        viewName
      } = _ref2;
      const closeButton = document.getElementById(buttonId);
      const statusElement = document.getElementById(statusId);
      if (closeButton && statusElement) {
        closeButton.addEventListener('click', () => {
          // Clear any pending hide timeout
          const timeoutKey = `hideTimeout_${statusId}`;
          if (this[timeoutKey]) {
            clearTimeout(this[timeoutKey]);
            delete this[timeoutKey];
          }

          // Hide the progress screen
          statusElement.style.display = 'none';

          // Reset the status to prevent it from showing again on page reload
          const currentStatus = this.lastRunStatus[viewName];
          if (currentStatus && currentStatus.status === 'In Progress') {
            this.updateLastRunStatus(viewName, currentStatus.operation || 'Operation', 'Ready', 'Operation stopped by user');
          }
          this.logger?.info(`Progress screen closed: ${statusId}`);
          this.showNotification(`${viewName.charAt(0).toUpperCase() + viewName.slice(1)} progress screen closed`, 'info');
        });
      }
    });
  }

  /**
   * Load persisted status from localStorage
   */
  loadPersistedStatus() {
    try {
      const saved = localStorage.getItem('pingone-import-last-status');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.lastRunStatus = {
          ...this.lastRunStatus,
          ...parsed
        };
      }
    } catch (error) {
      this.logger.error('Failed to load persisted status:', error);
    }
  }

  /**
   * Save status to localStorage
   */
  savePersistedStatus() {
    try {
      localStorage.setItem('pingone-import-last-status', JSON.stringify(this.lastRunStatus));
    } catch (error) {
      this.logger.error('Failed to save persisted status:', error);
    }
  }

  /**
   * Update the last run status for a view
   * @param {string} viewName - The view name (import, export, delete-csv, modify, settings, logs)
   * @param {string} operation - The operation performed
   * @param {string} status - The status (Ready, In Progress, Completed, Failed, Error)
   * @param {string} details - Additional details about the operation
   * @param {Object} results - Results object with counts/data
   */
  updateLastRunStatus(viewName, operation, status) {
    let details = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : null;
    let results = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : null;
    if (!this.lastRunStatus[viewName]) {
      this.lastRunStatus[viewName] = {};
    }
    this.lastRunStatus[viewName] = {
      operation,
      status,
      timestamp: new Date().toISOString(),
      details,
      results
    };

    // Save to localStorage
    this.savePersistedStatus();

    // Update the UI if this view is currently active or always show persistent status
    this.displayLastRunStatus(viewName);
  }

  /**
   * Display the last run status for a specific view
   * @param {string} viewName - The view name
   */
  displayLastRunStatus(viewName) {
    const status = this.lastRunStatus[viewName];
    if (!status || status.operation === 'None') return;

    // For operation views (import, export, delete-csv, modify), 
    // show the progress section if the operation is currently "In Progress" OR if it was recently completed
    if (['import', 'export', 'delete-csv', 'modify'].includes(viewName)) {
      const statusElement = document.getElementById(`${viewName}-status`);

      // Show the progress screen if the operation is currently in progress OR if it was completed recently
      if (statusElement) {
        if (status.status === 'In Progress') {
          statusElement.style.display = 'block';
          this.updateOperationStatus(viewName, status);
        } else if (status.status === 'Completed' || status.status === 'Ready') {
          // Keep the progress screen open even after completion so users can see results
          statusElement.style.display = 'block';
          this.updateOperationStatus(viewName, status);
        }
        // For other statuses (Failed, Cancelled, etc.), keep the screen open to show error details
        else {
          statusElement.style.display = 'block';
          this.updateOperationStatus(viewName, status);
        }
      }
    } else {
      // For logs and settings, always show status
      const statusElement = document.getElementById(`${viewName}-status`);
      if (!statusElement) return;
      statusElement.style.display = 'block';
      if (viewName === 'logs') {
        this.updateLogsStatus(status);
      } else if (viewName === 'settings') {
        this.updateSettingsLastRunStatus(status);
      }
    }
  }

  /**
   * Update logs view status
   */
  updateLogsStatus(status) {
    const elements = {
      operation: document.getElementById('logs-last-operation'),
      status: document.getElementById('logs-operation-status'),
      timestamp: document.getElementById('logs-operation-timestamp'),
      details: document.getElementById('logs-operation-details')
    };
    if (elements.operation) elements.operation.textContent = status.operation;
    if (elements.status) {
      elements.status.textContent = status.status;
      elements.status.className = `stat-value ${this.getStatusClass(status.status)}`;
    }
    if (elements.timestamp) {
      elements.timestamp.textContent = status.timestamp ? new Date(status.timestamp).toLocaleString() : '-';
    }
    if (elements.details) elements.details.textContent = status.details || '-';
  }

  /**
   * Update settings view last run status
   */
  updateSettingsLastRunStatus(status) {
    // Add a last operation status to settings if it doesn't exist
    let lastOpElement = document.getElementById('settings-last-operation-status');
    if (!lastOpElement) {
      const container = document.querySelector('.settings-status-container');
      if (container) {
        lastOpElement = document.createElement('div');
        lastOpElement.id = 'settings-last-operation-status';
        lastOpElement.className = 'settings-last-operation-status';
        lastOpElement.innerHTML = `
                    <div class="status-details">
                        <span class="status-icon">📋</span>
                        <span class="status-message">
                            <strong>Last Operation:</strong> <span id="settings-last-op-text">${status.operation}</span> - 
                            <span id="settings-last-op-status" class="${this.getStatusClass(status.status)}">${status.status}</span>
                            <small class="timestamp">${status.timestamp ? new Date(status.timestamp).toLocaleString() : ''}</small>
                        </span>
                    </div>
                `;
        container.appendChild(lastOpElement);
      }
    } else {
      // Update existing elements
      const opText = document.getElementById('settings-last-op-text');
      const opStatus = document.getElementById('settings-last-op-status');
      const timestamp = lastOpElement.querySelector('.timestamp');
      if (opText) opText.textContent = status.operation;
      if (opStatus) {
        opStatus.textContent = status.status;
        opStatus.className = this.getStatusClass(status.status);
      }
      if (timestamp) {
        timestamp.textContent = status.timestamp ? new Date(status.timestamp).toLocaleString() : '';
      }
    }
  }

  /**
   * Update operation status for import/export/delete/modify views
   */
  updateOperationStatus(viewName, status) {
    // Update the main status text
    const statusTextElement = document.getElementById(`${viewName}-progress-text`);
    if (statusTextElement) {
      statusTextElement.textContent = `${status.operation} - ${status.status}`;
      statusTextElement.className = `stat-value ${this.getStatusClass(status.status)}`;
    }

    // If we have results, update the counters
    if (status.results) {
      const counters = ['success', 'failed', 'skipped'];
      counters.forEach(counter => {
        const element = document.getElementById(`${viewName}-${counter}-count`);
        if (element && status.results[counter] !== undefined) {
          element.textContent = status.results[counter];
        }
      });

      // Update progress count if available
      const progressCountElement = document.getElementById(`${viewName}-progress-count`);
      if (progressCountElement && status.results.total !== undefined) {
        const processed = (status.results.success || 0) + (status.results.failed || 0) + (status.results.skipped || 0);
        progressCountElement.textContent = `${processed} of ${status.results.total} users`;
      }
    }

    // Add timestamp info
    const timestampElement = document.getElementById(`${viewName}-timestamp`);
    if (!timestampElement && status.timestamp) {
      const statsContainer = document.getElementById(`${viewName}-stats`);
      if (statsContainer) {
        const timestampDiv = document.createElement('div');
        timestampDiv.className = 'stat-item';
        timestampDiv.innerHTML = `
                    <span class="stat-label">Last Run:</span>
                    <span id="${viewName}-timestamp" class="stat-value">${new Date(status.timestamp).toLocaleString()}</span>
                `;
        statsContainer.appendChild(timestampDiv);
      }
    } else if (timestampElement) {
      timestampElement.textContent = status.timestamp ? new Date(status.timestamp).toLocaleString() : '-';
    }
  }

  /**
   * Get CSS class for status
   */
  getStatusClass(status) {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'success':
        return 'success';
      case 'failed':
      case 'error':
        return 'error';
      case 'in progress':
      case 'running':
        return 'info';
      case 'cancelled':
      case 'skipped':
        return 'warning';
      default:
        return '';
    }
  }

  /**
   * Show all persisted status sections when switching views
   */
  showPersistedStatus() {
    Object.keys(this.lastRunStatus).forEach(viewName => {
      this.displayLastRunStatus(viewName);
    });
  }

  /**
   * Switch between different views
   * @param {string} viewName - The name of the view to switch to ('import', 'settings', 'logs')
   */
  /**
   * Show a specific view (alias for switchView with async/await support)
   * @param {string} viewName - The name of the view to show
   * @returns {Promise<boolean>} True if view was shown successfully
   * @throws {Error} If view is not found
   */
  async showView(viewName) {
    // Hide all views and remove 'active'
    Object.entries(this.views).forEach(_ref3 => {
      let [name, element] = _ref3;
      if (element) {
        element.style.display = 'none';
        element.classList.remove('active');
      }
      const navItem = document.querySelector(`[data-view="${name}"]`);
      if (navItem) navItem.classList.remove('active');
    });
    // Show the selected view
    const viewElement = this.views[viewName];
    if (viewElement) {
      viewElement.style.display = 'block';
      viewElement.classList.add('active');
      this.currentView = viewName;
      const navItem = document.querySelector(`[data-view="${viewName}"]`);
      if (navItem) navItem.classList.add('active');

      // Special handling for logs/settings
      switch (viewName) {
        case 'logs':
          await this.loadAndDisplayLogs();
          this.scrollLogsToBottom();
          break;
        case 'settings':
          // Load settings when the settings view is shown
          if (window.app && typeof window.app.checkSettingsAndRestore === 'function') {
            window.app.checkSettingsAndRestore();
          }
          const currentStatus = this.connectionStatusElement?.classList.contains('status-connected') ? 'connected' : 'disconnected';
          const currentMessage = this.connectionStatusElement?.querySelector('.status-message')?.textContent || '';
          this.updateSettingsConnectionStatus(currentStatus, currentMessage);
          break;
      }

      // Always display persisted status for the current view
      this.displayLastRunStatus(viewName);
      return true;
    } else {
      console.warn(`View '${viewName}' not found`);
      return false;
    }
  }

  /**
   * Switch between different views
   * @param {string} viewName - The name of the view to switch to ('import', 'settings', 'logs')
   */
  switchView(viewName) {
    // Convert view name to lowercase for case-insensitive comparison
    const normalizedViewName = viewName.toLowerCase();
    const viewElement = this.views[normalizedViewName];
    if (!viewElement) {
      console.error(`View '${viewName}' not found`);
      throw new Error(`View '${viewName}' not found`);
    }

    // Hide all views
    Object.entries(this.views).forEach(_ref4 => {
      let [name, element] = _ref4;
      if (element) {
        element.style.display = 'none';
        element.classList.remove('active');
      }
      // Update nav items
      const navItem = document.querySelector(`[data-view="${name}"]`);
      if (navItem) {
        navItem.classList.remove('active');
      }
    });

    // Show the selected view
    viewElement.style.display = 'block';
    viewElement.classList.add('active');
    this.currentView = normalizedViewName;

    // Update active state of nav item
    const activeNavItem = document.querySelector(`[data-view="${normalizedViewName}"]`);
    if (activeNavItem) {
      activeNavItem.classList.add('active');
    }
    // Save current view to localStorage for persistence
    try {
      localStorage.setItem('currentView', normalizedViewName);
    } catch (e) {}
    this.logger.debug(`Switched to ${viewName} view`);
    return true;
  }

  /**
   * Update the settings status in the UI
   * @param {boolean} hasRequiredSettings - Whether all required settings are present
   */
  updateSettingsStatus(hasRequiredSettings) {
    const statusElement = document.getElementById('settings-status');
    if (!statusElement) return;
    if (hasRequiredSettings) {
      statusElement.innerHTML = `
                <i class="fas fa-check-circle"></i>
                <span>All required settings are configured</span>
            `;
      statusElement.className = 'status-message status-success';
    } else {
      statusElement.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i>
                <span>Missing required settings</span>
            `;
      statusElement.className = 'status-message status-warning';
    }
  }

  /**
   * Update the connection status display with enhanced error handling and logging
   * @param {string} status - The connection status ('connected', 'disconnected', 'error', 'connecting')
   * @param {string} [message] - The status message to display (optional)
   * @param {boolean} [updateSettingsStatus=true] - Whether to also update the settings page status
   * @returns {boolean} - Returns true if update was successful, false otherwise
   */
  updateConnectionStatus(status, message) {
    let updateSettingsStatus = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : true;
    try {
      // Validate input
      if (!status) {
        console.warn('No status provided to updateConnectionStatus');
        return false;
      }
      const normalizedStatus = status.toLowerCase();
      const normalizedMessage = message || this._getDefaultStatusMessage(normalizedStatus);
      console.debug(`Updating connection status to: ${normalizedStatus} - ${normalizedMessage}`);

      // Update main connection status
      const mainUpdateSuccess = this._updateStatusElement('connection-status', normalizedStatus, normalizedMessage);

      // Also update settings status if needed and possible
      let settingsUpdateSuccess = true;
      if (updateSettingsStatus) {
        settingsUpdateSuccess = this.updateSettingsConnectionStatus(normalizedStatus, normalizedMessage);
      }

      // Update any UI elements that depend on connection status
      this._updateConnectionDependentUI(normalizedStatus);

      // Log the status change
      this._logStatusChange(normalizedStatus, normalizedMessage);
      return mainUpdateSuccess && settingsUpdateSuccess;
    } catch (error) {
      console.error('Error in updateConnectionStatus:', error);
      this._handleStatusUpdateError(error, status, message);
      return false;
    }
  }

  /**
   * Update the connection status in the settings page
   * @param {string} status - The connection status ('connected', 'disconnected', 'error', 'connecting')
   * @param {string} [message] - The status message to display (optional)
   * @returns {boolean} - Returns true if update was successful, false otherwise
   */
  updateSettingsConnectionStatus(status, message) {
    try {
      if (!status) {
        console.warn('No status provided to updateSettingsConnectionStatus');
        return false;
      }
      const normalizedStatus = status.toLowerCase();
      const normalizedMessage = message || this._getDefaultStatusMessage(normalizedStatus);
      return this._updateStatusElement('settings-connection-status', normalizedStatus, normalizedMessage);
    } catch (error) {
      console.error('Error in updateSettingsConnectionStatus:', error);
      return false;
    }
  }

  /**
   * Update UI elements that depend on connection status
   * @private
   * @param {string} status - The current connection status
   */
  _updateConnectionDependentUI(status) {
    try {
      // Update connection button state
      const connectButton = document.getElementById('connect-button');
      if (connectButton) {
        connectButton.disabled = status === 'connected';
        connectButton.textContent = status === 'connected' ? 'Connected' : 'Connect';
        connectButton.className = `btn ${status === 'connected' ? 'btn-success' : 'btn-primary'}`;
      }

      // Update import button state
      const importButton = document.getElementById('import-button');
      if (importButton) {
        importButton.disabled = status !== 'connected';
        importButton.title = status === 'connected' ? 'Start user import' : 'Please connect to PingOne first';
      }

      // Update status indicator in navigation
      const statusIndicator = document.getElementById('nav-connection-status');
      if (statusIndicator) {
        statusIndicator.className = `nav-status-indicator status-${status}`;
        statusIndicator.title = `${status.charAt(0).toUpperCase() + status.slice(1)}: ${this._getDefaultStatusMessage(status)}`;
      }

      // Show/hide connection error message
      const errorElement = document.getElementById('connection-error');
      if (errorElement) {
        if (status === 'error') {
          errorElement.style.display = 'block';
        } else {
          errorElement.style.display = 'none';
        }
      }
    } catch (error) {
      console.error('Error updating connection-dependent UI:', error);
    }
  }

  /**
   * Helper method to update a status element with validation and error handling
   * @private
   * @param {string} elementId - The ID of the element to update
   * @param {string} status - The status class to apply
   * @param {string} message - The message to display
   * @returns {boolean} - Returns true if update was successful, false otherwise
   */
  _updateStatusElement(elementId, status, message) {
    if (!elementId) {
      console.warn('No elementId provided to _updateStatusElement');
      return false;
    }
    const element = document.getElementById(elementId);
    if (!element) {
      console.warn(`Element with ID '${elementId}' not found`);
      return false;
    }
    try {
      // Update the element's content and classes
      element.textContent = message || '';

      // Remove all status classes
      element.className = element.className.split(' ').filter(cls => !cls.startsWith('status-')).join(' ');

      // Add the new status class
      element.classList.add(`status-${status}`);

      // Add ARIA attributes for accessibility
      element.setAttribute('aria-live', 'polite');
      element.setAttribute('aria-atomic', 'true');
      return true;
    } catch (error) {
      console.error(`Error updating element '${elementId}':`, error);
      return false;
    }
  }

  /**
   * Log status changes for debugging and auditing
   * @private
   * @param {string} status - The connection status
   * @param {string} message - The status message
   */
  _logStatusChange(status, message) {
    const timestamp = new Date().toISOString();
    console.debug(`[${timestamp}] Connection status changed to: ${status} - ${message}`);

    // You could also log this to a server endpoint for auditing
    // this._logToServer('connection-status', { status, message, timestamp });
  }

  /**
   * Handle errors that occur during status updates
   * @private
   * @param {Error} error - The error that occurred
   * @param {string} status - The status that was being set
   * @param {string} message - The message that was being set
   */
  _handleStatusUpdateError(error, status, message) {
    const errorMessage = `Failed to update status to '${status}': ${error.message}`;
    console.error(errorMessage, error);

    // Try to show a user-visible error if possible
    try {
      const errorElement = document.getElementById('connection-error');
      if (errorElement) {
        errorElement.textContent = `Error: ${errorMessage}. ${message || ''}`;
        errorElement.style.display = 'block';
      }
    } catch (uiError) {
      console.error('Failed to display error to user:', uiError);
    }
  }

  /**
   * Get the default status message for a given status
   * @private
   * @param {string} status - The connection status
   * @returns {string} The default status message
   */
  _getDefaultStatusMessage(status) {
    switch (status) {
      case 'connected':
        return 'Successfully connected to PingOne';
      case 'connecting':
        return 'Connecting to PingOne...';
      case 'error':
        return 'Connection error. Please check your settings.';
      case 'disconnected':
      default:
        return 'Not connected. Please configure your API credentials and test the connection.';
    }
  }

  /**
   * Scroll the logs container to the bottom
   */
  scrollLogsToBottom() {
    if (this.logsView) {
      const logsContainer = this.logsView.querySelector('.logs-container') || this.logsView;
      logsContainer.scrollTop = logsContainer.scrollHeight;
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

    // Update counter to show loading
    const counter = document.getElementById('logs-counter');
    if (counter) {
      counter.textContent = 'Loading...';
    }
    try {
      // Fetch logs from the UI logs endpoint
      safeLog('Fetching logs from /api/logs/ui...', 'debug');
      const response = await fetch('/api/logs/ui?limit=1000'); // Fetch more logs for pagination
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const responseData = await response.json();
      safeLog('Received logs from server', 'debug', {
        count: responseData.logs?.length
      });

      // Clear loading indicator
      logEntries.innerHTML = '';
      if (responseData.success === true && Array.isArray(responseData.logs)) {
        if (responseData.logs.length === 0) {
          const noLogsElement = document.createElement('div');
          noLogsElement.className = 'log-entry info';
          noLogsElement.textContent = 'No logs available';
          logEntries.appendChild(noLogsElement);

          // Update pagination
          this.logsPagination.allLogs = [];
          this.logsPagination.totalRecords = 0;
          this.calculatePagination();
          this.updatePaginationControls();
          return;
        }

        // Process logs in chronological order (oldest first, newest last)
        // Reverse the array since server returns newest first, but we want oldest first
        const logsToProcess = [...responseData.logs].reverse();

        // Store all logs for pagination
        this.logsPagination.allLogs = logsToProcess;
        this.logsPagination.totalRecords = logsToProcess.length;
        this.calculatePagination();

        // Display current page logs
        this.displayCurrentPageLogs();

        // Setup pagination handlers if not already done
        this.setupPaginationHandlers();
      } else {
        safeLog('No valid log entries found in response', 'warn');
        const noLogsElement = document.createElement('div');
        noLogsElement.className = 'log-entry info';
        noLogsElement.textContent = 'No logs available';
        logEntries.appendChild(noLogsElement);

        // Update pagination
        this.logsPagination.allLogs = [];
        this.logsPagination.totalRecords = 0;
        this.calculatePagination();
        this.updatePaginationControls();
      }
    } catch (error) {
      safeLog(`Error fetching logs: ${error.message}`, 'error', {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        }
      });
      const errorElement = document.createElement('div');
      errorElement.className = 'log-entry error';
      errorElement.textContent = `Error loading logs: ${error.message}`;
      logEntries.appendChild(errorElement);

      // Update pagination
      this.logsPagination.allLogs = [];
      this.logsPagination.totalRecords = 0;
      this.calculatePagination();
      this.updatePaginationControls();
    }
  }

  /**
   * Show the import status section
   * @param {number} totalUsers - Total number of users to import
   */
  showImportStatus(totalUsers) {
    let populationName = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';
    // Show modal overlay
    const overlay = document.getElementById('import-progress-modal-overlay');
    if (overlay) overlay.style.display = 'flex';
    // Blur background
    document.querySelector('.app-container')?.classList.add('blurred');
    const importStatus = document.getElementById('import-status');
    if (importStatus) {
      importStatus.style.display = 'block';
    }
    this.isImporting = true;
    this.updateLastRunStatus('import', 'User Import', 'In Progress', `Importing ${totalUsers} users`, {
      total: totalUsers,
      success: 0,
      failed: 0,
      skipped: 0
    });
    this.updateImportProgress(0, totalUsers, 'Starting import...', {
      success: 0,
      failed: 0,
      skipped: 0
    }, populationName);
    this.addProgressLogEntry(`Starting import of ${totalUsers} users`, 'info', {
      total: totalUsers
    });
    this.setupProgressLogHandlers();
    this.setImportProgressIcon('importing');

    // Setup close button handler (idempotent)
    const closeBtn = document.getElementById('close-import-status');
    if (closeBtn && !closeBtn._modalHandlerSet) {
      closeBtn.addEventListener('click', () => {
        this.hideImportProgressModal();
      });
      closeBtn._modalHandlerSet = true;
    }
  }
  hideImportProgressModal() {
    // Hide modal overlay
    const overlay = document.getElementById('import-progress-modal-overlay');
    if (overlay) overlay.style.display = 'none';
    // Remove blur
    document.querySelector('.app-container')?.classList.remove('blurred');
  }
  resetImportProgress() {
    // Progress bar
    const progressBar = document.getElementById('import-progress');
    if (progressBar) {
      progressBar.style.width = '0%';
      progressBar.setAttribute('aria-valuenow', 0);
    }
    const progressPercent = document.getElementById('import-progress-percent');
    if (progressPercent) progressPercent.textContent = '0%';
    const progressText = document.getElementById('import-progress-text');
    if (progressText) progressText.textContent = 'Ready';
    const progressCount = document.getElementById('import-progress-count');
    if (progressCount) progressCount.textContent = '0 of 0 users';

    // Population name
    const populationNameElement = document.getElementById('import-population-name');
    if (populationNameElement) populationNameElement.textContent = 'Not selected';

    // Stats
    const successCount = document.getElementById('import-success-count');
    if (successCount) successCount.textContent = '0';
    const failedCount = document.getElementById('import-failed-count');
    if (failedCount) failedCount.textContent = '0';
    const skippedCount = document.getElementById('import-skipped-count');
    if (skippedCount) skippedCount.textContent = '0';
    // Hide population warning
    this.hidePopulationWarning && this.hidePopulationWarning();

    // Only clear progress log if we're not currently importing
    // This prevents clearing the log during active imports
    if (!this.isImporting) {
      this.clearProgressLog();
    }
    this.setImportProgressIcon('idle');
    // Hide modal and remove blur
    this.hideImportProgressModal();
  }

  /**
   * Set the import button state
   * @param {boolean} enabled - Whether the button should be enabled
   * @param {string} [text] - Optional button text
   */
  setImportButtonState(enabled, text) {
    const importButton = document.getElementById('start-import-btn');
    const importButtonBottom = document.getElementById('start-import-btn-bottom');
    if (importButton) {
      importButton.disabled = !enabled;
      if (text) {
        importButton.textContent = text;
      }
    }
    if (importButtonBottom) {
      importButtonBottom.disabled = !enabled;
      if (text) {
        importButtonBottom.textContent = text;
      }
    }
  }

  /**
   * Show a success notification
   * @param {string} message - The message to display
   */
  showSuccess(message) {
    // Add green checkmark if not already present
    const messageWithCheckmark = message.startsWith('✅') ? message : `✅ ${message}`;
    this.showNotification(messageWithCheckmark, 'success');
  }

  /**
   * Show a warning notification
   * @param {string} message - The message to display
   */
  showWarning(message) {
    // Special handling for disclaimer warning
    if (message.includes('disclaimer')) {
      this.showDisclaimerWarning(message);
    } else {
      this.showNotification(message, 'warning');
    }
  }

  /**
   * Show a special disclaimer warning with light red background and longer duration
   * @param {string} message - The disclaimer warning message
   */
  showDisclaimerWarning(message) {
    console.log(`[disclaimer-warning] ${message}`);

    // Get or create notification container
    let notificationArea = document.getElementById('notification-area');
    if (!notificationArea) {
      console.warn('Notification area not found in the DOM');
      return;
    }

    // Create notification element with light red background
    const notification = document.createElement('div');
    notification.className = 'notification notification-disclaimer';
    notification.style.backgroundColor = '#ffe6e6'; // Light red background
    notification.style.borderColor = '#ff9999'; // Light red border
    notification.style.color = '#cc0000'; // Darker red text for contrast
    notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
                <button class="notification-close">&times;</button>
            </div>
        `;

    // Add close button handler
    const closeButton = notification.querySelector('.notification-close');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
      });
    }

    // Add to notification area
    notificationArea.appendChild(notification);

    // Auto-remove after 10 seconds (twice as long as regular notifications)
    setTimeout(() => {
      if (notification.parentNode) {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
      }
    }, 10000);
    return notification;
  }

  /**
   * Show an error notification
   * @param {string} message - The message to display
   */
  showError(message) {
    this.showNotification(message, 'error');
  }

  /**
   * Show a specialized rate limit warning with enhanced information
   * @param {string} message - The basic rate limit message
   * @param {Object} [options] - Additional options for the rate limit warning
   * @param {boolean} [options.isRetrying=false] - Whether the request is being retried automatically
   * @param {number} [options.retryAttempt] - Current retry attempt number
   * @param {number} [options.maxRetries] - Maximum number of retry attempts
   * @param {number} [options.retryDelay] - Delay before next retry (in milliseconds)
   */
  showRateLimitWarning(message) {
    let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    const {
      isRetrying = false,
      retryAttempt,
      maxRetries,
      retryDelay
    } = options;

    // Check if we recently showed a rate limit warning
    const now = Date.now();
    if (this.lastRateLimitWarning && now - this.lastRateLimitWarning < this.rateLimitWarningCooldown) {
      // Skip showing the warning if it was shown recently
      return;
    }

    // Update the last warning time
    this.lastRateLimitWarning = now;
    let enhancedMessage = message;

    // Add retry information if available
    if (isRetrying && retryAttempt && maxRetries) {
      enhancedMessage += ` (Retry ${retryAttempt}/${maxRetries})`;
      if (retryDelay) {
        const delaySeconds = Math.ceil(retryDelay / 1000);
        enhancedMessage += ` - Waiting ${delaySeconds}s before retry`;
      }
    }

    // Add helpful context
    enhancedMessage += ' The system will pause slightly 💡 The system has automatically increased rate limits to handle more requests.';
    this.showNotification(enhancedMessage, 'warning');
  }

  /**
   * Show a notification
   * @param {string} message - The message to display
   * @param {string} type - The type of notification ('success', 'warning', 'error')
   */
  showNotification(message) {
    let type = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'info';
    // Add green checkmark to success messages if not already present
    let displayMessage = message;
    if (type === 'success' && !message.startsWith('✅')) {
      displayMessage = `✅ ${message}`;
    }
    console.log(`[${type}] ${displayMessage}`);

    // Get or create notification container
    let notificationArea = document.getElementById('notification-area');
    if (!notificationArea) {
      console.warn('Notification area not found in the DOM');
      return;
    }

    // Remove existing success notification if type is success
    if (type === 'success') {
      const existingSuccess = notificationArea.querySelector('.notification-success');
      if (existingSuccess) {
        existingSuccess.remove();
      }
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${displayMessage}</span>
                <button class="notification-close">&times;</button>
            </div>
        `;

    // Add close button handler
    const closeButton = notification.querySelector('.notification-close');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
      });
    }

    // Add to notification area
    notificationArea.appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
      }
    }, 5000);
    return notification;
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
      'populationId': 'population-id',
      'rateLimit': 'rate-limit'
    };

    // Update each form field with the corresponding setting value
    Object.entries(settingFields).forEach(_ref5 => {
      let [settingKey, fieldId] = _ref5;
      const element = document.getElementById(fieldId);
      if (element && settings[settingKey] !== undefined) {
        element.value = settings[settingKey] || '';
      }
    });
  }
  init() {
    let callbacks = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    // Store callbacks
    this.callbacks = callbacks;

    // Setup progress close buttons
    this.setupProgressCloseButtons();

    // Initialize navigation event listeners
    this.navItems.forEach(item => {
      if (item) {
        item.addEventListener('click', e => {
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
      startImportBtn.addEventListener('click', e => {
        e.preventDefault();
        if (this.callbacks.onImport) {
          this.callbacks.onImport();
        }
      });
    }

    // Set up Cancel Import button
    const cancelImportBtn = document.getElementById('cancel-import-btn');
    if (cancelImportBtn && this.callbacks.onCancelImport) {
      cancelImportBtn.addEventListener('click', e => {
        e.preventDefault();
        this.callbacks.onCancelImport();
      });
    }

    // Set up Clear Logs button
    const clearLogsBtn = document.getElementById('clear-logs');
    if (clearLogsBtn) {
      // Hide the button by default
      clearLogsBtn.style.display = 'none';
      clearLogsBtn.addEventListener('click', async e => {
        e.preventDefault();
        try {
          this.updateLogsOperationStatus('Clear Logs', true, 'Clearing log entries...');
          const response = await fetch('/api/logs/ui', {
            method: 'DELETE'
          });
          const data = await response.json();
          if (data.success) {
            this.updateLogsOperationStatus('Clear Logs', true, 'Logs cleared successfully');
            this.showNotification('Logs cleared. Only UI logs are cleared. Server logs are not affected.', 'info');
            await this.loadAndDisplayLogs();
          } else {
            this.updateLogsOperationStatus('Clear Logs', false, `Failed to clear logs: ${data.error || 'Unknown error'}`);
            this.showNotification('Failed to clear logs: ' + (data.error || 'Unknown error'), 'error');
          }
        } catch (error) {
          this.updateLogsOperationStatus('Clear Logs', false, `Error clearing logs: ${error.message}`);
          this.showNotification('Error clearing logs: ' + error.message, 'error');
        }
      });
    }

    // Setup pagination handlers
    this.setupPaginationHandlers();

    // Make sure the current view is visible
    const currentView = this.getLastView();
    this.showView(currentView);

    // Show/hide Clear Logs button based on view
    const updateClearLogsBtnVisibility = viewName => {
      if (clearLogsBtn) {
        clearLogsBtn.style.display = viewName === 'logs' ? '' : 'none';
      }
    };
    // Patch showView to also update button visibility
    const origShowView = this.showView.bind(this);
    this.showView = async viewName => {
      updateClearLogsBtnVisibility(viewName);
      return await origShowView(viewName);
    };
    // Set initial visibility
    updateClearLogsBtnVisibility(currentView);
  }

  /**
   * Show loading state
   * @param {boolean} [show=true] - Whether to show or hide the loading state
   * @param {string} [message='Loading...'] - Optional loading message
   */
  showLoading() {
    let show = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : true;
    let message = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'Loading...';
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

  /**
   * Add a form with submission handling
   * @param {string} formId - The ID of the form element
   * @param {string} action - The URL to submit the form to
   * @param {Function} onSuccess - Callback for successful submission
   * @param {Function} onError - Callback for submission error
   */
  addForm(formId, action, onSuccess, onError) {
    const form = document.getElementById(formId);
    if (!form) {
      console.error(`Form with ID '${formId}' not found`);
      return;
    }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const formData = new FormData(form);
      const formDataObj = {};
      formData.forEach((value, key) => {
        formDataObj[key] = value;
      });
      try {
        const response = await fetch(action, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(formDataObj)
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Form submission failed');
        }
        if (typeof onSuccess === 'function') {
          onSuccess(data);
        }
      } catch (error) {
        console.error('Form submission error:', error);
        if (typeof onError === 'function') {
          onError({
            error: error.message
          });
        }
      }
    });
  }

  /**
   * Update the content of an element
   * @param {string} elementId - The ID of the element to update
   * @param {string} content - The new content to set
   */
  updateElementContent(elementId, content) {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = content;
    } else {
      console.error(`Element with ID ${elementId} not found`);
    }
  }

  /**
   * Show population ID warning message
   * @param {string} csvPopulationId - The invalid population ID from CSV
   * @param {string} settingsPopulationId - The population ID from settings that was used instead
   */
  showPopulationWarning(csvPopulationId, settingsPopulationId) {
    const warningArea = document.getElementById('population-warning');
    const warningText = document.getElementById('population-warning-text');
    if (warningArea && warningText) {
      warningText.textContent = `Invalid population ID "${csvPopulationId}" found in CSV file. Using settings population ID "${settingsPopulationId}" instead.`;
      warningArea.style.display = 'block';
    }
  }

  /**
   * Hide population ID warning message
   */
  hidePopulationWarning() {
    const warningArea = document.getElementById('population-warning');
    if (warningArea) {
      warningArea.style.display = 'none';
    }
  }
  setDeletingCsv(isDeleting) {
    const deleteButton = document.getElementById('start-delete-csv-btn');
    const cancelButton = document.getElementById('cancel-delete-csv-btn');
    if (deleteButton) {
      deleteButton.disabled = isDeleting;
      deleteButton.textContent = isDeleting ? 'Deleting...' : 'Delete Users (CSV Safe)';
    }
    if (cancelButton) {
      cancelButton.style.display = isDeleting ? 'inline-block' : 'none';
    }
  }
  setDeleteCsvButtonState(enabled, text) {
    const deleteButton = document.getElementById('start-delete-csv-btn');
    if (deleteButton) {
      deleteButton.disabled = !enabled;
      if (text) {
        deleteButton.textContent = text;
      }
    }
  }
  showDeleteCsvStatus(totalUsers) {
    const deleteStatus = document.getElementById('delete-csv-status');
    if (deleteStatus) {
      deleteStatus.style.display = 'block';
    }
    this.updateDeleteCsvProgress(0, totalUsers, 'Starting delete operation...', {
      success: 0,
      failed: 0,
      skipped: 0
    });
  }
  updateDeleteCsvProgress(current, total, message) {
    let counts = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};
    const progressBar = document.getElementById('delete-csv-progress');
    const progressPercent = document.getElementById('delete-csv-progress-percent');
    const progressText = document.getElementById('delete-csv-progress-text');
    const progressCount = document.getElementById('delete-csv-progress-count');
    if (progressBar) {
      const percent = total > 0 ? Math.min(100, Math.round(current / total * 100)) : 0;
      progressBar.style.width = `${percent}%`;
      progressBar.setAttribute('aria-valuenow', percent);
    }
    if (progressPercent) {
      progressPercent.textContent = `${total > 0 ? Math.min(100, Math.round(current / total * 100)) : 0}%`;
    }
    if (progressText) {
      progressText.textContent = message || '';
    }
    if (progressCount) {
      progressCount.textContent = `${current} of ${total} users`;
    }
    if (counts.success !== undefined) {
      const successCount = document.getElementById('delete-csv-success-count');
      if (successCount) successCount.textContent = counts.success;
    }
    if (counts.failed !== undefined) {
      const failedCount = document.getElementById('delete-csv-failed-count');
      if (failedCount) failedCount.textContent = counts.failed;
    }
    if (counts.skipped !== undefined) {
      const skippedCount = document.getElementById('delete-csv-skipped-count');
      if (skippedCount) skippedCount.textContent = counts.skipped;
    }
  }
  resetDeleteCsvState() {
    // Progress screen will stay open until user manually closes it with X button
    // No automatic hiding
  }
  resetDeleteCsvProgress() {
    const progressBar = document.getElementById('delete-csv-progress');
    if (progressBar) {
      progressBar.style.width = '0%';
      progressBar.setAttribute('aria-valuenow', 0);
    }
    const progressPercent = document.getElementById('delete-csv-progress-percent');
    if (progressPercent) progressPercent.textContent = '0%';
    const progressText = document.getElementById('delete-csv-progress-text');
    if (progressText) progressText.textContent = 'Ready';
    const progressCount = document.getElementById('delete-csv-progress-count');
    if (progressCount) progressCount.textContent = '0 of 0 users';
    const successCount = document.getElementById('delete-csv-success-count');
    if (successCount) successCount.textContent = '0';
    const failedCount = document.getElementById('delete-csv-failed-count');
    if (failedCount) failedCount.textContent = '0';
    const skippedCount = document.getElementById('delete-csv-skipped-count');
    if (skippedCount) skippedCount.textContent = '0';
  }
  setModifying(isModifying) {
    const modifyButton = document.getElementById('start-modify-btn');
    const cancelButton = document.getElementById('cancel-modify-btn');
    if (modifyButton) {
      modifyButton.disabled = isModifying;
      modifyButton.textContent = isModifying ? 'Modifying...' : 'Modify Users';
    }
    if (cancelButton) {
      cancelButton.style.display = isModifying ? 'inline-block' : 'none';
    }
  }
  setModifyCsvButtonState(enabled, text) {
    const modifyButton = document.getElementById('start-modify-btn');
    if (modifyButton) {
      modifyButton.disabled = !enabled;
      if (text) {
        modifyButton.textContent = text;
      }
    }
  }
  showModifyStatus(totalUsers) {
    const modifyStatus = document.getElementById('modify-status');
    if (modifyStatus) {
      modifyStatus.style.display = 'block';
    }
    this.updateModifyProgress(0, totalUsers, 'Starting modify operation...');
    this.resetModifyStats();
  }
  updateModifyProgress(current, total, status) {
    let progress = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : null;
    const progressBar = document.getElementById('modify-progress');
    const progressPercent = document.getElementById('modify-progress-percent');
    const progressText = document.getElementById('modify-progress-text');
    const progressCount = document.getElementById('modify-progress-count');
    if (progressBar && progressPercent) {
      const percentage = total > 0 ? Math.round(current / total * 100) : 0;
      progressBar.style.width = `${percentage}%`;
      progressBar.setAttribute('aria-valuenow', percentage);
      progressPercent.textContent = `${percentage}%`;
    }
    if (progressText) {
      progressText.textContent = status || 'Processing...';
      console.log('Updated modify progress text:', status);
    } else {
      console.warn('modify-progress-text element not found');
    }
    if (progressCount) {
      progressCount.textContent = `${current} of ${total} users`;
    }

    // Also update stats if progress object is provided
    if (progress && typeof progress === 'object') {
      this.updateModifyStats(progress);
    }
  }
  updateModifyStats(stats) {
    const successCount = document.getElementById('modify-success-count');
    const createdCount = document.getElementById('modify-created-count');
    const failedCount = document.getElementById('modify-failed-count');
    const skippedCount = document.getElementById('modify-skipped-count');
    const noChangesCount = document.getElementById('modify-no-changes-count');
    if (successCount) successCount.textContent = stats.modified || 0;
    if (createdCount) createdCount.textContent = stats.created || 0;
    if (failedCount) failedCount.textContent = stats.failed || 0;
    if (skippedCount) skippedCount.textContent = stats.skipped || 0;
    if (noChangesCount) noChangesCount.textContent = stats.noChanges || 0;
  }
  resetModifyStats() {
    const successCount = document.getElementById('modify-success-count');
    const createdCount = document.getElementById('modify-created-count');
    const failedCount = document.getElementById('modify-failed-count');
    const skippedCount = document.getElementById('modify-skipped-count');
    const noChangesCount = document.getElementById('modify-no-changes-count');
    if (successCount) successCount.textContent = '0';
    if (createdCount) createdCount.textContent = '0';
    if (failedCount) failedCount.textContent = '0';
    if (skippedCount) skippedCount.textContent = '0';
    if (noChangesCount) noChangesCount.textContent = '0';
  }
  resetModifyProgress() {
    const progressBar = document.getElementById('modify-progress');
    const progressPercent = document.getElementById('modify-progress-percent');
    const progressText = document.getElementById('modify-progress-text');
    const progressCount = document.getElementById('modify-progress-count');
    if (progressBar) {
      progressBar.style.width = '0%';
      progressBar.setAttribute('aria-valuenow', 0);
    }
    if (progressPercent) progressPercent.textContent = '0%';
    if (progressText) progressText.textContent = 'Ready';
    if (progressCount) progressCount.textContent = '0 of 0 users';
  }
  resetModifyState() {
    this.setModifying(false);
    this.resetModifyProgress();
    this.resetModifyStats();

    // Progress screen will stay open until user manually closes it with X button
    // No automatic hiding
  }

  /**
   * Update the settings save status message
   * @param {string} message - The status message to display
   * @param {string} type - The type of status (success, error, warning, info)
   * @param {boolean} show - Whether to show or hide the status
   */
  updateSettingsSaveStatus(message) {
    let type = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'info';
    let show = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : true;
    const statusElement = document.getElementById('settings-save-status');
    const statusIcon = statusElement?.querySelector('.status-icon');
    const statusMessage = statusElement?.querySelector('.status-message');
    if (statusElement && statusIcon && statusMessage) {
      // Update the message
      statusMessage.textContent = message;

      // Update the icon based on type
      const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
      };
      statusIcon.textContent = icons[type] || icons.info;

      // Update the styling
      statusElement.className = `settings-save-status ${type}`;

      // Show or hide the status
      if (show) {
        statusElement.classList.add('show');
        statusElement.style.display = 'block';
      } else {
        statusElement.classList.remove('show');
        statusElement.style.display = 'none';
      }
    }
  }

  /**
   * Clear the settings save status
   */
  clearSettingsSaveStatus() {
    this.updateSettingsSaveStatus('', 'info', false);
  }

  // Export functionality UI methods
  showExportStatus() {
    const statusElement = document.getElementById('export-status');
    const startBtn = document.getElementById('start-export-btn');
    const cancelBtn = document.getElementById('cancel-export-btn');
    if (statusElement) statusElement.style.display = 'block';
    if (startBtn) startBtn.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'inline-block';
  }

  /**
   * Set the export button state and text
   * @param {boolean} isExporting - Whether export is in progress
   */
  setExporting(isExporting) {
    const exportButton = document.getElementById('start-export-btn');
    const cancelButton = document.getElementById('cancel-export-btn');
    if (exportButton) {
      exportButton.disabled = isExporting;
      // Update button text with icon
      exportButton.innerHTML = isExporting ? '<i class="fas fa-spinner fa-spin"></i> Exporting...' : '<i class="fas fa-download"></i> Export Users';
    }
    if (cancelButton) {
      cancelButton.style.display = isExporting ? 'inline-block' : 'none';
    }
  }
  hideExportStatus() {
    const startBtn = document.getElementById('start-export-btn');
    const cancelBtn = document.getElementById('cancel-export-btn');
    if (startBtn) startBtn.style.display = 'inline-block';
    if (cancelBtn) cancelBtn.style.display = 'none';

    // Progress screen will stay open until user manually closes it with X button
    // No automatic hiding
  }
  showExportButton() {
    const startBtn = document.getElementById('start-export-btn');
    const cancelBtn = document.getElementById('cancel-export-btn');
    if (startBtn) startBtn.style.display = 'inline-block';
    if (cancelBtn) cancelBtn.style.display = 'none';
  }
  updateExportProgress(current, total, message) {
    const progressElement = document.getElementById('export-progress');
    const progressPercent = document.getElementById('export-progress-percent');
    const progressText = document.getElementById('export-progress-text');
    const progressCount = document.getElementById('export-progress-count');
    if (progressElement && total > 0) {
      const percentage = Math.round(current / total * 100);
      progressElement.style.width = `${percentage}%`;
      progressElement.setAttribute('aria-valuenow', current);
      progressElement.setAttribute('aria-valuemax', total);
    }
    if (progressPercent) {
      progressPercent.textContent = total > 0 ? `${Math.round(current / total * 100)}%` : '0%';
    }
    if (progressText) {
      progressText.textContent = message || 'Exporting...';
    }
    if (progressCount) {
      progressCount.textContent = `${current} of ${total} users`;
    }
  }
  updateExportStats(stats) {
    const successCount = document.getElementById('export-success-count');
    const failedCount = document.getElementById('export-failed-count');
    const skippedCount = document.getElementById('export-skipped-count');
    const ignoredCount = document.getElementById('export-ignored-count');
    if (successCount) successCount.textContent = stats.exported || 0;
    if (failedCount) failedCount.textContent = stats.failed || 0;
    if (skippedCount) skippedCount.textContent = stats.skipped || 0;
    if (ignoredCount) ignoredCount.textContent = stats.ignored || 0;
  }
  showSuccess(message) {
    this.showNotification(message, 'success');
  }
  showInfo(message) {
    this.showNotification(message, 'info');
  }

  /**
   * Update logs operation status
   * @param {string} operation - The operation being performed
   * @param {boolean} success - Whether the operation was successful
   * @param {string} message - Status message
   */
  updateLogsOperationStatus(operation, success, message) {
    const status = success ? 'Completed' : 'Failed';
    this.updateLastRunStatus('logs', operation, status, message);
  }

  /**
   * Update file info in the UI (stub for compatibility)
   * @param {Object} fileInfo - File info object
   */
  updateFileInfo(fileInfo) {
    // Optionally implement UI update for file info, or leave as a no-op
    // Example: update an element with file name/size
    // console.log('updateFileInfo called', fileInfo);
  }

  /**
   * Add an entry to the progress log
   * @param {string} message - The progress message
   * @param {string} type - The type of entry (success, error, warning, info)
   * @param {Object} stats - Optional stats object
   */
  addProgressLogEntry(message) {
    let type = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'info';
    let stats = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;
    const timestamp = new Date().toLocaleTimeString();
    const entry = {
      timestamp,
      message,
      type,
      stats
    };

    // Add to progress log array
    this.progressLog.push(entry);

    // Keep only the last maxProgressLogEntries
    if (this.progressLog.length > this.maxProgressLogEntries) {
      this.progressLog = this.progressLog.slice(-this.maxProgressLogEntries);
    }

    // Update the display
    this.updateProgressLogDisplay();
  }

  /**
   * Update the progress log display
   */
  updateProgressLogDisplay() {
    const logContainer = document.getElementById('progress-log-entries');
    if (!logContainer) return;

    // Clear existing entries
    logContainer.innerHTML = '';

    // Add all entries
    this.progressLog.forEach(entry => {
      const entryElement = document.createElement('div');
      entryElement.className = `progress-log-entry ${entry.type}`;
      const icon = this.getProgressLogIcon(entry.type);
      const statsText = entry.stats ? this.formatProgressStats(entry.stats) : '';
      entryElement.innerHTML = `
                <span class="entry-timestamp">${entry.timestamp}</span>
                <span class="entry-icon">${icon}</span>
                <span class="entry-message">${entry.message}</span>
                ${statsText ? `<span class="entry-stats">${statsText}</span>` : ''}
            `;
      logContainer.appendChild(entryElement);
    });

    // Scroll to bottom to show latest entries
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  /**
   * Get the appropriate icon for a progress log entry type
   * @param {string} type - The entry type
   * @returns {string} The icon HTML
   */
  getProgressLogIcon(type) {
    const icons = {
      success: '<i class="fas fa-check-circle"></i>',
      error: '<i class="fas fa-exclamation-circle"></i>',
      warning: '<i class="fas fa-exclamation-triangle"></i>',
      info: '<i class="fas fa-info-circle"></i>',
      progress: '<i class="fas fa-spinner fa-spin"></i>'
    };
    return icons[type] || icons.info;
  }

  /**
   * Format progress stats for display
   * @param {Object} stats - The stats object
   * @returns {string} Formatted stats string
   */
  formatProgressStats(stats) {
    const parts = [];
    if (stats.success !== undefined) parts.push(`✅ ${stats.success}`);
    if (stats.failed !== undefined) parts.push(`❌ ${stats.failed}`);
    if (stats.skipped !== undefined) parts.push(`⏭️ ${stats.skipped}`);
    if (stats.total !== undefined) parts.push(`📊 ${stats.total}`);
    return parts.join(' ');
  }

  /**
   * Clear the progress log
   */
  clearProgressLog() {
    this.progressLog = [];
    this.updateProgressLogDisplay();
    this.logger?.info('Progress log cleared');
  }

  /**
   * Set up progress log event handlers
   */
  setupProgressLogHandlers() {
    const clearButton = document.getElementById('clear-progress-log');
    if (clearButton) {
      clearButton.addEventListener('click', () => {
        this.clearProgressLog();
        this.showNotification('Progress log cleared', 'info');
      });
    }
  }

  /**
   * Show or hide the import status section
   * @param {boolean} isImporting - Whether import is in progress
   */
  setImporting(isImporting) {
    this.isImporting = isImporting;
    const importButton = document.getElementById('start-import-btn');
    const importButtonBottom = document.getElementById('start-import-btn-bottom');
    const cancelButton = document.getElementById('cancel-import-btn');
    const cancelButtonBottom = document.getElementById('cancel-import-btn-bottom');
    if (importButton) {
      importButton.disabled = isImporting;
      importButton.textContent = isImporting ? 'Importing...' : 'Import Users (v1.0.2)';
    }
    if (importButtonBottom) {
      importButtonBottom.disabled = isImporting;
      importButtonBottom.textContent = isImporting ? 'Importing...' : 'Import Users (v1.0.2)';
    }
    if (cancelButton) {
      cancelButton.style.display = isImporting ? 'inline-block' : 'none';
    }
    if (cancelButtonBottom) {
      cancelButtonBottom.style.display = isImporting ? 'inline-block' : 'none';
    }
  }

  /**
   * Set custom text for import buttons
   * @param {string} text - The text to display on import buttons
   */
  setImportButtonText(text) {
    const importButton = document.getElementById('start-import-btn');
    const importButtonBottom = document.getElementById('start-import-btn-bottom');
    if (importButton) {
      importButton.textContent = text;
    }
    if (importButtonBottom) {
      importButtonBottom.textContent = text;
    }
  }

  /**
   * Set the import progress icon based on status
   * @param {string} status - 'importing', 'complete', 'error', or 'idle'
   */
  setImportProgressIcon(status) {
    const iconContainer = document.getElementById('import-progress-icon');
    if (!iconContainer) return;
    let iconHtml = '';
    switch (status) {
      case 'importing':
        iconHtml = '<span class="modern-spinner" title="Importing..."><span class="modern-spinner-circle"></span></span>';
        break;
      case 'complete':
        iconHtml = '<i class="fas fa-check-circle" title="Import Complete"></i>';
        break;
      case 'error':
        iconHtml = '<i class="fas fa-exclamation-circle" title="Import Failed"></i>';
        break;
      default:
        iconHtml = '<i class="fas fa-arrow-rotate-right" title="Idle"></i>';
    }
    iconContainer.innerHTML = iconHtml;
  }
}

// No need for module.exports with ES modules
exports.UIManager = UIManager;

},{}],12:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.VersionManager = void 0;
class VersionManager {
  constructor() {
    this.version = '4.3.1'; // Update this with each new version
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

},{}]},{},[1]);
