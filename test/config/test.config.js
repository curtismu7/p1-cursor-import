export default {
  // Test environment configuration
  env: 'test',
  
  // Server configuration
  server: {
    port: process.env.TEST_PORT || 4000,
    host: 'localhost',
    apiPrefix: '/api',
  },
  
  // Database configuration
  db: {
    uri: process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/pingone-import-test',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },
  
  // Authentication configuration
  auth: {
    jwtSecret: 'test-secret-key',
    tokenExpiresIn: '1h',
  },
  
  // PingOne configuration
  pingone: {
    environmentId: 'test-env-id',
    region: 'test-region',
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    tokenUrl: 'https://auth.pingone.com/test-env-id/as/token',
    apiUrl: 'https://api.pingone.com/v1/environments/test-env-id',
  },
  
  // Import configuration
  import: {
    batchSize: 10,
    maxRetries: 3,
    retryDelay: 1000,
  },
  
  // Logging configuration
  logging: {
    level: 'error', // Only log errors during tests
    file: 'test.log',
  },
};
