const { test, expect, beforeEach, afterEach, jest: jestMock } = require('@jest/globals');
const FileLogger = require('../public/js/modules/file-logger');

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: jestMock.fn((key) => store[key] || null),
    setItem: jestMock.fn((key, value) => {
      store[key] = String(value);
    }),
    removeItem: jestMock.fn((key) => {
      delete store[key];
    }),
    clear: jestMock.fn(() => {
      store = {};
    }),
  };
})();

// Mock Blob for download test
class MockBlob {
  constructor(content, options) {
    this.content = content;
    this.type = options?.type || '';
  }
}

// Create mock functions for URL methods
const mockCreateObjectURL = jestMock.fn(() => 'blob:test');
const mockRevokeObjectURL = jestMock.fn();

// Create a mock link object
const createMockLink = () => ({
  href: '',
  download: '',
  click: jestMock.fn(),
});

// Set up global mocks
global.Blob = MockBlob;
global.URL = {
  createObjectURL: mockCreateObjectURL,
  revokeObjectURL: mockRevokeObjectURL,
};
global.document = {
  createElement: jestMock.fn(createMockLink),
  body: {
    appendChild: jestMock.fn(),
    removeChild: jestMock.fn(),
  },
};

global.localStorage = localStorageMock;

describe('FileLogger', () => {
  let logger;
  const testKey = 'test-logs';
  const originalConsoleError = console.error;

  beforeEach(() => {
    // Clear all mocks and reset localStorage before each test
    jestMock.clearAllMocks();
    localStorage.clear();
    console.error = jestMock.fn(); // Mock console.error
    
    // Create a new logger instance for each test
    logger = new FileLogger(testKey);
  });

  afterEach(() => {
    // Clean up after each test
    jestMock.clearAllMocks();
    localStorage.clear();
    console.error = originalConsoleError;
  });

  test('should initialize with a header if localStorage is empty', () => {
    expect(localStorage.getItem).toHaveBeenCalledWith(testKey);
    expect(logger.logs).toContain('PINGONE IMPORT LOG');
    expect(logger.logs).toContain('SENSITIVE DATA');
  });

  test('should load existing logs from localStorage', () => {
    const testLogs = 'Test log entry\n';
    localStorage.setItem(testKey, testLogs);
    
    // Create a new logger instance to test loading
    const newLogger = new FileLogger(testKey);
    
    expect(newLogger.logs).toBe(testLogs);
  });

  test('should add log entry with timestamp and level', async () => {
    const message = 'Test message';
    const level = 'INFO';
    
    await logger.log(level, message);
    
    // Note the space after INFO to match the actual implementation (padEnd(5))
    expect(logger.logs).toContain(`[${level} ] ${message}`);
    expect(logger.logs).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
  });

  test('should save logs to localStorage when they reach a certain size', async () => {
    const largeMessage = 'x'.repeat(10000); // 10KB message
    
    // Add enough logs to exceed the max log size
    for (let i = 0; i < 15; i++) {
      await logger.log('INFO', `Log ${i}: ${largeMessage}`);
    }
    
    expect(localStorage.setItem).toHaveBeenCalled();
  });

  test('should clear logs', async () => {
    // Add some logs
    await logger.log('INFO', 'Test message');
    
    // Clear logs - note the method is clear(), not clearLogs()
    logger.clear();
    
    // After clear, it will re-initialize with a header
    expect(logger.logs).toContain('PINGONE IMPORT LOG');
    expect(localStorage.setItem).toHaveBeenCalledWith(testKey, expect.any(String));
  });

  test('should handle log data with sensitive information', async () => {
    const sensitiveData = {
      token: 'secret-token',
      password: 'my-password',
      api_key: 'api-key-123',
      safeData: 'this is safe'
    };
    
    await logger.log('INFO', 'Testing sensitive data', sensitiveData);
    
    // Check that sensitive data is redacted
    expect(logger.logs).toContain('***REDACTED***');
    expect(logger.logs).toContain('this is safe');
    expect(logger.logs).not.toContain('secret-token');
    expect(logger.logs).not.toContain('my-password');
    expect(logger.logs).not.toContain('api-key-123');
  });

  test('should attempt to download logs', () => {
    // Save original implementations to restore later
    const originalConsoleError = console.error;
    const originalBlob = global.Blob;
    const originalCreateObjectURL = global.URL.createObjectURL;
    const originalRevokeObjectURL = global.URL.revokeObjectURL;
    
    // Mock console.error
    console.error = jestMock.fn();
    
    // Mock the Blob constructor
    global.Blob = class MockBlob {
      constructor(content, options) {
        this.content = content;
        this.type = options?.type || '';
      }
    };
    
    // Mock URL methods
    global.URL.createObjectURL = jestMock.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = jestMock.fn();
    
    // Mock document.createElement
    const originalCreateElement = document.createElement;
    document.createElement = jestMock.fn((tagName) => {
      if (tagName === 'a') {
        return {
          href: '',
          download: '',
          click: jestMock.fn(),
        };
      }
      return originalCreateElement(tagName);
    });
    
    try {
      // Call the download method
      logger.download();
      
      // Verify that the download was attempted by checking the logs
      const logs = logger.getLogs();
      expect(logs).toContain('PINGONE IMPORT LOG');
      
      // Verify no errors were logged
      expect(console.error).not.toHaveBeenCalled();
      
      // Verify URL.createObjectURL was called
      expect(global.URL.createObjectURL).toHaveBeenCalled();
    } finally {
      // Restore the original implementations
      console.error = originalConsoleError;
      global.Blob = originalBlob;
      global.URL.createObjectURL = originalCreateObjectURL;
      global.URL.revokeObjectURL = originalRevokeObjectURL;
      document.createElement = originalCreateElement;
    }
  });
});
