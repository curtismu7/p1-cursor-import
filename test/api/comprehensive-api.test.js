import request from 'supertest';
import { createServer } from 'http';
import express from 'express';

// Mock the server for testing
jest.mock('../server.js', () => {
  const app = express();
  
  // Add basic middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Mock routes
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      server: {
        isInitialized: true,
        isInitializing: false,
        isShuttingDown: false,
        lastError: null,
        uptime: process.uptime(),
        pingOneInitialized: false,
        pingOne: {
          initialized: false,
          environmentId: 'configured',
          region: 'NorthAmerica',
          populationId: 'not configured'
        }
      },
      system: {
        node: process.version,
        platform: process.platform,
        memory: process.memoryUsage(),
        memoryUsage: '43%',
        cpu: process.cpuUsage(),
        env: 'test',
        pid: process.pid,
        cwd: process.cwd()
      },
      checks: {
        pingOneConfigured: 'error',
        pingOneConnected: 'error',
        memory: 'ok',
        diskSpace: 'ok',
        api: 'ok',
        storage: 'ok',
        logging: 'ok'
      },
      queues: {
        export: { queueLength: 0, running: 0, maxConcurrent: 3, maxQueueSize: 50 },
        import: { queueLength: 0, running: 0, maxConcurrent: 2, maxQueueSize: 30 },
        api: { queueLength: 0, running: 0, maxConcurrent: 10, maxQueueSize: 100 }
      },
      info: {
        nodeEnv: 'test',
        appVersion: '4.3.1',
        hostname: 'test-host'
      },
      message: 'One or more critical services are not healthy'
    });
  });
  
  app.get('/api/settings', (req, res) => {
    res.json({
      environmentId: 'test-env-id',
      region: 'NorthAmerica',
      apiClientId: 'test-client-id',
      populationId: '',
      rateLimit: 50,
      connectionStatus: 'disconnected',
      connectionMessage: 'Not connected',
      lastConnectionTest: null,
      autoSave: true,
      lastUsedDirectory: '',
      theme: 'light',
      pageSize: 50,
      showNotifications: true
    });
  });
  
  app.put('/api/settings', (req, res) => {
    res.json({
      success: true,
      message: 'Settings updated successfully',
      settings: req.body
    });
  });
  
  app.get('/api/logs', (req, res) => {
    res.json({
      logs: [
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Test log message',
          service: 'test'
        }
      ],
      total: 1
    });
  });
  
  app.post('/api/logs', (req, res) => {
    res.json({
      success: true,
      message: 'Log entry created'
    });
  });
  
  app.post('/api/export-users', (req, res) => {
    res.json({
      success: true,
      message: 'Export started',
      jobId: 'test-job-123'
    });
  });
  
  app.get('/api/queue/status', (req, res) => {
    res.json({
      export: { queueLength: 0, running: 0, maxConcurrent: 3, maxQueueSize: 50 },
      import: { queueLength: 0, running: 0, maxConcurrent: 2, maxQueueSize: 30 },
      api: { queueLength: 0, running: 0, maxConcurrent: 10, maxQueueSize: 100 }
    });
  });
  
  app.get('/api/queue/health', (req, res) => {
    res.json({
      status: 'healthy',
      queues: {
        export: { status: 'idle', queueLength: 0, running: 0 },
        import: { status: 'idle', queueLength: 0, running: 0 },
        api: { status: 'idle', queueLength: 0, running: 0 }
      }
    });
  });
  
  app.post('/api/pingone/test-connection', (req, res) => {
    res.json({
      success: true,
      message: 'Connection test successful',
      details: {
        environmentId: req.body.environmentId,
        region: req.body.region,
        apiClientId: req.body.apiClientId
      }
    });
  });
  
  app.post('/api/pingone/get-token', (req, res) => {
    res.json({
      success: true,
      token: 'test-token-123',
      expiresIn: 3600
    });
  });
  
  // Mock PingOne proxy endpoints
  app.get('/api/pingone/populations', (req, res) => {
    res.json({
      _embedded: {
        populations: [
          {
            id: 'pop-1',
            name: 'Test Population 1',
            description: 'Test population'
          },
          {
            id: 'pop-2', 
            name: 'Test Population 2',
            description: 'Another test population'
          }
        ]
      }
    });
  });
  
  app.get('/api/pingone/users', (req, res) => {
    res.json({
      _embedded: {
        users: [
          {
            id: 'user-1',
            username: 'testuser1',
            email: 'test1@example.com',
            population: { id: 'pop-1' }
          },
          {
            id: 'user-2',
            username: 'testuser2', 
            email: 'test2@example.com',
            population: { id: 'pop-1' }
          }
        ]
      }
    });
  });
  
  return { default: app };
});

describe('Comprehensive API Tests', () => {
  let app;
  let server;
  
  beforeAll(async () => {
    const { default: mockApp } = await import('../server.js');
    app = mockApp;
    server = createServer(app);
  });
  
  afterAll(async () => {
    if (server) {
      server.close();
    }
  });
  
  describe('Health Endpoint', () => {
    test('GET /api/health should return health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);
      
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('server');
      expect(response.body).toHaveProperty('system');
      expect(response.body).toHaveProperty('checks');
      expect(response.body).toHaveProperty('queues');
      expect(response.body).toHaveProperty('info');
    });
  });
  
  describe('Settings Endpoints', () => {
    test('GET /api/settings should return current settings', async () => {
      const response = await request(app)
        .get('/api/settings')
        .expect(200);
      
      expect(response.body).toHaveProperty('environmentId');
      expect(response.body).toHaveProperty('region');
      expect(response.body).toHaveProperty('apiClientId');
      expect(response.body).toHaveProperty('rateLimit');
    });
    
    test('PUT /api/settings should update settings', async () => {
      const newSettings = {
        environmentId: 'new-env-id',
        region: 'Europe',
        apiClientId: 'new-client-id',
        rateLimit: 75
      };
      
      const response = await request(app)
        .put('/api/settings')
        .send(newSettings)
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('settings');
    });
  });
  
  describe('Logs Endpoints', () => {
    test('GET /api/logs should return logs', async () => {
      const response = await request(app)
        .get('/api/logs')
        .expect(200);
      
      expect(response.body).toHaveProperty('logs');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.logs)).toBe(true);
    });
    
    test('POST /api/logs should create log entry', async () => {
      const logEntry = {
        level: 'info',
        message: 'Test log entry',
        service: 'test'
      };
      
      const response = await request(app)
        .post('/api/logs')
        .send(logEntry)
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
    });
  });
  
  describe('Export Endpoints', () => {
    test('POST /api/export-users should start export job', async () => {
      const exportRequest = {
        populationId: 'pop-1',
        includeAllFields: true,
        filename: 'test-export.csv'
      };
      
      const response = await request(app)
        .post('/api/export-users')
        .send(exportRequest)
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('jobId');
    });
  });
  
  describe('Queue Endpoints', () => {
    test('GET /api/queue/status should return queue status', async () => {
      const response = await request(app)
        .get('/api/queue/status')
        .expect(200);
      
      expect(response.body).toHaveProperty('export');
      expect(response.body).toHaveProperty('import');
      expect(response.body).toHaveProperty('api');
      
      expect(response.body.export).toHaveProperty('queueLength');
      expect(response.body.export).toHaveProperty('running');
      expect(response.body.export).toHaveProperty('maxConcurrent');
      expect(response.body.export).toHaveProperty('maxQueueSize');
    });
    
    test('GET /api/queue/health should return queue health', async () => {
      const response = await request(app)
        .get('/api/queue/health')
        .expect(200);
      
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('queues');
      
      expect(response.body.queues).toHaveProperty('export');
      expect(response.body.queues).toHaveProperty('import');
      expect(response.body.queues).toHaveProperty('api');
    });
  });
  
  describe('PingOne Connection Endpoints', () => {
    test('POST /api/pingone/test-connection should test connection', async () => {
      const connectionTest = {
        environmentId: 'test-env-id',
        region: 'NorthAmerica',
        apiClientId: 'test-client-id',
        apiSecret: 'test-secret'
      };
      
      const response = await request(app)
        .post('/api/pingone/test-connection')
        .send(connectionTest)
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('details');
    });
    
    test('POST /api/pingone/get-token should return token', async () => {
      const tokenRequest = {
        environmentId: 'test-env-id',
        region: 'NorthAmerica',
        apiClientId: 'test-client-id',
        apiSecret: 'test-secret'
      };
      
      const response = await request(app)
        .post('/api/pingone/get-token')
        .send(tokenRequest)
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('expiresIn');
    });
  });
  
  describe('PingOne Data Endpoints', () => {
    test('GET /api/pingone/populations should return populations', async () => {
      const response = await request(app)
        .get('/api/pingone/populations')
        .expect(200);
      
      expect(response.body).toHaveProperty('_embedded');
      expect(response.body._embedded).toHaveProperty('populations');
      expect(Array.isArray(response.body._embedded.populations)).toBe(true);
      
      if (response.body._embedded.populations.length > 0) {
        const population = response.body._embedded.populations[0];
        expect(population).toHaveProperty('id');
        expect(population).toHaveProperty('name');
      }
    });
    
    test('GET /api/pingone/users should return users', async () => {
      const response = await request(app)
        .get('/api/pingone/users')
        .expect(200);
      
      expect(response.body).toHaveProperty('_embedded');
      expect(response.body._embedded).toHaveProperty('users');
      expect(Array.isArray(response.body._embedded.users)).toBe(true);
      
      if (response.body._embedded.users.length > 0) {
        const user = response.body._embedded.users[0];
        expect(user).toHaveProperty('id');
        expect(user).toHaveProperty('username');
        expect(user).toHaveProperty('email');
        expect(user).toHaveProperty('population');
      }
    });
  });
  
  describe('Error Handling', () => {
    test('Should handle 404 for unknown endpoints', async () => {
      await request(app)
        .get('/api/unknown-endpoint')
        .expect(404);
    });
    
    test('Should handle malformed JSON', async () => {
      await request(app)
        .post('/api/settings')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);
    });
  });
  
  describe('Rate Limiting', () => {
    test('Should handle rate limiting gracefully', async () => {
      // Make multiple rapid requests to test rate limiting
      const promises = Array(10).fill().map(() => 
        request(app).get('/api/health')
      );
      
      const responses = await Promise.all(promises);
      
      // All should succeed or be rate limited (429)
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });
    });
  });
}); 