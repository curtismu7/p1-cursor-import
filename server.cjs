const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const cors = require('cors');
const winston = require('winston');
require('winston-daily-rotate-file');
const dotenv = require('dotenv');
const fetch = require('node-fetch');
const morgan = require('morgan');
const { TokenManager } = require('./server/token-manager');
const { v4: uuidv4 } = require('uuid');

// Load environment variables from .env file
dotenv.config();

// Log environment variables (without sensitive values)
console.log('Environment variables loaded:');
console.log('- PINGONE_ENVIRONMENT_ID:', process.env.PINGONE_ENVIRONMENT_ID ? '***' + process.env.PINGONE_ENVIRONMENT_ID.slice(-4) : 'Not set');
console.log('- PINGONE_REGION:', process.env.PINGONE_REGION || 'Not set');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

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
app.use(morgan('dev'));

// Enable CORS
app.use(cors());

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
const indexRouter = require('./routes/index.cjs');
const settingsRouter = require('./routes/settings.cjs');
const logsRouter = require('./routes/logs.cjs');
const pingoneProxyRouter = require('./routes/pingone-proxy.cjs');

// Add routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Use routes
app.use('/api', indexRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/logs', logsRouter);
app.use('/api/pingone', pingoneProxyRouter);

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
if (require.main === module) {
    startServer().catch(error => {
        console.error('❌ Fatal error during server startup:', error);
        process.exit(1);
    });
}

module.exports = { app, startServer };
