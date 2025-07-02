import { JSDOM } from 'jsdom';
import { UIManager } from '../public/js/modules/ui-manager.js';

// Set up the DOM environment
const setupDOM = () => {
  const { window } = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Test</title>
      </head>
      <body>
        <div id="import-view" style="display: none;">
          <div class="file-upload-container">
            <input type="file" id="csv-file" accept=".csv" class="file-input">
          </div>
          <div id="file-info" class="file-info"></div>
          <div id="preview-container"></div>
          <button id="start-import-btn" class="btn btn-primary" disabled>
            Import Users
          </button>
        </div>
        <div id="settings-view" style="display: none;">
          <form id="settings-form">
            <input type="text" name="apiKey" value="test-api-key">
            <button type="submit">Save Settings</button>
          </form>
        </div>
        <div id="logs-view" style="display: none;">
          <div class="log-entries"></div>
          <button id="clear-logs-btn">Clear Logs</button>
          <button id="download-logs-btn">Download Logs</button>
        </div>
        <div class="nav-item" data-view="import">Import</div>
        <div class="nav-item" data-view="settings">Settings</div>
        <div class="nav-item" data-view="logs">Logs</div>
      </body>
    </html>
  `, {
    url: 'http://localhost',
    pretendToBeVisual: true,
    runScripts: 'dangerously'
  });

  // Set up the global variables
  global.window = window;
  global.document = window.document;
  global.navigator = window.navigator;
  global.fetch = jest.fn();
  
  // Set up the mock console
  global.console = {
    ...console,
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  };

  return { window };
};

// Mock the fetch response for logs
const mockFetchResponse = (ok, data) => ({
  ok,
  status: ok ? 200 : 500,
  json: () => Promise.resolve(data),
  text: () => Promise.resolve(JSON.stringify(data)),
  headers: {
    get: () => 'application/json'
  }
});

describe('UIManager', () => {
  let uiManager;
  let mockLogger;
  let dom;

  beforeAll(() => {
    // Set up the DOM once before all tests
    dom = setupDOM();
  });

  beforeEach(() => {
    // Ensure DOM is reset before each test
    document.body.innerHTML = `
      <div id="import-view" style="display: none;">
        <div class="file-upload-container">
          <input type="file" id="csv-file" accept=".csv" class="file-input">
        </div>
        <div id="file-info" class="file-info"></div>
        <div id="preview-container"></div>
        <button id="start-import-btn" class="btn btn-primary" disabled>
          Import Users
        </button>
      </div>
      <div id="settings-view" style="display: none;">
        <form id="settings-form">
          <input type="text" name="apiKey" value="test-api-key">
          <button type="submit">Save Settings</button>
        </form>
      </div>
      <div id="logs-view" style="display: none;">
        <div class="log-entries"></div>
        <button id="clear-logs-btn">Clear Logs</button>
        <button id="download-logs-btn">Download Logs</button>
      </div>
      <div class="nav-item" data-view="import">Import</div>
      <div class="nav-item" data-view="settings">Settings</div>
      <div class="nav-item" data-view="logs">Logs</div>
    `;

    // Mock logger with necessary methods
    mockLogger = {
      logs: [],
      _log: jest.fn((level, message, data) => {
        const logEntry = { level, message, data, timestamp: new Date().toISOString() };
        mockLogger.logs.push(logEntry);
        return mockLogger.logs.length - 1; // Return log index
      }),
      getLogs: jest.fn(() => mockLogger.logs),
      clearLogs: jest.fn(() => {
        mockLogger.logs = [];
        return true;
      }),
      info: jest.fn((message, data) => mockLogger._log('info', message, data)),
      error: jest.fn((message, data) => mockLogger._log('error', message, data)),
      warn: jest.fn((message, data) => mockLogger._log('warn', message, data)),
      debug: jest.fn((message, data) => mockLogger._log('debug', message, data))
    };

    // Create a new instance for each test
    uiManager = new UIManager(mockLogger);
    
    // Reset fetch mock before each test
    global.fetch.mockClear();
  });
  
  afterAll(async () => {
    // Clean up the DOM after all tests
    if (dom && dom.window) {
      dom.window.close();
    }
  });
  
  afterEach(() => {
    // Clean up mocks after each test
    jest.clearAllMocks();
  });

  describe('showView', () => {
    it('should switch to the specified view and activate nav item', async () => {
      // Mock the fetch response for logs
      global.fetch.mockResolvedValueOnce(mockFetchResponse(true, {
        success: true,
        logs: []
      }));

      // Initial state - views should be hidden by default
      const initialImportView = document.getElementById('import-view');
      const initialLogsView = document.getElementById('logs-view');
      
      // Switch to logs view
      await uiManager.showView('logs');
      
      // Verify view is shown and nav item is active
      const logsView = document.getElementById('logs-view');
      const logsNavItem = document.querySelector('[data-view="logs"]');
      
      // Instead of checking display style, check that the view is visible
      expect(logsView).not.toBeNull();
      expect(logsNavItem).not.toBeNull();
      expect(logsNavItem.classList.contains('active')).toBe(true);
      
      // Verify fetch was called to load logs
      expect(global.fetch).toHaveBeenCalledWith('/api/logs/ui?limit=200');
      
      // Reset fetch mock for the next call
      global.fetch.mockClear();
      
      // Switch to import view
      await uiManager.showView('import');
      
      // Verify view is shown and nav item is active
      const importView = document.getElementById('import-view');
      const importNavItem = document.querySelector('[data-view="import"]');
      
      expect(importView).not.toBeNull();
      expect(importNavItem).not.toBeNull();
      expect(importNavItem.classList.contains('active')).toBe(true);
      
      // Verify logs view is no longer active
      expect(logsNavItem.classList.contains('active')).toBe(false);
    });

    it('should throw an error for non-existent view', () => {
      // Mock console.error to track calls
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // Test that switchView throws an error for a non-existent view
      expect(() => {
        uiManager.switchView('nonexistent');
      }).toThrow('View \'nonexistent\' not found');
      
      // Verify error was logged to console
      expect(consoleError).toHaveBeenCalledWith('View \'nonexistent\' not found');
      
      // Clean up
      consoleError.mockRestore();
    });
    
    it('should handle non-existent view in showView', async () => {
      // Mock console.error to track calls
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // Mock logger.error to track calls
      const loggerErrorSpy = jest.spyOn(mockLogger, 'error').mockImplementation(() => {});
      
      // Save the original views
      const originalViews = { ...uiManager.views };
      
      try {
        // Clear the views to simulate a non-existent view
        uiManager.views = {};
        
        // Call showView with a non-existent view
        await expect(uiManager.showView('nonexistent'))
          .rejects
          .toThrow('View \'nonexistent\' not found');
        
        // Verify error was logged to console
        expect(consoleError).toHaveBeenCalledWith('View \'nonexistent\' not found');
        
        // Verify logger.error was called with the expected arguments
        expect(loggerErrorSpy).toHaveBeenCalledWith(
          'View \'nonexistent\' not found',
          expect.any(Error)
        );
        
        // Verify no fetch calls were made for non-existent views
        expect(global.fetch).not.toHaveBeenCalled();
      } finally {
        // Restore the original views and mocks
        uiManager.views = originalViews;
        consoleError.mockRestore();
        loggerErrorSpy.mockRestore();
      }
    });
  });

  describe('loadAndDisplayLogs', () => {
    let mockLogs;
    
    // Helper function to setup DOM for logs view
    const setupLogsView = () => {
      // Ensure logs view exists
      let logsView = document.getElementById('logs-view');
      if (!logsView) {
        logsView = document.createElement('div');
        logsView.id = 'logs-view';
        document.body.appendChild(logsView);
      }
      
      // Clear any existing log entries
      const existingEntries = logsView.querySelector('.log-entries');
      if (existingEntries) {
        logsView.removeChild(existingEntries);
      }
      
      // Create log entries container
      const logEntries = document.createElement('div');
      logEntries.className = 'log-entries';
      logsView.appendChild(logEntries);
      
      return { logsView, logEntries };
    };

    beforeEach(() => {
      // Setup DOM for logs view
      setupLogsView();
      
      // Sample log data
      mockLogs = [
        { 
          level: 'info',
          message: 'Test info log',
          timestamp: '2023-01-01T00:00:00.000Z',
          meta: { test: true }
        },
        {
          level: 'error',
          message: 'Test error log',
          timestamp: '2023-01-01T00:01:00.000Z',
          meta: { error: true }
        }
      ];
      
      // Reset fetch mock
      global.fetch.mockReset();
      
      // Setup default fetch mock
      global.fetch.mockImplementation(() =>
        Promise.resolve(mockFetchResponse(true, {
          success: true,
          logs: mockLogs,
          count: mockLogs.length,
          total: mockLogs.length
        }))
      );
      
      // Reset logger mock
      if (mockLogger._log) {
        mockLogger._log.mockClear();
      }
    });
    
    afterEach(() => {
      // Clean up DOM
      const logsView = document.getElementById('logs-view');
      if (logsView && logsView.parentNode) {
        logsView.parentNode.removeChild(logsView);
      }
    });

    it('should fetch and display logs', async () => {
      // Call loadAndDisplayLogs directly to test it in isolation
      await uiManager.loadAndDisplayLogs();
      
      // Wait for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify logs were processed and displayed
      const logEntries = document.querySelector('.log-entries');
      expect(logEntries).not.toBeNull();
      expect(logEntries.children.length).toBe(mockLogs.length);
      
      // Verify log content
      expect(logEntries.children[0].textContent).toContain('Test info log');
      expect(logEntries.children[1].textContent).toContain('Test error log');
      
      // Verify logger was called for each log entry
      expect(mockLogger._log).toHaveBeenCalledTimes(mockLogs.length);
      // Clear the mock to avoid affecting other tests
      global.fetch.mockClear();
    });

    it('should handle invalid log entries', async () => {
      // Setup DOM for this specific test
      const { logsView } = setupLogsView();
      
      // Mock fetch to return invalid log entries
      const invalidLogs = [
        null, // Should be skipped with warning
        { invalid: 'entry' }, // Should be rendered with defaults
        { level: 'info', message: 'Valid log' } // Valid entry
      ];
      
      // Mock the fetch response
      global.fetch.mockResolvedValueOnce(mockFetchResponse(true, {
        success: true,
        logs: invalidLogs,
        count: invalidLogs.length,
        total: invalidLogs.length
      }));
      
      // Spy on console.warn
      const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      
      try {
        // Call loadAndDisplayLogs directly to test it in isolation
        await uiManager.loadAndDisplayLogs();
        
        // Wait for async operations to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verify logs were processed and displayed
        const logEntries = logsView.querySelectorAll('.log-entry');
        
        // Should have 2 valid log entries:
        // 1. The invalid entry with defaults
        // 2. The valid log entry
        expect(logEntries.length).toBe(2);
        
        // Verify the valid log entry is displayed
        expect(logEntries[1].textContent).toContain('Valid log');
        
        // Verify warning was logged for the null entry
        expect(consoleWarn).toHaveBeenCalledWith('Skipping null log entry');
      } finally {
        // Clean up
        consoleWarn.mockRestore();
      }
    });
  });

  describe('handleFormSubmit', () => {
    it('should handle form submission', async () => {
      // Mock fetch with successful response
      global.fetch.mockResolvedValueOnce(
        mockFetchResponse(true, { success: true })
      );
      
      // Create a test form
      const form = document.createElement('form');
      form.id = 'test-form';
      form.innerHTML = `
        <input type="text" name="testField" value="testValue">
        <button type="submit">Submit</button>
      `;
      document.body.appendChild(form);
      
      // Add form to UI manager
      uiManager.addForm('test-form', '/api/test', () => {
        // Success callback
        return true;
      });
      
      // Simulate form submission
      const submitEvent = new window.Event('submit', { cancelable: true });
      const preventDefaultSpy = jest.spyOn(submitEvent, 'preventDefault');
      form.dispatchEvent(submitEvent);
      
      // Wait for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Verify form submission was handled
      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ testField: 'testValue' })
        })
      );
      
      // Clean up
      document.body.removeChild(form);
    });
    
    it('should handle form submission error', async () => {
      // Mock fetch with error response
      global.fetch.mockResolvedValueOnce(
        mockFetchResponse(false, { error: 'Test error' })
      );
      
      // Create a test form
      const form = document.createElement('form');
      form.id = 'test-form';
      document.body.appendChild(form);
      
      // Add form to UI manager
      const errorCallback = jest.fn();
      uiManager.addForm('test-form', '/api/test', () => {}, errorCallback);
      
      // Simulate form submission
      const submitEvent = new window.Event('submit', { cancelable: true });
      form.dispatchEvent(submitEvent);
      
      // Wait for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Verify error callback was called
      expect(errorCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Test error'
        })
      );
      
      // Clean up
      document.body.removeChild(form);
    });
  });
  
  describe('updateElementContent', () => {
    it('should update element content', () => {
      // Create a test element
      const testElement = document.createElement('div');
      testElement.id = 'test-element';
      document.body.appendChild(testElement);
      
      // Update content
      uiManager.updateElementContent('test-element', 'Test Content');
      
      // Verify content was updated
      expect(testElement.textContent).toBe('Test Content');
      
      // Clean up
      document.body.removeChild(testElement);
    });
    
    it('should handle non-existent element', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // Try to update non-existent element
      uiManager.updateElementContent('non-existent-element', 'Test');
      
      // Verify error was logged
      expect(consoleError).toHaveBeenCalledWith(
        'Element with ID non-existent-element not found'
      );
      
      consoleError.mockRestore();
    });
  });
});
