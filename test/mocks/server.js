import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server } from 'socket.io';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: 'test-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// API Routes
app.use('/api', (req, res, next) => {
  // Mock API routes for testing
  if (req.path === '/import' && req.method === 'POST') {
    return res.status(200).json({
      success: true,
      data: {
        jobId: 'test-job-id',
        status: 'pending'
      }
    });
  }
  
  if (req.path.startsWith('/import/') && req.method === 'GET') {
    const jobId = req.params[0];
    return res.status(200).json({
      success: true,
      data: {
        jobId,
        status: 'completed',
        progress: 100,
        total: 10,
        processed: 10,
        success: 10,
        failed: 0
      }
    });
  }
  
  next();
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: {
      message: 'Internal Server Error',
      code: 'INTERNAL_SERVER_ERROR',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    }
  });
});

// Create HTTP server
const PORT = parseInt(process.env.PORT) || 3001;

// Validate port range
if (PORT < 0 || PORT > 65535) {
    console.error(`Invalid port number: ${PORT}. Port must be between 0 and 65535.`);
    process.exit(1);
}

// Debug: Log the port value and type
console.log(`🔍 PORT debugging:`, {
    rawEnvPort: process.env.PORT,
    parsedPort: PORT,
    portType: typeof PORT,
    portValid: PORT >= 0 && PORT <= 65535
});
const server = httpServer.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
});

// Set up WebSocket server
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// WebSocket connection
io.on('connection', (socket) => {
  console.log('Client connected');
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Handle shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

export { app, server, io };
