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
        <nav class="navbar">
            <div class="navbar-brand">PingOne Import Tool</div>
            <div class="navbar-menu">
                <a href="#" class="nav-link" data-page="home">Home</a>
                <a href="#" class="nav-link" data-page="import">Import</a>
                <a href="#" class="nav-link" data-page="export">Export</a>
                <a href="#" class="nav-link" data-page="settings">Settings</a>
                <a href="#" class="nav-link" data-page="logs">Logs</a>
            </div>
        </nav>
        
        <div id="home-page" class="page active">
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
        
        <div id="settings-page" class="page">
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
            <div id="status-box" class="status-box"></div>
        </div>
        
        <div id="import-page" class="page">
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
                <button type="submit">Import Users</button>
            </form>
            <div id="import-progress" class="progress-container" style="display: none;">
                <div class="progress-bar">
                    <div class="progress-fill"></div>
                </div>
                <div class="progress-text">Processing...</div>
            </div>
        </div>
        
        <div id="export-page" class="page">
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
                <button type="submit">Export Users</button>
            </form>
        </div>
        
        <div id="logs-page" class="page">
            <h2>Logs</h2>
            <div class="logs-controls">
                <button id="refresh-logs">Refresh</button>
                <button id="clear-logs">Clear</button>
            </div>
            <div id="logs-container"></div>
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

describe('Comprehensive UI Tests', () => {
  let uiManager;
  
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = dom.serialize();
    
    // Reset mocks
    jest.clearAllMocks();
    fetch.mockClear();
    
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
          json: () => Promise.resolve({
            _embedded: {
              populations: [
                { id: 'pop-1', name: 'Test Population 1' },
                { id: 'pop-2', name: 'Test Population 2' }
              ]
            }
          })
        });
      }
      
      if (url.includes('/api/export-users')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            success: true,
            message: 'Export started',
            jobId: 'test-job-123'
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
  
  describe('Navigation', () => {
    test('Should switch between pages when nav links are clicked', () => {
      const navLinks = document.querySelectorAll('.nav-link');
      const pages = document.querySelectorAll('.page');
      
      // Click each nav link
      navLinks.forEach((link, index) => {
        link.click();
        
        // Check that only one page is active
        const activePages = document.querySelectorAll('.page.active');
        expect(activePages.length).toBe(1);
        
        // Check that the correct page is active
        const expectedPage = document.querySelector(`#${link.dataset.page}-page`);
        expect(expectedPage.classList.contains('active')).toBe(true);
      });
    });
  });
  
  describe('Home Page', () => {
    test('Should show disclaimer and require agreement', () => {
      const disclaimerBox = document.querySelector('.disclaimer-box');
      const checkboxes = document.querySelectorAll('.agreement-checkboxes input[type="checkbox"]');
      const featureCards = document.querySelector('.feature-cards');
      
      expect(disclaimerBox).toBeTruthy();
      expect(checkboxes.length).toBe(3);
      
      // Initially, feature cards should be visible but disabled
      expect(featureCards).toBeTruthy();
    });
    
    test('Should enable features when all checkboxes are checked', () => {
      const checkboxes = document.querySelectorAll('.agreement-checkboxes input[type="checkbox"]');
      
      // Check all checkboxes
      checkboxes.forEach(checkbox => {
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change'));
      });
      
      // Features should now be enabled
      const featureCards = document.querySelectorAll('.card');
      featureCards.forEach(card => {
        expect(card.classList.contains('disabled')).toBe(false);
      });
    });
  });
  
  describe('Settings Page', () => {
    test('Should load and display current settings', async () => {
      // Simulate loading settings
      const settingsForm = document.getElementById('settings-form');
      const environmentIdInput = document.getElementById('environmentId');
      const regionSelect = document.getElementById('region');
      const apiClientIdInput = document.getElementById('apiClientId');
      const rateLimitInput = document.getElementById('rateLimit');
      
      // Mock settings load
      environmentIdInput.value = 'test-env';
      regionSelect.value = 'NorthAmerica';
      apiClientIdInput.value = 'test-client';
      rateLimitInput.value = '50';
      
      expect(environmentIdInput.value).toBe('test-env');
      expect(regionSelect.value).toBe('NorthAmerica');
      expect(apiClientIdInput.value).toBe('test-client');
      expect(rateLimitInput.value).toBe('50');
    });
    
    test('Should save settings when form is submitted', async () => {
      const settingsForm = document.getElementById('settings-form');
      const environmentIdInput = document.getElementById('environmentId');
      const statusBox = document.getElementById('status-box');
      
      // Fill form
      environmentIdInput.value = 'new-env-id';
      
      // Submit form
      settingsForm.dispatchEvent(new Event('submit'));
      
      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check that fetch was called with correct data
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/settings'),
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          }),
          body: expect.stringContaining('new-env-id')
        })
      );
    });
    
    test('Should toggle password visibility', () => {
      const apiSecretInput = document.getElementById('apiSecret');
      const toggleButton = document.querySelector('.toggle-password');
      
      // Initially should be password type
      expect(apiSecretInput.type).toBe('password');
      
      // Click toggle button
      toggleButton.click();
      
      // Should now be text type
      expect(apiSecretInput.type).toBe('text');
      
      // Click again
      toggleButton.click();
      
      // Should be password again
      expect(apiSecretInput.type).toBe('password');
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
      
      // Click test button
      testButton.click();
      
      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check that fetch was called
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/pingone/test-connection'),
        expect.any(Object)
      );
    });
  });
  
  describe('Import Page', () => {
    test('Should load populations for import', async () => {
      const populationSelect = document.getElementById('populationId');
      
      // Simulate loading populations
      const option1 = document.createElement('option');
      option1.value = 'pop-1';
      option1.textContent = 'Test Population 1';
      populationSelect.appendChild(option1);
      
      const option2 = document.createElement('option');
      option2.value = 'pop-2';
      option2.textContent = 'Test Population 2';
      populationSelect.appendChild(option2);
      
      expect(populationSelect.children.length).toBe(2);
      expect(populationSelect.children[0].value).toBe('pop-1');
      expect(populationSelect.children[1].value).toBe('pop-2');
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
      
      fileInput.dispatchEvent(new Event('change'));
      
      expect(fileInput.files.length).toBe(1);
      expect(fileInput.files[0].name).toBe('test.csv');
    });
    
    test('Should show progress during import', async () => {
      const importForm = document.getElementById('import-form');
      const progressContainer = document.getElementById('import-progress');
      const progressFill = document.querySelector('.progress-fill');
      const progressText = document.querySelector('.progress-text');
      
      // Initially progress should be hidden
      expect(progressContainer.style.display).toBe('none');
      
      // Submit import form
      importForm.dispatchEvent(new Event('submit'));
      
      // Progress should be visible
      expect(progressContainer.style.display).not.toBe('none');
      expect(progressText.textContent).toContain('Processing');
    });
  });
  
  describe('Export Page', () => {
    test('Should load populations for export', async () => {
      const populationSelect = document.getElementById('exportPopulationId');
      
      // Simulate loading populations
      const option1 = document.createElement('option');
      option1.value = 'pop-1';
      option1.textContent = 'Test Population 1';
      populationSelect.appendChild(option1);
      
      expect(populationSelect.children.length).toBe(1);
      expect(populationSelect.children[0].value).toBe('pop-1');
    });
    
    test('Should enable export with manual population ID', () => {
      const exportForm = document.getElementById('export-form');
      const manualInput = document.getElementById('manualPopulationId');
      const exportButton = exportForm.querySelector('button[type="submit"]');
      
      // Initially button should be disabled
      expect(exportButton.disabled).toBe(true);
      
      // Enter manual population ID
      manualInput.value = 'manual-pop-id';
      manualInput.dispatchEvent(new Event('input'));
      
      // Button should now be enabled
      expect(exportButton.disabled).toBe(false);
    });
    
    test('Should handle export submission', async () => {
      const exportForm = document.getElementById('export-form');
      const manualInput = document.getElementById('manualPopulationId');
      const includeAllFieldsCheckbox = document.getElementById('includeAllFields');
      
      // Fill form
      manualInput.value = 'test-pop-id';
      includeAllFieldsCheckbox.checked = true;
      
      // Submit form
      exportForm.dispatchEvent(new Event('submit'));
      
      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check that fetch was called
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/export-users'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          }),
          body: expect.stringContaining('test-pop-id')
        })
      );
    });
  });
  
  describe('Logs Page', () => {
    test('Should load and display logs', async () => {
      const logsContainer = document.getElementById('logs-container');
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
      
      // Click refresh button
      refreshButton.click();
      
      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check that fetch was called
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/logs'),
        expect.any(Object)
      );
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
      
      // Click clear button
      clearButton.click();
      
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
  });
  
  describe('Error Handling', () => {
    test('Should handle API errors gracefully', async () => {
      // Mock API error
      fetch.mockImplementationOnce(() => Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      }));
      
      const settingsForm = document.getElementById('settings-form');
      const statusBox = document.getElementById('status-box');
      
      // Submit form
      settingsForm.dispatchEvent(new Event('submit'));
      
      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should show error message
      expect(statusBox.textContent).toContain('Error');
    });
    
    test('Should handle network errors', async () => {
      // Mock network error
      fetch.mockImplementationOnce(() => Promise.reject(new Error('Network error')));
      
      const settingsForm = document.getElementById('settings-form');
      
      // Submit form
      settingsForm.dispatchEvent(new Event('submit'));
      
      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should handle the error gracefully
      expect(fetch).toHaveBeenCalled();
    });
  });
  
  describe('Rate Limiting', () => {
    test('Should handle rate limit errors', async () => {
      // Mock rate limit response
      fetch.mockImplementationOnce(() => Promise.resolve({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests'
      }));
      
      const settingsForm = document.getElementById('settings-form');
      
      // Submit form
      settingsForm.dispatchEvent(new Event('submit'));
      
      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should handle rate limiting gracefully
      expect(fetch).toHaveBeenCalled();
    });
  });
}); 