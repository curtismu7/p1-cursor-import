// Setup test environment variables
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://localhost:27017/pingone-import-test';
process.env.JWT_SECRET = 'test-secret';
process.env.PINGONE_ENVIRONMENT_ID = 'test-env-id';
process.env.PINGONE_REGION = 'test-region';

// Set up any global mocks or utilities needed for all tests
if (typeof global.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = await import('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// Mock any global browser APIs that might be needed
if (typeof global.fetch === 'undefined') {
  global.fetch = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  });
}

// Test utilities
export const testUtils = {
  mockFetchResponse: (ok, data) => ({
    ok,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  }),
};

// This file is imported by setup-tests.js which handles the test setup
export default {
  testUtils
};
