// Test setup file - CommonJS format

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://localhost:27017/pingone-import-test';
process.env.JWT_SECRET = 'test-secret-key-123';
process.env.PORT = '4000';

// No jest or global mocks here. Do mocking and timeout in test files as needed.
