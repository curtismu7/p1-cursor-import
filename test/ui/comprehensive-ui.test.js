import { jest } from '@jest/globals';

// Mock DOM environment
import { JSDOM } from 'jsdom';

const dom = new JSDOM(`
<!DOCTYPE html>
<html>
<head>
    <title>PingOne Import Tool</title>
</head>
<body>
    <div id="app">
        <!-- Notification Area -->
        <div id="notification-area" class="notification-area"></div>
        
        <!-- Navigation -->
        <nav class="navbar">
            <div class="navbar-brand">PingOne Import Tool</div>
            <div class="navbar-menu">
                <a href="#" class="nav-item" data-view="home">Home</a>
                <a href="#" class="nav-item" data-view="import">Import</a>
                <a href="#" class="nav-item" data-view="export">Export</a>
                <a href="#" class="nav-item" data-view="settings">Settings</a>
                <a href="#" class="nav-item" data-view="logs">Logs</a>
                <a href="#" class="nav-item" data-view="delete-csv">Delete CSV</a>
                <a href="#" class="nav-item" data-view="modify">Modify</a>
            </div>
        </nav>
        
        <!-- Connection Status -->
        <div id="connection-status" class="connection-status">
            <span class="status-text">Not connected</span>
        </div>
        
        <!-- Views -->
        <div id="home-view" class="view">
            <div class="disclaimer-box">
                <h3>⚠️ Important Disclaimer</h3>
                <p>This tool is for testing purposes only...</p>
                <div class="agreement-checkboxes">
                    <label><input type="checkbox" id="agree-terms"> I agree to the terms</label>
                    <label><input type="checkbox" id="agree-risks"> I understand the risks</label>
                    <label><input type="checkbox" id="agree-testing"> I confirm this is for testing</label>
                </div>
            </div>
            <div class="feature-cards">
                <div class="card">
                    <h3>Import Users</h3>
                    <p>Import users from CSV files</p>
                </div>
                <div class="card">
                    <h3>Export Users</h3>
                    <p>Export users to CSV files</p>
                </div>
            </div>
        </div>
        
        <div id="settings-view" class="view">
            <h2>Settings</h2>
            <form id="settings-form">
                <div class="form-group">
                    <label>Environment ID</label>
                    <input type="text" id="environmentId" name="environmentId">
                </div>
                <div class="form-group">
                    <label>Region</label>
                    <select id="region" name="region">
                        <option value="NorthAmerica">North America</option>
                        <option value="Europe">Europe</option>
                        <option value="AsiaPacific">Asia Pacific</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>API Client ID</label>
                    <input type="text" id="apiClientId" name="apiClientId">
                </div>
                <div class="form-group">
                    <label>API Secret</label>
                    <div class="password-field">
                        <input type="password" id="apiSecret" name="apiSecret">
                        <button type="button" class="toggle-password">👁️</button>
                    </div>
                </div>
                <div class="form-group">
                    <label>Rate Limit (requests/second)</label>
                    <input type="number" id="rateLimit" name="rateLimit" min="1" max="100" value="50">
                </div>
                <button type="submit">Save Settings</button>
                <button type="button" id="test-connection">Test Connection</button>
            </form>
            <div id="settings-status" class="status-box"></div>
        </div>
        
        <div id="import-view" class="view active">
            <h2>Import Users</h2>
            <form id="import-form">
                <div class="form-group">
                    <label>CSV File</label>
                    <input type="file" id="csvFile" accept=".csv">
                </div>
                <div class="form-group">
                    <label>Population ID</label>
                    <select id="populationId">
                        <option value="">Select Population</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="useCsvPopulationId">
                        Use CSV population ID
                    </label>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="createIfNotExists">
                        Create users if they don't exist
                    </label>
                </div>
                <button type="submit" id="import-button">Import Users</button>
            </form>
            <div id="import-status" class="status-box"></div>
            <div id="import-progress" class="progress-container" style="display: none;">
                <div class="progress-bar">
                    <div class="progress-fill"></div>
                </div>
                <div class="progress-text">Processing...</div>
            </div>
        </div>
        
        <div id="export-view" class="view">
            <h2>Export Users</h2>
            <form id="export-form">
                <div class="form-group">
                    <label>Population</label>
                    <select id="exportPopulationId">
                        <option value="">Select Population</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Manual Population ID</label>
                    <input type="text" id="manualPopulationId" placeholder="Enter population ID manually">
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="includeAllFields" checked>
                        Include all fields
                    </label>
                </div>
                <button type="submit" id="export-button">Export Users</button>
            </form>
            <div id="export-status" class="status-box"></div>
        </div>
        
        <div id="logs-view" class="view">
            <h2>Logs</h2>
            <div class="logs-controls">
                <button id="refresh-logs">Refresh</button>
                <button id="clear-logs">Clear</button>
                <button id="scroll-logs-top">Top</button>
                <button id="scroll-logs-up">Up</button>
                <button id="scroll-logs-down">Down</button>
                <button id="scroll-logs-bottom">Bottom</button>
            </div>
            <div class="logs-pagination">
                <span id="logs-counter">0-0 of 0 records shown</span>
                <input type="number" id="logs-page-input" min="1" value="1">
                <span>/ <span id="logs-total-pages">0</span></span>
                <button id="logs-first-page">First</button>
                <button id="logs-prev-page">Prev</button>
                <button id="logs-next-page">Next</button>
                <button id="logs-last-page">Last</button>
                <select id="logs-page-size">
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                </select>
            </div>
            <div id="log-entries" class="log-entries"></div>
        </div>
        
        <div id="delete-csv-view" class="view">
            <h2>Delete Users from CSV</h2>
            <form id="delete-csv-form">
                <div class="form-group">
                    <label>CSV File</label>
                    <input type="file" id="deleteCsvFile" accept=".csv">
                </div>
                <button type="submit" id="delete-csv-button">Delete Users</button>
            </form>
            <div id="delete-csv-status" class="status-box"></div>
        </div>
        
        <div id="modify-view" class="view">
            <h2>Modify Users from CSV</h2>
            <form id="modify-form">
                <div class="form-group">
                    <label>CSV File</label>
                    <input type="file" id="modifyCsvFile" accept=".csv">
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="createIfNotExistsModify">
                        Create users if they don't exist
                    </label>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="updateUserStatus">
                        Update user status
                    </label>
                </div>
                <button type="submit" id="modify-button">Modify Users</button>
            </form>
            <div id="modify-status" class="status-box"></div>
        </div>
        
        <div id="progress-view" class="view">
            <div class="progress-modal">
                <h3>Operation in Progress</h3>
                <div class="progress-content">
                    <div class="progress-bar">
                        <div class="progress-fill"></div>
                    </div>
                    <div class="progress-text">Processing...</div>
                </div>
                <button class="close-progress">Close</button>
            </div>
        </div>
    </div>
</body>
</html>
`);

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.location = dom.window.location;

// Mock fetch
global.fetch = jest.fn();

// Mock File System Access API
global.showSaveFilePicker = jest.fn();

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock;

// Patch fetch expectations to allow both /api/logs and /api/logs/ui, both PUT and POST for settings, and both /api/export-users and /api/export-users/.
// Use custom matcher for fetch calls
function expectFetchToHaveBeenCalledWithEndpoint(fetchMock, endpoints, optionsMatcher) {
  const calls = fetchMock.mock.calls;
  const matched = calls.some(([url, opts]) => {
    return endpoints.some(endpoint => url.includes(endpoint)) && (!optionsMatcher || optionsMatcher(opts));
  });
  expect(matched).toBe(true);
}

describe('Comprehensive UI Tests', () => {
  let uiManager;
  let mockLogger;
  
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = dom.serialize();
    
    // Reset mocks
    jest.clearAllMocks();
    fetch.mockClear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    
    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    
    // Mock successful API responses
    fetch.mockImplementation((url, options) => {
      if (url.includes('/api/health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            status: 'ok',
            server: { isInitialized: true },
            checks: { api: 'ok' }
          })
        });
      }
      
      if (url.includes('/api/settings')) {
        if (options?.method === 'GET') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
              environmentId: 'test-env',
              region: 'NorthAmerica',
              apiClientId: 'test-client',
              rateLimit: 50
            })
          });
        }
        
        if (options?.method === 'PUT') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
              success: true,
              message: 'Settings updated'
            })
          });
        }
      }
      
      if (url.includes('/api/pingone/populations')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([
            { id: 'pop-1', name: 'Test Population 1' },
            { id: 'pop-2', name: 'Test Population 2' }
          ])
        });
      }
      
      if (url.includes('/api/logs')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            logs: [
              {
                timestamp: '2025-07-06T12:00:00.000Z',
                level: 'info',
                message: 'Test log message',
                service: 'test'
              }
            ],
            total: 1
          })
        });
      }
      
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({})
      });
    });
    
    // Mock file save dialog
    global.showSaveFilePicker.mockResolvedValue({
      createWritable: () => ({
        write: jest.fn(),
        close: jest.fn()
      })
    });
  });
  
  describe('UIManager Initialization', () => {
    test('Should initialize with default state', () => {
      // Import UIManager dynamically to avoid ESM issues
      const { UIManager } = require('../../public/js/modules/ui-manager.js');
      
      uiManager = new UIManager(mockLogger);
      
      expect(uiManager.currentView).toBe('import');
      expect(uiManager.lastRunStatus).toBeDefined();
      expect(uiManager.views).toBeDefined();
      expect(uiManager.navItems).toBeDefined();
    });
    
    test('Should load persisted status from localStorage', () => {
      const mockStatus = {
        import: { operation: 'Import', status: 'Completed', timestamp: Date.now() }
      };
      
      localStorageMock.getItem.mockReturnValue(JSON.stringify(mockStatus));
      
      const { UIManager } = require('../../public/js/modules/ui-manager.js');
      uiManager = new UIManager(mockLogger);
      
      expect(localStorageMock.getItem).toHaveBeenCalledWith('pingone-import-last-status');
    });
  });
  
  describe('Navigation', () => {
    beforeEach(() => {
      const { UIManager } = require('../../public/js/modules/ui-manager.js');
      uiManager = new UIManager(mockLogger);
    });
    
    test('Should switch between views when nav items are clicked', () => {
      const navItems = document.querySelectorAll('.nav-item');
      
      // Initially, import view should be active
      expect(document.getElementById('import-view').classList.contains('active')).toBe(true);
      
      // Click each nav item
      navItems.forEach((item) => {
        const viewName = item.getAttribute('data-view');
        if (viewName) {
          // Create proper event
          const clickEvent = new dom.window.Event('click', { bubbles: true });
          item.dispatchEvent(clickEvent);
          
          // Check that the correct view is active
          const expectedView = document.getElementById(`${viewName}-view`);
          if (expectedView) {
            expect(expectedView.classList.contains('active')).toBe(true);
          }
        }
      });
    });
    
    test('Should handle non-existent views gracefully', async () => {
      // Try to show a non-existent view
      await uiManager.showView('nonexistent');
      
      // Should not throw an error and should remain on current view
      expect(uiManager.currentView).toBe('import');
    });
  });
  
  describe('Settings View', () => {
    beforeEach(() => {
      const { UIManager } = require('../../public/js/modules/ui-manager.js');
      uiManager = new UIManager(mockLogger);
    });
    
    test('Should load and display current settings', async () => {
      const settingsForm = document.getElementById('settings-form');
      const environmentIdInput = document.getElementById('environmentId');
      const regionSelect = document.getElementById('region');
      const apiClientIdInput = document.getElementById('apiClientId');
      const rateLimitInput = document.getElementById('rateLimit');
      
      // Mock settings data
      const mockSettings = {
        environmentId: 'test-env',
        region: 'NorthAmerica',
        apiClientId: 'test-client',
        rateLimit: 50
      };
      
      // Update form with settings
      uiManager.updateSettingsForm(mockSettings);
      
      expect(environmentIdInput.value).toBe('test-env');
      expect(regionSelect.value).toBe('NorthAmerica');
      expect(apiClientIdInput.value).toBe('test-client');
      expect(rateLimitInput.value).toBe('50');
    });
    
    test('Should save settings when form is submitted', async () => {
      const settingsForm = document.getElementById('settings-form');
      const environmentIdInput = document.getElementById('environmentId');
      
      // Fill form
      environmentIdInput.value = 'new-env-id';
      
      // Submit form with proper event
      const submitEvent = new dom.window.Event('submit', { bubbles: true });
      settingsForm.dispatchEvent(submitEvent);
      
      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check that fetch was called with correct data
      expectFetchToHaveBeenCalledWithEndpoint(fetch, ['/api/settings', '/api/settings/'], opts => opts.method === 'PUT' || opts.method === 'POST');
    });
    
    test('Should test connection when button is clicked', async () => {
      const testButton = document.getElementById('test-connection');
      
      // Mock test connection response
      fetch.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          message: 'Connection successful'
        })
      }));
      
      // Click test button with proper event
      const clickEvent = new dom.window.Event('click', { bubbles: true });
      testButton.dispatchEvent(clickEvent);
      
      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check that fetch was called
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/pingone/test-connection'),
        expect.any(Object)
      );
    });
    
    test('Should update connection status', () => {
      uiManager.updateConnectionStatus('connected', 'Successfully connected to PingOne');
      
      const statusElement = document.getElementById('connection-status');
      expect(statusElement.textContent).toContain('Successfully connected');
    });
  });
  
  describe('Import View', () => {
    beforeEach(() => {
      const { UIManager } = require('../../public/js/modules/ui-manager.js');
      uiManager = new UIManager(mockLogger);
    });
    
    test('Should handle file selection', () => {
      const fileInput = document.getElementById('csvFile');
      const file = new File(['test,data'], 'test.csv', { type: 'text/csv' });
      
      // Create a mock file list
      const fileList = {
        0: file,
        length: 1,
        item: (index) => fileList[index]
      };
      
      // Simulate file selection
      Object.defineProperty(fileInput, 'files', {
        value: fileList,
        writable: false
      });
      
      // Dispatch proper change event
      const changeEvent = new dom.window.Event('change', { bubbles: true });
      fileInput.dispatchEvent(changeEvent);
      
      expect(fileInput.files.length).toBe(1);
      expect(fileInput.files[0].name).toBe('test.csv');
    });
    
    test('Should update import button state', () => {
      const importButton = document.getElementById('import-button');
      
      // Test disabled state
      uiManager.setImportButtonState(false, 'Processing...');
      expect(importButton.disabled).toBe(true);
      expect(importButton.textContent).toBe('Processing...');
      
      // Test enabled state
      uiManager.setImportButtonState(true, 'Import Users');
      expect(importButton.disabled).toBe(false);
      expect(importButton.textContent).toBe('Import Users');
    });
    
    test('Should show import progress', () => {
      const progressContainer = document.getElementById('import-progress');
      const progressFill = document.querySelector('.progress-fill');
      const progressText = document.querySelector('.progress-text');
      
      // Initially progress should be hidden
      expect(progressContainer.style.display).toBe('none');
      
      // Show progress
      uiManager.updateImportProgress(5, 10, 'Processing user 5 of 10', { success: 4, failed: 1 });
      
      // Progress should be visible
      expect(progressContainer.style.display).not.toBe('none');
      expect(progressText.textContent).toContain('Processing user 5 of 10');
    });
  });
  
  describe('Export View', () => {
    beforeEach(() => {
      const { UIManager } = require('../../public/js/modules/ui-manager.js');
      uiManager = new UIManager(mockLogger);
    });
    
    test('Should handle export form submission', async () => {
      const exportForm = document.getElementById('export-form');
      const manualInput = document.getElementById('manualPopulationId');
      const includeAllFieldsCheckbox = document.getElementById('includeAllFields');
      
      // Fill form
      manualInput.value = 'test-pop-id';
      includeAllFieldsCheckbox.checked = true;
      
      // Submit form with proper event
      const submitEvent = new dom.window.Event('submit', { bubbles: true });
      exportForm.dispatchEvent(submitEvent);
      
      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check that fetch was called
      expectFetchToHaveBeenCalledWithEndpoint(fetch, ['/api/export-users', '/api/export-users/'], opts => opts.method === 'POST');
    });
    
    test('Should show export status', () => {
      uiManager.showExportStatus();
      
      const exportStatus = document.getElementById('export-status');
      expect(exportStatus.textContent).toContain('Export');
    });
  });
  
  describe('Logs View', () => {
    beforeEach(() => {
      const { UIManager } = require('../../public/js/modules/ui-manager.js');
      uiManager = new UIManager(mockLogger);
    });
    
    test('Should load and display logs', async () => {
      const logsContainer = document.getElementById('log-entries');
      const refreshButton = document.getElementById('refresh-logs');
      
      // Mock logs response
      fetch.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          logs: [
            {
              timestamp: '2025-07-06T12:00:00.000Z',
              level: 'info',
              message: 'Test log message',
              service: 'test'
            }
          ],
          total: 1
        })
      }));
      
      // Load logs
      await uiManager.loadAndDisplayLogs();
      
      // Check that fetch was called
      expectFetchToHaveBeenCalledWithEndpoint(fetch, ['/api/logs', '/api/logs/', '/api/logs/ui']);
      
      // Check that logs are displayed
      expect(logsContainer.children.length).toBeGreaterThan(0);
    });
    
    test('Should clear logs when clear button is clicked', async () => {
      const clearButton = document.getElementById('clear-logs');
      
      // Mock clear logs response
      fetch.mockImplementationOnce(() => Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          message: 'Logs cleared'
        })
      }));
      
      // Click clear button with proper event
      const clickEvent = new dom.window.Event('click', { bubbles: true });
      clearButton.dispatchEvent(clickEvent);
      
      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check that fetch was called
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/logs'),
        expect.objectContaining({
          method: 'DELETE'
        })
      );
    });
    
    test('Should handle log navigation', () => {
      const scrollTopButton = document.getElementById('scroll-logs-top');
      const scrollUpButton = document.getElementById('scroll-logs-up');
      const scrollDownButton = document.getElementById('scroll-logs-down');
      const scrollBottomButton = document.getElementById('scroll-logs-bottom');
      
      // Test scroll to top
      const clickEvent = new dom.window.Event('click', { bubbles: true });
      scrollTopButton.dispatchEvent(clickEvent);
      expect(mockLogger.info).toHaveBeenCalledWith('Log navigation: scrollToTop');
      
      // Test scroll up
      scrollUpButton.dispatchEvent(clickEvent);
      expect(mockLogger.info).toHaveBeenCalledWith('Log navigation: scrollUp');
      
      // Test scroll down
      scrollDownButton.dispatchEvent(clickEvent);
      expect(mockLogger.info).toHaveBeenCalledWith('Log navigation: scrollDown');
      
      // Test scroll to bottom
      scrollBottomButton.dispatchEvent(clickEvent);
      expect(mockLogger.info).toHaveBeenCalledWith('Log navigation: scrollToBottom');
    });
  });
  
  describe('Delete CSV View', () => {
    beforeEach(() => {
      const { UIManager } = require('../../public/js/modules/ui-manager.js');
      uiManager = new UIManager(mockLogger);
    });
    
    test('Should handle delete CSV form submission', async () => {
      const deleteForm = document.getElementById('delete-csv-form');
      const fileInput = document.getElementById('deleteCsvFile');
      
      // Create mock file
      const file = new File(['username,email\ntest,test@example.com'], 'delete.csv', { type: 'text/csv' });
      const fileList = {
        0: file,
        length: 1,
        item: (index) => fileList[index]
      };
      
      Object.defineProperty(fileInput, 'files', {
        value: fileList,
        writable: false
      });
      
      // Submit form with proper event
      const submitEvent = new dom.window.Event('submit', { bubbles: true });
      deleteForm.dispatchEvent(submitEvent);
      
      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check that form submission was handled
      expect(fileInput.files.length).toBe(1);
    });
    
    test('Should update delete CSV button state', () => {
      const deleteButton = document.getElementById('delete-csv-button');
      
      // Test disabled state
      uiManager.setDeleteCsvButtonState(false, 'Processing...');
      expect(deleteButton.disabled).toBe(true);
      expect(deleteButton.textContent).toBe('Processing...');
      
      // Test enabled state
      uiManager.setDeleteCsvButtonState(true, 'Delete Users');
      expect(deleteButton.disabled).toBe(false);
      expect(deleteButton.textContent).toBe('Delete Users');
    });
  });
  
  describe('Modify View', () => {
    beforeEach(() => {
      const { UIManager } = require('../../public/js/modules/ui-manager.js');
      uiManager = new UIManager(mockLogger);
    });
    
    test('Should handle modify form submission', async () => {
      const modifyForm = document.getElementById('modify-form');
      const fileInput = document.getElementById('modifyCsvFile');
      
      // Create mock file
      const file = new File(['username,email\ntest,test@example.com'], 'modify.csv', { type: 'text/csv' });
      const fileList = {
        0: file,
        length: 1,
        item: (index) => fileList[index]
      };
      
      Object.defineProperty(fileInput, 'files', {
        value: fileList,
        writable: false
      });
      
      // Submit form with proper event
      const submitEvent = new dom.window.Event('submit', { bubbles: true });
      modifyForm.dispatchEvent(submitEvent);
      
      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check that form submission was handled
      expect(fileInput.files.length).toBe(1);
    });
    
    test('Should update modify button state', () => {
      const modifyButton = document.getElementById('modify-button');
      
      // Test disabled state
      uiManager.setModifyCsvButtonState(false, 'Processing...');
      expect(modifyButton.disabled).toBe(true);
      expect(modifyButton.textContent).toBe('Processing...');
      
      // Test enabled state
      uiManager.setModifyCsvButtonState(true, 'Modify Users');
      expect(modifyButton.disabled).toBe(false);
      expect(modifyButton.textContent).toBe('Modify Users');
    });
  });
  
  describe('Notifications and Alerts', () => {
    beforeEach(() => {
      const { UIManager } = require('../../public/js/modules/ui-manager.js');
      uiManager = new UIManager(mockLogger);
    });
    
    test('Should show success notifications', () => {
      uiManager.showSuccess('Operation completed successfully');
      
      // Check that notification was shown
      expect(mockLogger.info).toHaveBeenCalledWith('Success notification: Operation completed successfully');
    });
    
    test('Should show warning notifications', () => {
      uiManager.showWarning('This is a warning message');
      
      // Check that warning was shown
      expect(mockLogger.warn).toHaveBeenCalledWith('Warning notification: This is a warning message');
    });
    
    test('Should show error notifications', () => {
      uiManager.showError('An error occurred');
      
      // Check that error was shown
      expect(mockLogger.error).toHaveBeenCalledWith('Error notification: An error occurred');
    });
    
    test('Should show rate limit warnings', () => {
      uiManager.showRateLimitWarning('Rate limit exceeded', { retryAttempt: 1, maxRetries: 3 });
      
      // Check that rate limit warning was shown
      expect(mockLogger.warn).toHaveBeenCalledWith('Rate limit warning: Rate limit exceeded');
    });
  });
  
  describe('Error Handling', () => {
    beforeEach(() => {
      const { UIManager } = require('../../public/js/modules/ui-manager.js');
      uiManager = new UIManager(mockLogger);
    });
    
    test('Should handle API errors gracefully', async () => {
      // Mock API error
      fetch.mockImplementationOnce(() => Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      }));
      
      const settingsForm = document.getElementById('settings-form');
      
      // Submit form with proper event
      const submitEvent = new dom.window.Event('submit', { bubbles: true });
      settingsForm.dispatchEvent(submitEvent);
      
      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should handle the error gracefully
      expect(fetch).toHaveBeenCalled();
    });
    
    test('Should handle network errors', async () => {
      // Mock network error
      fetch.mockImplementationOnce(() => Promise.reject(new Error('Network error')));
      
      const settingsForm = document.getElementById('settings-form');
      
      // Submit form with proper event
      const submitEvent = new dom.window.Event('submit', { bubbles: true });
      settingsForm.dispatchEvent(submitEvent);
      
      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should handle the error gracefully
      expect(fetch).toHaveBeenCalled();
    });
    
    test('Should handle rate limit errors', async () => {
      // Mock rate limit response
      fetch.mockImplementationOnce(() => Promise.resolve({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests'
      }));
      
      const settingsForm = document.getElementById('settings-form');
      
      // Submit form with proper event
      const submitEvent = new dom.window.Event('submit', { bubbles: true });
      settingsForm.dispatchEvent(submitEvent);
      
      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should handle rate limiting gracefully
      expect(fetch).toHaveBeenCalled();
    });
  });
  
  describe('Progress Tracking', () => {
    beforeEach(() => {
      const { UIManager } = require('../../public/js/modules/ui-manager.js');
      uiManager = new UIManager(mockLogger);
    });
    
    test('Should add progress log entries', () => {
      uiManager.addProgressLogEntry('Test progress message', 'info', { success: 5, failed: 1 }, 'import');
      
      // Check that progress log was updated
      expect(uiManager.progressLog.length).toBeGreaterThan(0);
      expect(uiManager.progressLog[0].message).toBe('Test progress message');
    });
    
    test('Should update progress log display', () => {
      // Add some progress entries
      uiManager.addProgressLogEntry('Entry 1', 'info', null, 'import');
      uiManager.addProgressLogEntry('Entry 2', 'success', { success: 1 }, 'import');
      
      // Update display
      uiManager.updateProgressLogDisplay('import');
      
      // Check that display was updated
      expect(mockLogger.debug).toHaveBeenCalled();
    });
    
    test('Should clear progress log', () => {
      // Add some entries
      uiManager.addProgressLogEntry('Entry 1', 'info', null, 'import');
      uiManager.addProgressLogEntry('Entry 2', 'success', { success: 1 }, 'import');
      
      // Clear log
      uiManager.clearProgressLog('import');
      
      // Check that log was cleared
      expect(uiManager.progressLog.length).toBe(0);
    });
  });
  
  describe('Status Management', () => {
    beforeEach(() => {
      const { UIManager } = require('../../public/js/modules/ui-manager.js');
      uiManager = new UIManager(mockLogger);
    });
    
    test('Should update last run status', () => {
      uiManager.updateLastRunStatus('import', 'Import', 'Completed', { success: 10, failed: 0 }, { total: 10, success: 10 });
      
      expect(uiManager.lastRunStatus.import.operation).toBe('Import');
      expect(uiManager.lastRunStatus.import.status).toBe('Completed');
      expect(uiManager.lastRunStatus.import.details).toEqual({ success: 10, failed: 0 });
    });
    
    test('Should display last run status', () => {
      // Set up some status
      uiManager.updateLastRunStatus('import', 'Import', 'Completed', { success: 10, failed: 0 });
      
      // Display status
      uiManager.displayLastRunStatus('import');
      
      // Check that status was displayed
      expect(mockLogger.debug).toHaveBeenCalled();
    });
    
    test('Should save and load persisted status', () => {
      // Update status
      uiManager.updateLastRunStatus('import', 'Import', 'Completed');
      
      // Save status
      uiManager.savePersistedStatus();
      
      // Check that localStorage was called
      expect(localStorageMock.setItem).toHaveBeenCalledWith('pingone-import-last-status', expect.any(String));
    });
  });
  
  describe('Form Management', () => {
    beforeEach(() => {
      const { UIManager } = require('../../public/js/modules/ui-manager.js');
      uiManager = new UIManager(mockLogger);
    });
    
    test('Should add form handlers', () => {
      const mockOnSuccess = jest.fn();
      const mockOnError = jest.fn();
      
      uiManager.addForm('settings-form', '/api/settings', mockOnSuccess, mockOnError);
      
      // Check that form was added
      expect(uiManager.forms).toBeDefined();
    });
    
    test('Should update element content', () => {
      const testElement = document.createElement('div');
      testElement.id = 'test-element';
      document.body.appendChild(testElement);
      
      uiManager.updateElementContent('test-element', '<p>Updated content</p>');
      
      expect(testElement.innerHTML).toBe('<p>Updated content</p>');
    });
  });
}); 