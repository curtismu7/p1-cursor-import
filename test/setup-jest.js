// Polyfill for TextEncoder/TextDecoder
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: jest.fn((key) => store[key] || null),
    setItem: jest.fn((key, value) => {
      store[key] = String(value);
    }),
    removeItem: jest.fn((key) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

// Mock global objects
global.localStorage = localStorageMock;

// Mock fetch if not already polyfilled
if (!global.fetch) {
  global.fetch = jest.fn();
}

// Mock console methods
console.error = jest.fn();
console.warn = jest.fn();
console.log = jest.fn();

// Reset all mocks before each test
afterEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});
