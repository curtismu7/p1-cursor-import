import { v4 as uuidv4 } from 'uuid';

/**
 * Generate test user data
 * @param {number} count - Number of test users to generate
 * @returns {Array} Array of test user objects
 */
export const generateTestUsers = (count = 5) => {
  const users = [];
  
  for (let i = 0; i < count; i++) {
    users.push({
      id: uuidv4(),
      email: `testuser${i}@example.com`,
      firstName: `Test${i}`,
      lastName: `User${i}`,
      username: `testuser${i}`,
      password: `Test@123${i}`,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }
  
  return users;
};

/**
 * Generate test import job data
 * @param {object} overrides - Properties to override in the test job
 * @returns {object} Test import job object
 */
export const generateTestJob = (overrides = {}) => ({
  jobId: uuidv4(),
  userId: 'test-user-id',
  status: 'pending',
  importType: 'auto',
  total: 10,
  processed: 0,
  success: 0,
  failed: 0,
  users: [],
  errors: [],
  startedAt: new Date(),
  completedAt: null,
  ...overrides
});

/**
 * Mock Express request object
 * @param {object} overrides - Properties to override in the request
 * @returns {object} Mock Express request object
 */
export const mockRequest = (overrides = {}) => ({
  params: {},
  query: {},
  body: {},
  headers: {},
  cookies: {},
  session: {},
  user: null,
  ...overrides,
  get(field) {
    return this.headers[field.toLowerCase()] || null;
  },
  header(field) {
    return this.get(field);
  },
});

/**
 * Mock Express response object
 * @returns {object} Mock Express response object
 */
export const mockResponse = () => {
  const res = {};
  
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.redirect = jest.fn().mockReturnValue(res);
  res.set = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  
  return res;
};

/**
 * Mock Express next function
 * @returns {function} Mock next function
 */
export const mockNext = () => jest.fn();

/**
 * Wait for a promise to resolve or reject
 * @param {Promise} promise - The promise to wait for
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise} The result of the promise
 */
export const waitForPromise = (promise, timeout = 5000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Promise timeout')), timeout)
    )
  ]);
};

/**
 * Mock WebSocket client
 * @returns {object} Mock WebSocket client
 */
export const mockWebSocketClient = () => ({
  id: `ws-${uuidv4()}`,
  emit: jest.fn(),
  disconnect: jest.fn(),
  join: jest.fn(),
  leave: jest.fn(),
  to: jest.fn().mockReturnThis(),
});

export default {
  generateTestUsers,
  generateTestJob,
  mockRequest,
  mockResponse,
  mockNext,
  waitForPromise,
  mockWebSocketClient,
};
