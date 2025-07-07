// Simple test to verify Jest setup

jest.setTimeout(30000);

global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

global.fetch = jest.fn();

// Basic test to verify Jest is working
test('1 + 1 equals 2', () => {
  expect(1 + 1).toBe(2);
});

// Test async/await
const fetchData = () => Promise.resolve('data');
test('async/await test', async () => {
  const data = await fetchData();
  expect(data).toBe('data');
});

// Test with a mock
const mockFn = jest.fn(x => 42 + x);
test('mock function test', () => {
  mockFn(10);
  expect(mockFn).toHaveBeenCalledWith(10);
  expect(mockFn.mock.results[0].value).toBe(52);
});
