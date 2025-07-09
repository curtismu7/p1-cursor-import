(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
var toPropertyKey = require("./toPropertyKey.js");
function _defineProperty(e, r, t) {
  return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
    value: t,
    enumerable: !0,
    configurable: !0,
    writable: !0
  }) : e[r] = t, e;
}
module.exports = _defineProperty, module.exports.__esModule = true, module.exports["default"] = module.exports;
},{"./toPropertyKey.js":4}],2:[function(require,module,exports){
function _interopRequireDefault(e) {
  return e && e.__esModule ? e : {
    "default": e
  };
}
module.exports = _interopRequireDefault, module.exports.__esModule = true, module.exports["default"] = module.exports;
},{}],3:[function(require,module,exports){
var _typeof = require("./typeof.js")["default"];
function toPrimitive(t, r) {
  if ("object" != _typeof(t) || !t) return t;
  var e = t[Symbol.toPrimitive];
  if (void 0 !== e) {
    var i = e.call(t, r || "default");
    if ("object" != _typeof(i)) return i;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return ("string" === r ? String : Number)(t);
}
module.exports = toPrimitive, module.exports.__esModule = true, module.exports["default"] = module.exports;
},{"./typeof.js":5}],4:[function(require,module,exports){
var _typeof = require("./typeof.js")["default"];
var toPrimitive = require("./toPrimitive.js");
function toPropertyKey(t) {
  var i = toPrimitive(t, "string");
  return "symbol" == _typeof(i) ? i : i + "";
}
module.exports = toPropertyKey, module.exports.__esModule = true, module.exports["default"] = module.exports;
},{"./toPrimitive.js":3,"./typeof.js":5}],5:[function(require,module,exports){
function _typeof(o) {
  "@babel/helpers - typeof";

  return module.exports = _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) {
    return typeof o;
  } : function (o) {
    return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
  }, module.exports.__esModule = true, module.exports["default"] = module.exports, _typeof(o);
}
module.exports = _typeof, module.exports.__esModule = true, module.exports["default"] = module.exports;
},{}],6:[function(require,module,exports){
"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");
var _defineProperty2 = _interopRequireDefault(require("@babel/runtime/helpers/defineProperty"));
var _logger = require("./modules/logger.js");
var _uiManager = require("./modules/ui-manager.js");
var _fileHandler = require("./modules/file-handler.js");
var _settingsManager = require("./modules/settings-manager.js");
var _apiFactory = require("./modules/api-factory.js");
var _versionManager = require("./modules/version-manager.js");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { (0, _defineProperty2.default)(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; } // Main application entry point
class App {
  constructor() {
    try {
      // Initialize logger with the log container
      const logContainer = document.getElementById('logs-container');
      this.logger = new _logger.Logger(logContainer);

      // Initialize settings manager first as it's used by other components
      this.settingsManager = new _settingsManager.SettingsManager(this.logger);

      // Initialize UI components
      this.uiManager = new _uiManager.UIManager(this.logger);
      this.fileHandler = new _fileHandler.FileHandler(this.logger, this.uiManager);
      this.versionManager = new _versionManager.VersionManager();

      // Track import state
      this.isImporting = false;
      this.currentImportAbortController = null;

      // Initialize API clients as null - they'll be set in initializeAsync()
      this.pingOneClient = null;
      this.localClient = null;
      this.factory = null;

      // Show loading state
      this.uiManager.showLoading('Initializing application...');

      // Start async initialization
      this.initializeAsync().catch(error => {
        const errorMsg = "Failed to initialize application: ".concat(error.message);
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

      // Initialize the application
      this.init();
    } catch (error) {
      console.error('Error initializing application:', error);
      // Try to show error in UI if possible
      const errorContainer = document.getElementById('app-error');
      if (errorContainer) {
        errorContainer.textContent = "Initialization error: ".concat(error.message);
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
        await (0, _apiFactory.initAPIFactory)(this.logger, this.settingsManager);

        // Now that factory is initialized, get the clients
        this.pingOneClient = _apiFactory.apiFactory.getPingOneClient();
                    this.localClient = _apiFactory.apiFactory.getLocalClient('http://localhost:4000');
        this.logger.fileLogger.info('API clients initialized successfully');
      } catch (error) {
        const errorMsg = "Failed to initialize API: ".concat(error.message);
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
      const errorMsg = "Error initializing application: ".concat(error.message);
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
      const errorMsg = "Error checking/restoring settings: ".concat(error.message);
      this.logger.fileLogger.error(errorMsg, {
        error
      });
      console.error(errorMsg, error);
      throw error; // Re-throw to be handled by the caller
    }
  }
  setupEventListeners() {
    // Listen for file selection events
    window.addEventListener('fileSelected', event => {
      this.handleFileSelect(event.detail);
    });

    // Listen for settings form submission
    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
      settingsForm.addEventListener('submit', async e => {
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
          this.uiManager.showNotification("Error: ".concat(error.message), 'error');
        }
        return false; // Prevent form submission
      });

      // Also prevent any button clicks from submitting the form traditionally
      const saveButton = settingsForm.querySelector('button[type="submit"]');
      if (saveButton) {
        saveButton.addEventListener('click', e => {
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
    window.addEventListener('saveSettings', event => {
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
      importButton.addEventListener('click', e => {
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
        this.pingOneClient = _apiFactory.apiFactory.getPingOneClient(this.logger, this.settingsManager);

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
          this.logger.fileLogger.warn('Connection test after save failed', {
            error: error.message
          });
          this.uiManager.showNotification('Settings saved but connection test failed', 'warning');
        }
        this.logger.fileLogger.info('Settings saved successfully');
        return {
          success: true
        };
      } catch (error) {
        var _error$response;
        console.error('Error in handleSaveSettings:', error);
        const errorMessage = ((_error$response = error.response) === null || _error$response === void 0 || (_error$response = _error$response.data) === null || _error$response === void 0 ? void 0 : _error$response.message) || error.message || 'Unknown error';
        this.logger.fileLogger.error('Error saving settings', {
          error: errorMessage
        });

        // Update connection status to show error
        this.uiManager.updateConnectionStatus('error', "Error: ".concat(errorMessage), false);

        // Show error notification
        if (this.uiManager.showNotification) {
          this.uiManager.showNotification("Error: ".concat(errorMessage), 'error');
        }
        return {
          success: false,
          error: errorMessage
        };
      }
    } catch (error) {
      console.error('Unexpected error in handleSaveSettings:', error);
      const errorMessage = error.message || 'An unexpected error occurred';

      // Show error notification
      if (this.uiManager.showNotification) {
        this.uiManager.showNotification("Error: ".concat(errorMessage), 'error');
      }
      return {
        success: false,
        error: errorMessage
      };
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
      var _error$response2;
      const errorMessage = ((_error$response2 = error.response) === null || _error$response2 === void 0 || (_error$response2 = _error$response2.data) === null || _error$response2 === void 0 ? void 0 : _error$response2.message) || error.message || 'Unknown error';
      this.logger.fileLogger.error('Error checking server connection status', {
        error: errorMessage
      });

      // More specific error handling
      let statusMessage = 'Error checking connection status';
      if (error.response) {
        // Server responded with error status
        statusMessage = "Server error: ".concat(error.response.status, " ").concat(errorMessage);
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
        return {
          success: true
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
  async startImport() {
    var _this = this;
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
      const usersToImport = users.map((user, index) => _objectSpread(_objectSpread({}, user), {}, {
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
        continueOnError: true,
        // Continue on error to import remaining users
        onProgress: function (processed, total, currentUser) {
          let counts = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};
          // Update our result counts if provided
          if (counts) {
            importResult = {
              success: counts.success || importResult.success,
              failed: counts.failed || importResult.failed,
              skipped: counts.skipped || importResult.skipped
            };
          }

          // Update progress in the UI
          const status = currentUser ? "Importing ".concat(currentUser.email || 'user') : "Processing batch ".concat(Math.ceil(processed / 5), " of ").concat(Math.ceil(total / 5), "...");
          _this.uiManager.updateImportProgress(processed, total, status, importResult);
        }
      });
      this.logger.fileLogger.info('Import completed', {
        imported: result.success,
        failed: result.failed,
        skipped: result.skipped
      });

      // Final progress update
      this.uiManager.updateImportProgress(users.length, users.length, "Import completed: ".concat(result.success, " succeeded, ").concat(result.failed, " failed, ").concat(result.skipped, " skipped"), {
        success: result.success,
        failed: result.failed,
        skipped: result.skipped
      });
      return result;
    } catch (error) {
      if (error.name === 'AbortError') {
        this.logger.fileLogger.info('Import canceled by user');
        this.uiManager.updateImportProgress(0, 1, 'Import canceled', {
          success: 0,
          failed: 0,
          skipped: 0
        });
      } else {
        this.logger.fileLogger.error('Import failed', {
          error: error.message
        });
        console.error('Import error:', error);
        this.uiManager.updateImportProgress(0, 1, "Error: ".concat(error.message), {
          success: 0,
          failed: 0,
          skipped: 0
        });
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
      this.logger.fileLogger.debug('File selected', {
        fileName: file.name,
        fileSize: file.size
      });

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
        this.uiManager.showNotification("Successfully processed ".concat(userCount, " users"), 'success');

        // Enable import button if we have users and settings are valid
        const isValid = await this.checkSettings();
        if (isValid) {
          this.uiManager.showNotification('Ready to import users', 'info');
        }
        return result;
      } else {
        const errorMsg = (result === null || result === void 0 ? void 0 : result.error) || 'Failed to process file';
        throw new Error(errorMsg);
      }
    } catch (error) {
      const errorMsg = error.message || 'An unknown error occurred while processing the file';
      this.logger.fileLogger.error('Error processing file', {
        error: errorMsg
      });
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
      this.logger.fileLogger.error('Error checking settings', {
        error: error.message
      });
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
    this.logger.debug('Populating settings form with:', _objectSpread(_objectSpread({}, settings), {}, {
      apiSecret: settings.apiSecret ? '***' : '[empty]'
    }));
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
          this.logger.error("Error setting field ".concat(id, ":"), fieldError);
        }
      }

      // Log results
      if (setFields.length > 0) {
        this.logger.debug("Successfully set ".concat(setFields.length, " form fields"));
      }
      if (missingFields.length > 0) {
        this.logger.debug("Could not find ".concat(missingFields.length, " form fields:"), missingFields);
      }

      // Update connection status display if status element exists
      const statusElement = document.getElementById('settings-connection-status');
      if (statusElement) {
        const status = (settings.connectionStatus || 'disconnected').toLowerCase();
        const message = settings.connectionMessage || 'Not connected';

        // Update status class
        statusElement.className = "connection-status status-".concat(status);

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
      const errorMsg = "Error populating settings form: ".concat(error.message);
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
      // Initialize API factory first
      this.logger.fileLogger.info('Initializing API factory...');
      this.factory = await (0, _apiFactory.initAPIFactory)(this.logger, this.settingsManager);

      // Initialize API clients
      this.pingOneClient = this.factory.getPingOneClient();
                  this.localClient = this.factory.getLocalClient('http://localhost:4000');
      this.logger.fileLogger.info('API clients initialized successfully');

      // Now that API clients are ready, load settings
      await this.checkSettingsAndRestore();

      // Initialize the rest of the UI
      this.logger.fileLogger.info('Initializing UI components');
      this.setupEventListeners();

      // Check server connection status
      await this.checkServerConnectionStatus();
      this.logger.fileLogger.info('Application initialization complete');
      console.log("PingOne Import Tool ".concat(this.versionManager.getFormattedVersion(), " initialized"));
    } catch (error) {
      const errorMsg = "Failed to initialize application: ".concat(error.message);
      this.logger.fileLogger.error(errorMsg, {
        error
      });
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
    errorDiv.textContent = "Failed to initialize application: ".concat(error.message);
    document.body.prepend(errorDiv);
  }
});

},{"./modules/api-factory.js":7,"./modules/file-handler.js":9,"./modules/logger.js":13,"./modules/settings-manager.js":15,"./modules/ui-manager.js":16,"./modules/version-manager.js":17,"@babel/runtime/helpers/defineProperty":1,"@babel/runtime/helpers/interopRequireDefault":2}],7:[function(require,module,exports){
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
    const cacheKey = "local_".concat(baseUrl);
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
      const errorMsg = "Failed to initialize API Factory: ".concat(error.message);
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

},{"./local-api-client.js":11,"./pingone-client.js":14}],8:[function(require,module,exports){
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
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data. The encryption key may be incorrect.');
    }
  }
}

// Export the class and a singleton instance
exports.CryptoUtils = CryptoUtils;
const cryptoUtils = exports.cryptoUtils = new CryptoUtils();

},{}],9:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FileHandler = void 0;
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
  handleFileSelect(event) {
    try {
      const fileInput = event.target;
      if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        this.logger.error('No file selected or invalid file input');
        return;
      }
      const file = fileInput.files[0];
      this.logger.log("Handling file selection: ".concat(file.name, " (").concat(file.size, " bytes)"), 'debug');

      // Update file info in UI first
      this.saveFileInfo(file);
      this.updateFileInfo(file);
      this.processCSV(file).then(_ref => {
        let {
          headers,
          rows
        } = _ref;
        this.lastParsedUsers = rows;
        this.showPreview(rows);
        this.logger.log("Successfully processed ".concat(rows.length, " users from ").concat(file.name), 'success');
      }).catch(error => {
        this.logger.error("Error processing file: ".concat(error.message), 'error', error);
        this.clearFileInfo();
        // Reset the file input to allow re-upload
        if (this.fileInput) {
          this.fileInput.value = '';
        }
      });
    } catch (error) {
      this.logger.error('Unexpected error in handleFileSelect:', 'error', error);
      this.clearFileInfo();
      if (this.fileInput) {
        this.fileInput.value = '';
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

    // Check file type
    const fileName = file.name || '';
    const fileExt = this.getFileExtension(fileName).toLowerCase();
    const fileType = file.type || '';
    this.logger.log("File info - Name: ".concat(fileName, ", Extension: ").concat(fileExt, ", Type: ").concat(fileType), 'debug');

    // Check if file has a valid extension or is a text file
    const isValidExtension = fileExt && ['csv', 'txt'].includes(fileExt);
    const isTextFile = fileType.match(/text\/.*/) || fileType === ''; // Some browsers might not set type for CSV

    if (!isValidExtension && !isTextFile) {
      const errorMsg = "Unsupported file type: ".concat(fileExt || 'unknown', ". Please upload a CSV or text file.");
      this.logger.error(errorMsg, {
        fileName,
        fileExt,
        fileType
      });
      throw new Error(errorMsg);
    }

    // Check file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new Error("File is too large. Maximum size is ".concat(this.formatFileSize(maxSize)));
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
            throw new Error("Missing required columns: ".concat(missingHeaders.join(', ')));
          }

          // Convert rows to user objects and store them
          this.lastParsedUsers = rows.map(row => {
            const user = {};
            headers.forEach((header, index) => {
              user[header] = row[header] || '';
            });
            return user;
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

  // ======================
  // UI Updates
  // ======================

  updateFileInfo(file) {
    if (!this.fileInfo) return;
    const fileSize = this.formatFileSize(file.size);
    const lastModified = new Date(file.lastModified).toLocaleString();
    this.fileInfo.innerHTML = "\n            <strong>".concat(file.name, "</strong><br>\n            <small>Size: ").concat(fileSize, " | Modified: ").concat(lastModified, "</small>\n        ");
  }
  showPreview(rows) {
    if (!this.previewContainer) return;
    if (!rows || rows.length === 0) {
      this.previewContainer.innerHTML = '<div class="alert alert-info">No data to display</div>';
      // Disable import button if no rows
      const importBtn = document.getElementById('start-import-btn');
      if (importBtn) {
        importBtn.disabled = true;
      }
      return;
    }
    const headers = Object.keys(rows[0]);
    const previewRows = rows.slice(0, 5); // Show first 5 rows

    let html = "\n            <div class=\"table-responsive\">\n                <table class=\"table table-sm table-striped\">\n                    <thead>\n                        <tr>\n                            ".concat(headers.map(h => "<th>".concat(h, "</th>")).join(''), "\n                        </tr>\n                    </thead>\n                    <tbody>\n                        ").concat(previewRows.map(row => "\n                            <tr>\n                                ".concat(headers.map(h => "<td>".concat(row[h] || '', "</td>")).join(''), "\n                            </tr>\n                        ")).join(''), "\n                    </tbody>\n                </table>\n                ").concat(rows.length > 5 ? "<small class=\"text-muted\">Showing 5 of ".concat(rows.length, " rows</small>") : '', "\n            </div>\n        ");
    this.previewContainer.innerHTML = html;

    // Enable import button after showing preview
    const importBtn = document.getElementById('start-import-btn');
    if (importBtn) {
      importBtn.disabled = false;
      this.logger.log('Import button enabled', 'debug');
    } else {
      this.logger.warn('Could not find import button to enable', 'warn');
    }
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
}
exports.FileHandler = FileHandler;

},{}],10:[function(require,module,exports){
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
    const logEntry = "[".concat(timestamp, "] [").concat(level.toUpperCase(), "] ").concat(message, "\n");
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
      console[level]("[FileLogger] ".concat(logEntry));
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

},{}],11:[function(require,module,exports){
"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.localAPIClient = exports.LocalAPIClient = void 0;
var _defineProperty2 = _interopRequireDefault(require("@babel/runtime/helpers/defineProperty"));
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { (0, _defineProperty2.default)(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
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
    const url = "".concat(this.baseUrl).concat(endpoint);

    // Prepare headers
    const headers = _objectSpread({
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }, options.headers);

    // Log the request
    this.logger.debug('Local API Request:', {
      method,
      url,
      headers: _objectSpread(_objectSpread({}, headers), {}, {
        'Authorization': headers.Authorization ? '***REDACTED***' : 'Not set'
      }),
      data
    });
    try {
      const response = await fetch(url, {
        method,
        headers,
        credentials: 'include',
        // Include cookies for session management
        body: data ? JSON.stringify(data) : undefined,
        signal: options.signal
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
      const error = new Error(data.message || "API request failed with status ".concat(response.status));
      error.status = response.status;
      error.details = data;
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
exports.LocalAPIClient = LocalAPIClient;
const localAPIClient = exports.localAPIClient = new LocalAPIClient(console);

},{"@babel/runtime/helpers/defineProperty":1,"@babel/runtime/helpers/interopRequireDefault":2}],12:[function(require,module,exports){
"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.localAPI = void 0;
var _defineProperty2 = _interopRequireDefault(require("@babel/runtime/helpers/defineProperty"));
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { (0, _defineProperty2.default)(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
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
    const url = "".concat(this.baseUrl).concat(endpoint);

    // Prepare headers
    const headers = _objectSpread({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }, options.headers);

    // Log the request
    this.logger.debug('Local API Request:', {
      method,
      url,
      headers: _objectSpread(_objectSpread({}, headers), {}, {
        'Authorization': headers.Authorization ? '***REDACTED***' : 'Not set'
      }),
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

},{"@babel/runtime/helpers/defineProperty":1,"@babel/runtime/helpers/interopRequireDefault":2}],13:[function(require,module,exports){
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
          console[consoleLevel]("[".concat(level.toUpperCase(), "]"), message, data || '', context || '');
        } else {
          console.log("[".concat(level.toUpperCase(), "]"), message, data || '', context || '');
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
      logElement.className = "log-entry log-".concat(logEntry.level);
      const timeStr = new Date(logEntry.timestamp).toLocaleTimeString();

      // Create a more structured log entry
      const timeElement = document.createElement('span');
      timeElement.className = 'log-time';
      timeElement.textContent = timeStr;
      const levelElement = document.createElement('span');
      levelElement.className = "log-level ".concat(logEntry.level);
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
        contextElement.textContent = "Context: ".concat(JSON.stringify(logEntry.context, null, 2));
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
    this.log("Processing ".concat(this.offlineLogs.length, " queued logs..."), 'info');
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
    logFn("[".concat(timestamp, "] [").concat(level.toUpperCase(), "] ").concat(message), data);

    // Save to file logger if available
    if (this.fileLogger) {
      try {
        // Use the appropriate log level method on fileLogger
        const logMethod = this.fileLogger[level] || this.fileLogger.info;
        if (typeof logMethod === 'function') {
          await logMethod.call(this.fileLogger, message, data);
        } else {
          console.warn("Log method '".concat(level, "' not available on fileLogger"));
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
    logElement.className = "log-entry log-".concat(logEntry.level);
    const timestamp = new Date(logEntry.timestamp).toLocaleTimeString();
    logElement.innerHTML = "\n            <span class=\"log-timestamp\">[".concat(timestamp, "]</span>\n            <span class=\"log-level\">").concat(logEntry.level.toUpperCase(), "</span>\n            <span class=\"log-message\">").concat(logEntry.message, "</span>\n        ");
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
    return this.log(message, 'debug', data);
  }
  info(message) {
    let data = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    return this.log(message, 'info', data);
  }
  success(message) {
    let data = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    return this.log(message, 'success', data);
  }
  warn(message) {
    let data = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    return this.log(message, 'warn', data);
  }
  error(message) {
    let data = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    return this.log(message, 'error', data);
  }
}
exports.Logger = Logger;

},{"./file-logger.js":10}],14:[function(require,module,exports){
"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PingOneClient = void 0;
var _defineProperty2 = _interopRequireDefault(require("@babel/runtime/helpers/defineProperty"));
var _localApi = require("./local-api.js");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { (0, _defineProperty2.default)(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; } /**
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
    // Try to use cached token if available
    const cachedToken = this.getCachedToken();
    if (cachedToken) {
      return cachedToken;
    }

    // If no cached token or it's expired, get a new one
    try {
      const response = await fetch("".concat(this.basePath, "/token"), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          clientId: this.getSettings().apiClientId,
          clientSecret: this.getSettings().apiSecret,
          environmentId: this.getSettings().environmentId,
          region: this.getSettings().region
        })
      });
      if (!response.ok) {
        const error = await response.text();
        throw new Error("Failed to get access token: ".concat(response.status, " - ").concat(error));
      }
      const data = await response.json();

      // Cache the new token
      try {
        if (typeof localStorage !== 'undefined' && typeof window !== 'undefined') {
          const expiryTime = Date.now() + data.expires_in * 1000;
          try {
            localStorage.setItem('pingone_worker_token', data.access_token);
            localStorage.setItem('pingone_token_expiry', expiryTime.toString());
          } catch (storageError) {
            console.warn('Failed to store token in localStorage:', storageError);
            // Continue without storing the token
          }
        }
      } catch (error) {
        console.warn('Error accessing localStorage:', error);
        // Continue without storing the token
      }
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
    const url = "".concat(this.basePath).concat(endpoint);

    // Skip token for token endpoint
    const isTokenRequest = endpoint === '/token';

    // Get access token if needed
    let accessToken = null;
    if (!isTokenRequest) {
      accessToken = await this.getAccessToken();
    }

    // Prepare headers
    const headers = _objectSpread({
      'Accept': 'application/json',
      'X-PingOne-Environment-Id': settings.environmentId,
      'X-PingOne-Region': settings.region
    }, options.headers);

    // Add authorization header if we have a token
    if (accessToken) {
      headers['Authorization'] = "Bearer ".concat(accessToken);
    }

    // Set content type if not already set
    if (method !== 'GET' && method !== 'HEAD' && !headers['Content-Type']) {
      if (endpoint.endsWith('/users') && method === 'POST') {
        headers['Content-Type'] = 'application/vnd.pingidentity.user.import+json';
      } else {
        headers['Content-Type'] = 'application/json';
      }
    }

    // Log the request
    this.logger.debug('PingOne API Request:', {
      method,
      url,
      headers: _objectSpread(_objectSpread({}, headers), {}, {
        'Authorization': headers.Authorization ? '***REDACTED***' : 'Not set'
      }),
      data
    });
    try {
      const response = await _localApi.localAPI.request(method, url, data, _objectSpread(_objectSpread({}, options), {}, {
        headers
      }));

      // Log successful response
      this.logger.debug('PingOne API Response:', {
        status: 200,
        // Assuming success since localAPI throws on error
        url,
        data: response
      });
      return response;
    } catch (error) {
      this.logger.error('PingOne API Error:', error);
      throw error;
    }
  }

  /**
   * Get all populations from PingOne
   * @returns {Promise<Array>} Array of population objects
   */
  async getPopulations() {
    const settings = this.getSettings();
    return this.request('GET', "/v1/environments/".concat(settings.environmentId, "/populations"));
  }

  /**
   * Test the connection to PingOne API
   * @returns {Promise<boolean>} True if connection is successful, false otherwise
   */
  async testConnection() {
    try {
      const settings = this.getSettings();
      // Try to get the populations endpoint as a way to test the connection
      await this.request('GET', "/v1/environments/".concat(settings.environmentId, "/populations?limit=1"));
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
    const endpoint = "/v1/environments/".concat(settings.environmentId, "/users");
    const {
      onProgress
    } = options;
    const results = [];
    const totalUsers = users.length;
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    // Process users in batches
    const batchSize = 5; // Adjust based on API rate limits

    for (let i = 0; i < totalUsers; i += batchSize) {
      // Process current batch
      const batch = users.slice(i, i + batchSize);
      const batchPromises = batch.map(async (user, batchIndex) => {
        const currentIndex = i + batchIndex;
        const currentUser = users[currentIndex];
        try {
          // Call progress callback before processing each user
          if (onProgress) {
            onProgress(currentIndex, totalUsers, currentUser);
          }
          const userData = {
            name: {
              given: currentUser.firstName || '',
              family: currentUser.lastName || ''
            },
            email: currentUser.email,
            username: currentUser.username || currentUser.email,
            population: {
              id: currentUser.populationId || settings.populationId
            },
            password: {
              value: currentUser.password || this.generateTemporaryPassword()
            },
            enabled: currentUser.enabled !== false
          };

          // Add any additional user properties
          if (currentUser.additionalProperties) {
            Object.assign(userData, currentUser.additionalProperties);
          }

          // Make the API request
          const result = await this.request('POST', endpoint, userData);
          successCount++;
          return {
            success: true,
            user: currentUser,
            result
          };
        } catch (error) {
          this.logger.error('Error importing user:', error);
          failedCount++;
          if (options.continueOnError) {
            var _error$response;
            const isSkipped = ((_error$response = error.response) === null || _error$response === void 0 ? void 0 : _error$response.status) === 409; // Conflict - user already exists
            if (isSkipped) {
              this.logger.warn("User ".concat(currentUser.email, " already exists, skipping"), 'warn');
              skippedCount++;
              // Call progress callback for skipped user
              if (onProgress) {
                onProgress(currentIndex + 1, totalUsers, currentUser, {
                  success: successCount,
                  failed: failedCount,
                  skipped: skippedCount
                });
              }
              return {
                success: false,
                user: currentUser,
                error: 'User already exists',
                skipped: true
              };
            }
            return {
              success: false,
              user: currentUser,
              error: error.message,
              skipped: false
            };
          }
          throw error;
        }
      });

      // Wait for the current batch to complete
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Update skipped count from batch results
      const batchSkipped = batchResults.filter(r => r === null || r === void 0 ? void 0 : r.skipped).length;
      skippedCount += batchSkipped;
      successCount -= batchSkipped; // Adjust success count if any were skipped

      // Call progress callback after batch completes
      if (onProgress) {
        const processedCount = Math.min(i + batch.length, totalUsers);
        onProgress(processedCount, totalUsers, null, {
          success: successCount,
          failed: failedCount,
          skipped: skippedCount
        });
      }
    }
    return {
      total: totalUsers,
      success: successCount,
      failed: failedCount,
      skipped: skippedCount,
      results
    };
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
}
exports.PingOneClient = PingOneClient;

},{"./local-api.js":12,"@babel/runtime/helpers/defineProperty":1,"@babel/runtime/helpers/interopRequireDefault":2}],15:[function(require,module,exports){
"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.settingsManager = exports.SettingsManager = void 0;
var _defineProperty2 = _interopRequireDefault(require("@babel/runtime/helpers/defineProperty"));
var _cryptoUtils = require("./crypto-utils.js");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { (0, _defineProperty2.default)(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
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
            logFn("[".concat(level.toUpperCase(), "] ").concat(message), ...args);
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
          this.logger.warn("Cannot save settings: Missing required fields - ".concat(validation.missingFields.join(', ')));
          return false;
        }
      }

      // Create a copy of settings for saving (without connection fields)
      const settingsToSave = _objectSpread({}, updatedSettings);

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
          throw new Error("Server responded with status ".concat(response.status, ": ").concat(error));
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
      return "enc:".concat(encrypted);
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
    const output = _objectSpread({}, target);
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
      this.settings = _objectSpread(_objectSpread({}, this.settings), newSettings);
      this.logger.info('Settings updated in memory');
      return this.settings;
    } catch (error) {
      this.logger.error("Error updating settings: ".concat(error.message));
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
      this.logger.error("Error clearing settings: ".concat(error.message), 'error');
      return false;
    }
  }

  /**
   * Get all settings
   * @returns {Object} Current settings object
   */
  getSettings() {
    return _objectSpread({}, this.settings); // Return a shallow copy to prevent direct modification
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

},{"./crypto-utils.js":8,"@babel/runtime/helpers/defineProperty":1,"@babel/runtime/helpers/interopRequireDefault":2}],16:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.UIManager = void 0;
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
    var _this$connectionStatu, _this$connectionStatu2;
    // Hide all views and remove 'active'
    Object.entries(this.views).forEach(_ref => {
      let [name, element] = _ref;
      if (element) {
        element.style.display = 'none';
        element.classList.remove('active');
      }
      const navItem = document.querySelector("[data-view=\"".concat(name, "\"]"));
      if (navItem) navItem.classList.remove('active');
    });
    // Show the selected view
    const viewElement = this.views[viewName];
    if (viewElement) {
      viewElement.style.display = 'block';
      viewElement.classList.add('active');
      this.currentView = viewName;
      const navItem = document.querySelector("[data-view=\"".concat(viewName, "\"]"));
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
          const currentStatus = (_this$connectionStatu = this.connectionStatusElement) !== null && _this$connectionStatu !== void 0 && _this$connectionStatu.classList.contains('status-connected') ? 'connected' : 'disconnected';
          const currentMessage = ((_this$connectionStatu2 = this.connectionStatusElement) === null || _this$connectionStatu2 === void 0 || (_this$connectionStatu2 = _this$connectionStatu2.querySelector('.status-message')) === null || _this$connectionStatu2 === void 0 ? void 0 : _this$connectionStatu2.textContent) || '';
          this.updateSettingsConnectionStatus(currentStatus, currentMessage);
          break;
      }
      return true;
    } else {
      console.warn("View '".concat(viewName, "' not found"));
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
      console.error("View '".concat(viewName, "' not found"));
      throw new Error("View '".concat(viewName, "' not found"));
    }

    // Hide all views
    Object.entries(this.views).forEach(_ref2 => {
      let [name, element] = _ref2;
      if (element) {
        element.style.display = 'none';
        element.classList.remove('active');
      }
      // Update nav items
      const navItem = document.querySelector("[data-view=\"".concat(name, "\"]"));
      if (navItem) {
        navItem.classList.remove('active');
      }
    });

    // Show the selected view
    viewElement.style.display = 'block';
    viewElement.classList.add('active');
    this.currentView = normalizedViewName;

    // Update active state of nav item
    const activeNavItem = document.querySelector("[data-view=\"".concat(normalizedViewName, "\"]"));
    if (activeNavItem) {
      activeNavItem.classList.add('active');
    }
    // Save current view to localStorage for persistence
    try {
      localStorage.setItem('currentView', normalizedViewName);
    } catch (e) {}
    this.logger.debug("Switched to ".concat(viewName, " view"));
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
      statusElement.innerHTML = "\n                <i class=\"fas fa-check-circle\"></i>\n                <span>All required settings are configured</span>\n            ";
      statusElement.className = 'status-message status-success';
    } else {
      statusElement.innerHTML = "\n                <i class=\"fas fa-exclamation-triangle\"></i>\n                <span>Missing required settings</span>\n            ";
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
      console.debug("Updating connection status to: ".concat(normalizedStatus, " - ").concat(normalizedMessage));

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
        connectButton.className = "btn ".concat(status === 'connected' ? 'btn-success' : 'btn-primary');
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
        statusIndicator.className = "nav-status-indicator status-".concat(status);
        statusIndicator.title = "".concat(status.charAt(0).toUpperCase() + status.slice(1), ": ").concat(this._getDefaultStatusMessage(status));
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
      console.warn("Element with ID '".concat(elementId, "' not found"));
      return false;
    }
    try {
      // Update the element's content and classes
      element.textContent = message || '';

      // Remove all status classes
      element.className = element.className.split(' ').filter(cls => !cls.startsWith('status-')).join(' ');

      // Add the new status class
      element.classList.add("status-".concat(status));

      // Add ARIA attributes for accessibility
      element.setAttribute('aria-live', 'polite');
      element.setAttribute('aria-atomic', 'true');
      return true;
    } catch (error) {
      console.error("Error updating element '".concat(elementId, "':"), error);
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
    console.debug("[".concat(timestamp, "] Connection status changed to: ").concat(status, " - ").concat(message));

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
    const errorMessage = "Failed to update status to '".concat(status, "': ").concat(error.message);
    console.error(errorMessage, error);

    // Try to show a user-visible error if possible
    try {
      const errorElement = document.getElementById('connection-error');
      if (errorElement) {
        errorElement.textContent = "Error: ".concat(errorMessage, ". ").concat(message || '');
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
          console.log("[".concat(level.toUpperCase(), "]"), message, data);
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
      var _responseData$logs;
      // Fetch logs from the UI logs endpoint
      safeLog('Fetching logs from /api/logs...', 'debug');
      const response = await fetch('/api/logs?limit=200');
      if (!response.ok) {
        throw new Error("HTTP error! status: ".concat(response.status));
      }
      const responseData = await response.json();
      safeLog('Received logs from server', 'debug', {
        count: (_responseData$logs = responseData.logs) === null || _responseData$logs === void 0 ? void 0 : _responseData$logs.length
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

        // Process logs in reverse chronological order (newest first)
        const logsToProcess = [...responseData.logs].reverse();
        logsToProcess.forEach((log, index) => {
          try {
            if (log && typeof log === 'object') {
              const logElement = document.createElement('div');
              const logLevel = (log.level || 'info').toLowerCase();
              logElement.className = "log-entry log-".concat(logLevel);
              const timestamp = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
              const level = log.level ? log.level.toUpperCase() : 'INFO';
              const message = log.message || 'No message';
              logElement.innerHTML = "\n                                <span class=\"log-timestamp\">[".concat(timestamp, "]</span>\n                                <span class=\"log-level\">").concat(level, "</span>\n                                <span class=\"log-message\">").concat(message, "</span>\n                            ");

              // Add data if present
              if (log.data && Object.keys(log.data).length > 0) {
                const dataElement = document.createElement('pre');
                dataElement.className = 'log-data';
                dataElement.textContent = JSON.stringify(log.data, null, 2);
                logElement.appendChild(dataElement);
              }
              logEntries.appendChild(logElement);
            } else {
              safeLog("Skipping invalid log entry at index ".concat(index), 'warn', log);
            }
          } catch (logError) {
            safeLog("Error processing log entry at index ".concat(index, ": ").concat(logError.message), 'error', {
              error: logError
            });
          }
        });

        // Scroll to bottom after adding logs
        this.scrollLogsToBottom();
      } else {
        safeLog('No valid log entries found in response', 'warn');
        const noLogsElement = document.createElement('div');
        noLogsElement.className = 'log-entry info';
        noLogsElement.textContent = 'No logs available';
        logEntries.appendChild(noLogsElement);
      }
    } catch (error) {
      safeLog("Error fetching logs: ".concat(error.message), 'error', {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        }
      });

      // Show error message in the UI
      const errorElement = document.createElement('div');
      errorElement.className = 'log-entry error';
      errorElement.textContent = "Error loading logs: ".concat(error.message);
      logEntries.innerHTML = '';
      logEntries.appendChild(errorElement);
    } finally {
      // Remove loading indicator
      const loadingElement = document.getElementById('logs-loading');
      if (loadingElement && loadingElement.parentNode === logEntries) {
        logEntries.removeChild(loadingElement);
      }
    }
  }

  /**
   * Show the import status section
   * @param {number} totalUsers - Total number of users to import
   */
  /**
   * Show or hide the import status section
   * @param {boolean} isImporting - Whether import is in progress
   */
  setImporting(isImporting) {
    const importButton = document.getElementById('start-import');
    const cancelButton = document.getElementById('cancel-import');
    if (importButton) {
      importButton.disabled = isImporting;
      importButton.textContent = isImporting ? 'Importing...' : 'Start Import';
    }
    if (cancelButton) {
      cancelButton.style.display = isImporting ? 'inline-block' : 'none';
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
  updateImportProgress(current, total, message) {
    let counts = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};
    const progressBar = document.getElementById('import-progress');
    const progressPercent = document.getElementById('import-progress-percent');
    const progressText = document.getElementById('import-progress-text');
    const progressCount = document.getElementById('import-progress-count');
    if (progressBar) {
      const percent = total > 0 ? Math.min(100, Math.round(current / total * 100)) : 0;
      progressBar.style.width = "".concat(percent, "%");
      progressBar.setAttribute('aria-valuenow', percent);
    }
    if (progressPercent) {
      progressPercent.textContent = "".concat(total > 0 ? Math.min(100, Math.round(current / total * 100)) : 0, "%");
    }
    if (progressText) {
      progressText.textContent = message || '';
    }
    if (progressCount) {
      progressCount.textContent = "".concat(current, " of ").concat(total, " users");
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
  showNotification(message) {
    let type = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'info';
    console.log("[".concat(type, "] ").concat(message));

    // Get or create notification container
    let notificationArea = document.getElementById('notification-area');
    if (!notificationArea) {
      console.warn('Notification area not found in the DOM');
      return;
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = "notification notification-".concat(type);
    notification.innerHTML = "\n            <div class=\"notification-content\">\n                <span class=\"notification-message\">".concat(message, "</span>\n                <button class=\"notification-close\">&times;</button>\n            </div>\n        ");

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
      'populationId': 'population-id'
    };

    // Update each form field with the corresponding setting value
    Object.entries(settingFields).forEach(_ref3 => {
      let [settingKey, fieldId] = _ref3;
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

    // Make sure the current view is visible
    const currentView = this.getLastView();
    this.showView(currentView);
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
   * Load and display logs in the logs view
   */
  async loadAndDisplayLogs() {
    const logsView = document.getElementById('logs-view');
    if (!logsView) {
      console.error('Logs view element not found');
      return;
    }

    // Show loading indicator
    let loadingElement = document.getElementById('logs-loading');
    if (!loadingElement) {
      loadingElement = document.createElement('div');
      loadingElement.id = 'logs-loading';
      loadingElement.textContent = 'Loading logs...';
      logsView.appendChild(loadingElement);
    } else {
      loadingElement.textContent = 'Loading logs...';
      loadingElement.style.display = 'block';
    }

    // Clear existing logs
    let logEntriesContainer = logsView.querySelector('.log-entries');
    if (!logEntriesContainer) {
      logEntriesContainer = document.createElement('div');
      logEntriesContainer.className = 'log-entries';
      logsView.appendChild(logEntriesContainer);
    } else {
      logEntriesContainer.innerHTML = '';
    }
    try {
      const response = await fetch('/api/logs?limit=200');
      const data = await response.json();
      if (data.success && Array.isArray(data.logs)) {
        // Hide loading indicator
        loadingElement.style.display = 'none';

        // Process and display logs
        data.logs.forEach(log => {
          if (!log) {
            console.warn('Skipping null log entry');
            return;
          }

          // Create log entry element
          const logEntry = document.createElement('div');
          logEntry.className = "log-entry log-".concat(log.level || 'info');

          // Format the log message
          const timestamp = log.timestamp ? new Date(log.timestamp).toISOString() : new Date().toISOString();
          const level = (log.level || 'info').toUpperCase();
          const message = log.message || '';
          const meta = log.meta ? ' ' + JSON.stringify(log.meta) : '';
          logEntry.textContent = "[".concat(timestamp, "] ").concat(level, ": ").concat(message).concat(meta);

          // Append to container
          logEntriesContainer.appendChild(logEntry);

          // Log the entry using the logger (for testing purposes)
          if (this.logger && typeof this.logger._log === 'function') {
            this.logger._log(log.level || 'info', log.message || '', log.meta || {});
          }
        });

        // Scroll to bottom
        logEntriesContainer.scrollTop = logEntriesContainer.scrollHeight;
      } else {
        const errorMsg = data.error || 'Failed to load logs';
        logEntriesContainer.innerHTML = "<div class=\"error\">".concat(errorMsg, "</div>");
        console.error('Failed to load logs:', errorMsg);
        if (this.logger && typeof this.logger.error === 'function') {
          this.logger.error('Failed to load logs:', errorMsg);
        }
      }
    } catch (error) {
      const errorMsg = error.message || 'Error loading logs';
      logEntriesContainer.innerHTML = "<div class=\"error\">".concat(errorMsg, "</div>");
      console.error('Error loading logs:', error);
      if (this.logger && typeof this.logger.error === 'function') {
        this.logger.error('Error loading logs:', error);
      }
    } finally {
      // Ensure loading indicator is hidden
      if (loadingElement) {
        loadingElement.style.display = 'none';
      }
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
      console.error("Form with ID '".concat(formId, "' not found"));
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
      console.error("Element with ID ".concat(elementId, " not found"));
    }
  }
}

// No need for module.exports with ES modules
exports.UIManager = UIManager;

},{}],17:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.VersionManager = void 0;
class VersionManager {
  constructor() {
    this.version = '1.1.2'; // Update this with each new version
    console.log("Version Manager initialized with version ".concat(this.version));
  }
  getVersion() {
    return this.version;
  }
  getFormattedVersion() {
    return "v".concat(this.version);
  }
  updateTitle() {
    // Update the main title
    const title = document.querySelector('h1');
    if (title) {
      // Remove any existing version number
      const baseTitle = title.textContent.replace(/\s*\(v\d+\.\d+\.\d+\)\s*$/, '').trim();
      title.textContent = "".concat(baseTitle, " (").concat(this.getFormattedVersion(), ")");
    }

    // Update the document title
    document.title = "PingOne User Import ".concat(this.getFormattedVersion());

    // Update the import button text
    this.updateImportButton();

    // Add version badge to the UI
    this.addVersionBadge();
  }
  updateImportButton() {
    const importButton = document.getElementById('start-import-btn');
    if (importButton) {
      const baseText = importButton.textContent.replace(/\s*\(v\d+\.\d+\.\d+\)\s*$/, '').trim();
      importButton.innerHTML = "<i class=\"pi pi-upload\"></i> ".concat(baseText, " (").concat(this.getFormattedVersion(), ")");
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

},{}]},{},[6]);
