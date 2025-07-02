import { jest } from '@jest/globals';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the current module's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mock the server and models before importing them
const mockApp = {
  listen: jest.fn(),
  use: jest.fn(),
  get: jest.fn()
};

// Mock the server.js export
jest.mock('../../server.js', () => ({
  __esModule: true,
  default: mockApp
}));

// Mock the models
jest.mock('../../models/import-job.js', () => ({
  __esModule: true,
  default: class MockImportJob {
    static find = jest.fn();
    static findById = jest.fn();
    save = jest.fn().mockResolvedValue(this);
    toObject = () => ({});
  }
}));

// Mock the services
const mockImportUsers = jest.fn().mockResolvedValue({ success: true });
const mockPingOneService = jest.fn().mockImplementation(() => ({
  importUsers: mockImportUsers
}));

const mockBroadcast = jest.fn();
const mockWebSocketService = {
  broadcast: mockBroadcast
};

jest.mock('../../services/pingone.service.js', () => ({
  __esModule: true,
  default: mockPingOneService
}));

jest.mock('../../services/websocket.service.js', () => ({
  __esModule: true,
  default: mockWebSocketService
}));

// Import the actual implementations after setting up mocks
const { default: app } = await import('../../server.js');
const { connect, closeDatabase, clearDatabase } = await import('../utils/db.js');
const { default: ImportJob } = await import('../../models/import-job.js');

describe('Import API', () => {
  beforeAll(async () => {
    // Start in-memory MongoDB server
    await connect();
    
    // Mock PingOne service methods
    const { default: PingOneService } = await import('../../services/pingone.service.js');
    PingOneService.mockImplementation(() => ({
      importUsers: jest.fn().mockResolvedValue({ success: true })
    }));
  });

  afterAll(async () => {
    await closeDatabase();
    jest.clearAllMocks();
  });

  beforeEach(async () => {
    // Clear database before each test
    await clearDatabase();
    jest.clearAllMocks();
  });

  describe('POST /api/import', () => {
    it('should start a new import job', async () => {
      const testUsers = [
        { email: 'test1@example.com', firstName: 'Test', lastName: 'User1' },
        { email: 'test2@example.com', firstName: 'Test', lastName: 'User2' }
      ];

      const res = await request(app)
        .post('/api/import')
        .set('Authorization', 'Bearer test-token')
        .send({
          users: testUsers,
          importType: 'auto'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('jobId');
      expect(res.body.data).toHaveProperty('status', 'pending');
      
      // Verify job was saved to database
      const job = await ImportJob.findOne({ jobId: res.body.data.jobId });
      expect(job).not.toBeNull();
      expect(job.status).toBe('pending');
      expect(job.total).toBe(2);
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/import')
        .set('Authorization', 'Bearer test-token')
        .send({});

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/import/:jobId', () => {
    it('should return job status', async () => {
      const job = new ImportJob({
        jobId: uuidv4(),
        userId: 'test-user',
        status: 'completed',
        total: 10,
        processed: 10,
        success: 10,
        failed: 0,
        users: []
      });
      await job.save();

      const res = await request(app)
        .get(`/api/import/${job.jobId}`)
        .set('Authorization', 'Bearer test-token');

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveProperty('status', 'completed');
      expect(res.body.data).toHaveProperty('progress', 100);
    });

    it('should return 404 for non-existent job', async () => {
      const res = await request(app)
        .get(`/api/import/${uuidv4()}`)
        .set('Authorization', 'Bearer test-token');

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});
