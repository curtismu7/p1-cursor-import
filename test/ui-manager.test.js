const { JSDOM } = require('jsdom');
const { UIManager } = require('../public/js/modules/ui-manager');

// Mock the DOM environment
const { window } = new JSDOM(`
  <!DOCTYPE html>
  <html>
    <body>
      <div id="import-view" style="display: none;"></div>
      <div id="settings-view" style="display: none;"></div>
      <div id="logs-view" style="display: none;">
        <div class="log-entries"></div>
      </div>
      <div class="nav-item" data-view="import">Import</div>
      <div class="nav-item" data-view="settings">Settings</div>
      <div class="nav-item" data-view="logs">Logs</div>
    </body>
  </html>
`);

global.window = window;
global.document = window.document;

// Mock fetch
global.fetch = jest.fn();

// Mock the fetch response for logs
const mockFetchResponse = (ok, data) => ({
  ok,
  status: ok ? 200 : 500,
  json: () => Promise.resolve(data),
  text: () => Promise.resolve(JSON.stringify(data))
});

describe('UIManager', () => {
  let uiManager;
  let mockLogger;

  beforeEach(() => {
    // Reset DOM before each test
    document.body.innerHTML = window.document.body.innerHTML;
    
    // Mock logger with necessary methods
    mockLogger = {
      logs: [],
      _log: jest.fn((level, message, data) => {
        mockLogger.logs.push({ level, message, data });
      }),
      clearLogs: jest.fn(() => {
        mockLogger.logs = [];
      })
    };

    // Create a new instance for each test
    uiManager = new UIManager(mockLogger);
  });

  describe('showView', () => {
    test('should switch to the specified view and activate nav item', async () => {
      // Mock the fetch response for logs
      global.fetch.mockResolvedValueOnce(mockFetchResponse(true, {
        success: true,
        logs: []
      }));

      // Initial state
      expect(document.getElementById('import-view').style.display).toBe('none');
      expect(document.getElementById('logs-view').style.display).toBe('none');
      
      // Switch to logs view
      await uiManager.showView('logs');
      
      // Verify view is shown and nav item is active
      expect(document.getElementById('logs-view').style.display).toBe('block');
      expect(document.querySelector('[data-view="logs"]').classList.contains('active')).toBe(true);
      
      // Switch back to import view
      await uiManager.showView('import');
      
      // Verify view is shown and nav item is active
      expect(document.getElementById('import-view').style.display).toBe('block');
      expect(document.querySelector('[data-view="import"]').classList.contains('active')).toBe(true);
      expect(document.getElementById('logs-view').style.display).toBe('none');
    });

    test('should handle non-existent view', async () => {
      const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      
      await uiManager.showView('nonexistent');
      
      expect(consoleWarn).toHaveBeenCalledWith('View \'nonexistent\' not found');
      consoleWarn.mockRestore();
    });
  });

  describe('loadAndDisplayLogs', () => {
    let originalFetch;
    let mockLogs;

    beforeEach(() => {
      // Mock fetch
      originalFetch = global.fetch;
      
      // Sample log data
      mockLogs = [
        { level: 'info', message: 'Test info log', data: { test: true } },
        { level: 'error', message: 'Test error log', data: { error: 'Something went wrong' } }
      ];
      
      global.fetch = jest.fn(() => 
        Promise.resolve(mockFetchResponse(true, {
          success: true,
          logs: mockLogs,
          count: mockLogs.length,
          total: mockLogs.length
        }))
      );
    });

    afterEach(() => {
      // Restore original fetch
      global.fetch = originalFetch;
      jest.clearAllMocks();
    });

    test('should fetch and display logs', async () => {
      // Switch to logs view to trigger log loading
      await uiManager.showView('logs');
      
      // Verify fetch was called with correct URL
      expect(global.fetch).toHaveBeenCalledWith('/api/logs/ui?limit=200');
      
      // Wait for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Verify logs were processed
      expect(mockLogger._log).toHaveBeenCalledTimes(mockLogs.length);
      expect(mockLogger._log).toHaveBeenCalledWith(
        'info',
        'Test info log',
        { test: true }
      );
      
      // Verify loading indicator is removed
      expect(document.getElementById('logs-loading')).toBeNull();
    });

    test('should handle fetch error', async () => {
      // Mock fetch to reject
      global.fetch = jest.fn(() =>
        Promise.reject(new Error('Network error'))
      );
      
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // Switch to logs view to trigger log loading
      await uiManager.showView('logs');
      
      // Wait for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Verify error handling
      expect(consoleError).toHaveBeenCalledWith('Error fetching logs:', expect.any(Error));
      
      // Verify error message is displayed
      const logEntries = document.querySelector('.log-entries');
      expect(logEntries.textContent).toContain('Error loading logs: Network error');
      
      consoleError.mockRestore();
      
      // Clear the mock to avoid affecting other tests
      global.fetch.mockClear();
    });

    test('should handle invalid log entries', async () => {
      // Mock fetch to return invalid log entries
      global.fetch = jest.fn(() =>
        Promise.resolve(mockFetchResponse(true, {
          success: true,
          logs: [
            null,
            { invalid: 'entry' },
            { level: 'info', message: 'Valid log' }
          ]
        }))
      );
      
      const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Switch to logs view to trigger log loading
      await uiManager.showView('logs');
      
      // Wait for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Verify logs were processed correctly
      // The UIManager calls _log for each valid log entry
      // In this test, we have two valid log entries: { invalid: 'entry' } and { level: 'info', message: 'Valid log' }
      // The null entry is skipped with a warning
      expect(mockLogger._log).toHaveBeenCalledTimes(2);
      expect(mockLogger._log).toHaveBeenCalledWith('info', 'Valid log', {});
      
      // Verify warning was logged for the null entry
      // The { invalid: 'entry' } is actually processed as a valid log with default values
      expect(consoleWarn).toHaveBeenCalledTimes(1);
      
      // Clear the mock to avoid affecting other tests
      mockLogger._log.mockClear();
      
      consoleWarn.mockRestore();
    });
  });
});
