// Set up TextEncoder and TextDecoder as globals before anything else
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Now import JSDOM after setting up TextEncoder/TextDecoder
const { JSDOM } = require('jsdom');

// Set up JSDOM
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = {
  userAgent: 'node.js',
};

// Add TextEncoder and TextDecoder for JSDOM
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = value.toString();
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();

global.localStorage = localStorageMock;

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock window.scrollTo
window.scrollTo = jest.fn();

// Mock requestAnimationFrame
window.requestAnimationFrame = (callback) => {
  return setTimeout(callback, 0);
};

window.cancelAnimationFrame = (id) => {
  clearTimeout(id);
};

// Mock getComputedStyle
Object.defineProperty(window, 'getComputedStyle', {
  value: () => ({
    getPropertyValue: () => '',
  }),
});

// Mock Blob
if (typeof window.Blob === 'undefined') {
  window.Blob = class Blob {
    constructor(parts = [], options = {}) {
      this.parts = parts;
      this.options = options;
    }
  };
}

// Mock File
if (typeof window.File === 'undefined') {
  window.File = class File {
    constructor(parts, name, options) {
      this.name = name || 'file.txt';
      this.type = options?.type || '';
      this.size = parts.reduce((size, part) => size + (part.length || 0), 0);
    }
  };
}

// Mock FileReader
if (typeof window.FileReader === 'undefined') {
  window.FileReader = class FileReader {
    constructor() {
      this.result = null;
      this.onload = null;
      this.onerror = null;
    }
    
    readAsText(file) {
      this.result = file.parts[0] || '';
      if (this.onload) {
        this.onload({ target: { result: this.result } });
      }
    }
    
    readAsDataURL() {
      this.result = 'data:text/plain;base64,' + Buffer.from('test').toString('base64');
      if (this.onload) {
        this.onload({ target: { result: this.result } });
      }
    }
  };
}
