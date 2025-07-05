process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://localhost:27017/pingone-import-test';
process.env.JWT_SECRET = 'test-secret-key-123';
process.env.PORT = '4000';
jest.setTimeout(30000);
