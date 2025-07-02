// Minimal test to verify Jest setup
const { test, expect, jest: jestMock } = require('@jest/globals');

// Simple test
const sum = (a, b) => a + b;

test('adds 1 + 2 to equal 3', () => {
  expect(sum(1, 2)).toBe(3);
});

// Test with mock
const mockFn = jestMock.fn(x => 42 + x);
test('mock function test', () => {
  mockFn(10);
  expect(mockFn).toHaveBeenCalledWith(10);
  expect(mockFn.mock.results[0].value).toBe(52);
});

// Async test
const fetchData = () => Promise.resolve('peanut butter');
test('async test', async () => {
  const data = await fetchData();
  expect(data).toBe('peanut butter');
});
