// Simple test to verify Jest setup
import { test, expect, describe, beforeAll, afterEach } from '@jest/globals';

// DOM Testing
import { JSDOM } from 'jsdom';

// Set up a basic DOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.window = dom.window;

describe('Basic Tests', () => {
  test('1 + 1 equals 2', () => {
    expect(1 + 1).toBe(2);
  });

  test('object assignment', () => {
    const data = { one: 1 };
    data['two'] = 2;
    expect(data).toEqual({ one: 1, two: 2 });
  });

  describe('array tests', () => {
    test('adding to array', () => {
      const arr = [1, 2, 3];
      arr.push(4);
      expect(arr).toHaveLength(4);
      expect(arr).toContain(3);
    });
  });
});

describe('DOM Tests', () => {
  let container;

  beforeAll(() => {
    // Set up a container for our tests
    container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);
  });

  afterEach(() => {
    // Clean up after each test
    container.innerHTML = '';
  });

  test('can manipulate DOM', () => {
    // Create and append an element
    const testElement = document.createElement('div');
    testElement.id = 'test-element';
    testElement.textContent = 'Hello, DOM!';
    container.appendChild(testElement);

    // Test the element exists and has the correct content
    const foundElement = document.getElementById('test-element');
    expect(foundElement).not.toBeNull();
    expect(foundElement.textContent).toBe('Hello, DOM!');
  });
});
