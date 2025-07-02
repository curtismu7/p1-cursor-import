import { MongoClient } from 'mongodb';

describe('MongoDB Connection', () => {
  let connection;
  let db;

  beforeAll(async () => {
    connection = await MongoClient.connect('mongodb://localhost:27017/pingone-import-test', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    db = connection.db();
  });

  afterAll(async () => {
    if (connection) await connection.close();
  });

  test('should connect to MongoDB', async () => {
    const result = await db.command({ ping: 1 });
    expect(result.ok).toBe(1);
  });

  test('should have test environment', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});
