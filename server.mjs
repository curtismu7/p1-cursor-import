import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import cors from 'cors';
import winston from 'winston';
import 'winston-daily-rotate-file';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import morgan from 'morgan';
import rfs from 'rotating-file-stream';
import { TokenManager } from './server/token-manager.js';
import { v4 as uuidv4 } from 'uuid';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file
dotenv.config();

// Log environment variables (without sensitive values)
console.log('Environment variables loaded:');
console.log('- PINGONE_ENVIRONMENT_ID:', process.env.PINGONE_ENVIRONMENT_ID ? '***' + process.env.PINGONE_ENVIRONMENT_ID.slice(-4) : 'Not set');
console.log('- PINGONE_REGION:', process.env.PINGONE_REGION || 'Not set');

// Ensure logs directory exists
const logDirectory = path.join(__dirname, 'logs');
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory, { recursive: true });
}

// Create a write stream for logging
const logStream = fs.createWriteStream(path.join(logDirectory, 'combined.log'), { flags: 'a' });

// Create a rotating access log stream
const accessLogStream = rfs.createStream('access.log', {
  interval: '1d', // rotate daily
  path: logDirectory,
  compress: 'gzip'
});

// Initialize Express app
const app = express();
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

// CORS configuration for all routes
const corsOptions = {
    origin: ['http://localhost:4000', 'http://127.0.0.1:4000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-PingOne-*', 'Accept'],
    credentials: true,
    optionsSuccessStatus: 200 // Some legacy browsers (IE11) choke on 204
};

// Apply CORS to all routes
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Import routes
import apiRouter from './routes/api/index.js';
import pingoneProxyRouter from './routes/pingone-proxy.js';
import indexRouter from './routes/index.js';
import settingsRouter from './routes/settings.js';
import logsRouter from './routes/logs.js';

// API Routes
app.use('/api', apiRouter);
app.use('/api/pingone', pingoneProxyRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/logs', logsRouter);

// Custom logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const requestId = uuidv4();
  
  // Log request
  const requestLog = {
    timestamp: new Date().toISOString(),
    requestId,
    method: req.method,
    url: req.originalUrl,
    headers: req.headers,
    query: req.query,
    body: req.body,
    ip: req.ip
  };

  // Write to log file
  logStream.write(`[${requestLog.timestamp}] [${requestId}] REQUEST ${requestLog.method} ${requestLog.url}\n`);
  logStream.write(`Headers: ${JSON.stringify(requestLog.headers, null, 2)}\n`);
  if (Object.keys(requestLog.query).length > 0) {
    logStream.write(`Query: ${JSON.stringify(requestLog.query, null, 2)}\n`);
  }
  if (requestLog.body && Object.keys(requestLog.body).length > 0) {
    logStream.write(`Body: ${JSON.stringify(requestLog.body, null, 2)}\n`);
  }
  logStream.write('\n');

  // Log response
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const responseLog = {
      timestamp: new Date().toISOString(),
      requestId,
      statusCode: res.statusCode,
      statusMessage: res.statusMessage,
      duration: `${Date.now() - start}ms`,
      headers: res.getHeaders(),
      body: chunk ? chunk.toString() : ''
    };

    // Write to log file
    logStream.write(`[${responseLog.timestamp}] [${requestId}] RESPONSE ${requestLog.method} ${requestLog.url} - ${responseLog.statusCode} (${responseLog.duration})\n`);
    if (responseLog.body) {
      try {
        const parsedBody = JSON.parse(responseLog.body);
        logStream.write(`Response: ${JSON.stringify(parsedBody, null, 2)}\n`);
      } catch (e) {
        logStream.write(`Response: ${responseLog.body}\n`);
      }
    }
    logStream.write('\n');
    logStream.write('='.repeat(80) + '\n\n');

    originalEnd.call(res, chunk, encoding);
  };

  next();
});

// Middleware to capture raw body for specific content types
app.use((req, res, next) => {
  if (req.headers['content-type'] === 'application/vnd.pingone.import.users+json') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      req.rawBody = Buffer.concat(chunks).toString('utf8');
      next();
    });
  } else {
    next();
  }
});

// Add body parsing middleware with increased limit for JSON and URL-encoded data
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Add request logging middleware
app.use(morgan('combined', { stream: accessLogStream }));



// Initialize Token Manager
const tokenManager = new TokenManager({
    clientId: process.env.PINGONE_CLIENT_ID,
    clientSecret: process.env.PINGONE_CLIENT_SECRET,
    environmentId: process.env.PINGONE_ENVIRONMENT_ID,
    region: process.env.PINGONE_REGION
});

// Make token manager available in routes
app.set('tokenManager', tokenManager);

// Configure Winston logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' })
    ]
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Import routes
import indexRouter from './routes/index.js';
import settingsRouter from './routes/settings.js';
import logsRouter from './routes/logs.js';
import pingoneProxyRouter from './routes/pingone-proxy.js';
import apiRouter from './routes/api/index.js';

// Import middleware
import { errorHandler } from './middleware/error-handler.js';

// API routes - these don't need CORS as they're same-origin
app.use('/api', indexRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/logs', logsRouter);
app.use('/api/pingone', pingoneProxyRouter);
app.use('/api', apiRouter);

// Import the new proxy router
import pingoneProxyNew from './routes/pingone-proxy-new.js';

// PingOne API proxy routes - these use the same CORS settings
app.use('/api/proxy', pingoneProxyNew);

// Keep the old route for backward compatibility
app.use('/api/pingone', pingoneProxyNew);

// Serve static files from the public directory (after API routes)
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res) => {
        // Don't cache API responses
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        res.set('Surrogate-Control', 'no-store');
    }
}));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Store the server instance
let server;

// Graceful shutdown function
const shutdown = async () => {
    console.log('\n🛑 Shutting down server...');
    
    if (server) {
        await new Promise((resolve) => {
            server.close(resolve);
            // Force close server after 5 seconds
            setTimeout(resolve, 5000);
        });
    }
    
    console.log('Server has been stopped');
    process.exit(0);
};

// Handle process termination signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️  Unhandled Rejection at:', promise, 'reason:', reason);
    // Log the error but don't crash
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('⚠️  Uncaught Exception:', error);
    // Don't crash on uncaught exceptions
});

// Start the server with async initialization
const startServer = async () => {
  // Ensure logs directory exists
  if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory, { recursive: true });
  }
  console.log('🚀 Starting server initialization...');
  
  return new Promise((resolve, reject) => {
    server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Server is running on http://localhost:${PORT}`);
      console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('🛑 Press Ctrl+C to stop the server');
      resolve(server);
    }).on('error', error => {
      console.error('❌ Failed to start server:', error);
      reject(error);
    });
  });
};

// Only start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch(error => {
    console.error('❌ Fatal error during server startup:', error);
    process.exit(1);
  });
}

// Export the Express app for testing or programmatic use
export { app, startServer, shutdown };
