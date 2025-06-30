// Import the test setup file
import { testUtils } from './setup.js';
import { jest } from '@jest/globals';

// Set test timeout to 30 seconds (for slow CI environments)
const TEST_TIMEOUT = 30000;

// Global test setup
beforeAll(async () => {
  console.log('Running global test setup...');
  
  // Mock global fetch if not already mocked
  if (!global.fetch) {
    global.fetch = jest.fn();
  }
  
  // Mock console methods
  global.console = {
    ...console,
    error: jest.fn(),
    warn: jest.fn(),
    log: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };
  
  // Mock any other global objects needed for tests
  if (typeof global.TextEncoder === 'undefined') {
    const { TextEncoder, TextDecoder } = await import('util');
    global.TextEncoder = TextEncoder;
    global.TextDecoder = TextDecoder;
  }
});

// Global test teardown
afterAll(async () => {
  console.log('Running global test teardown...');
  // Clean up any global state
  jest.restoreAllMocks();
  
  // Reset fetch mock
  if (global.fetch) {
    global.fetch.mockClear();
  }
  
  // Reset console mocks
  Object.keys(console).forEach(key => {
    if (typeof console[key].mockClear === 'function') {
      console[key].mockClear();
    }
  });
});

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  
  // Reset fetch mock implementation
  if (global.fetch) {
    global.fetch.mockReset();
  }
});

// Clean up after each test
afterEach(async () => {
  // Clean up any test-specific state
  jest.clearAllTimers();
});

// Set a longer timeout for all tests
jest.setTimeout(TEST_TIMEOUT);

// Mock any modules that need to be mocked globally
jest.mock('node-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));

// Export test utilities
export { testUtils };
