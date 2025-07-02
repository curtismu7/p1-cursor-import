process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://localhost:27017/pingone-import-test';
process.env.JWT_SECRET = 'test-secret-key-123';
process.env.PORT = '3001';
jest.setTimeout(30000);
