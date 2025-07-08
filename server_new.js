const express = require('express');
const path = require('path');
const { fileURLToPath } = require('url');
const { promises: fs } = require('fs');
const cors = require('cors');
const winston = require('winston');
require('winston-daily-rotate-file');
const dotenv = require('dotenv');
const fetch = require('node-fetch');
const morgan = require('morgan');
const { TokenManager } = require('./token-manager');

// Load environment variables from .env file
dotenv.config();

// Log environment variables (without sensitive values)
console.log('Environment variables loaded:');
console.log('- PINGONE_ENVIRONMENT_ID:', process.env.PINGONE_ENVIRONMENT_ID ? '***' + process.env.PINGONE_ENVIRONMENT_ID.slice(-4) : 'Not set');
console.log('- PINGONE_REGION:', process.env.PINGONE_REGION || 'Not set');

// __filename and __dirname are already available in CommonJS

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

// Add body parsing middleware with increased limit for JSON and URL-encoded data
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Add request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} [${requestId}]`);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    
    // Log request body for non-GET requests
    if (req.method !== 'GET') {
        console.log('Body:', JSON.stringify(req.body, null, 2));
    }
    
    // Log response
    const originalJson = res.json;
    res.json = function(body) {
        console.log(`[${new Date().toISOString()}] Response (${res.statusCode}) [${requestId}]:`, 
            JSON.stringify(body, null, 2).substring(0, 1000) + (JSON.stringify(body).length > 1000 ? '...' : ''));
        console.log(`[${new Date().toISOString()}] Request completed in ${Date.now() - start}ms [${requestId}]`);
        return originalJson.call(this, body);
    };
    
    next();
});

// Initialize Token Manager
const tokenManager = new TokenManager(console);
app.set('tokenManager', tokenManager);

// Configure CORS
const allowedOrigins = ['http://localhost', 'http://localhost:4000'];
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Content-Encoding'],
    exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
    maxAge: 86400 // 24 hours
}));

// Parse JSON bodies
app.use(express.json());

// Enhanced request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    
    // Log the incoming request
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    if (Object.keys(req.body).length > 0) {
        console.log('Request body:', JSON.stringify(req.body, null, 2));
    }
    console.log('Request headers:', JSON.stringify(req.headers, null, 2));
    
    // Override res.json to log the response
    const originalJson = res.json;
    res.json = function(body) {
        console.log(`[${new Date().toISOString()}] Response (${res.statusCode}):`, JSON.stringify(body, null, 2));
        console.log(`[${new Date().toISOString()}] Request completed in ${Date.now() - start}ms`);
        return originalJson.call(this, body);
    };
    
    next();
});

// Helper function to create a log header
const createLogHeader = (type) => {
    const header = `\n${'*'.repeat(80)}`;
    const title = `  ${type.toUpperCase()} LOGGING STARTED  `;
    const titleLine = '*'.repeat(Math.floor((80 - title.length) / 2)) + 
                     title + 
                     '*'.repeat(Math.ceil((80 - title.length) / 2));
    return `${header}\n${titleLine}\n${header}\n\n`;
};

// Configure Winston logger with better formatting and file handling
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss.SSS'
        }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json({
            space: 2,
            replacer: (key, value) => {
                // Handle circular references
                if (value instanceof Error) {
                    const error = {};
                    Object.getOwnPropertyNames(value).forEach((key) => {
                        error[key] = value[key];
                    });
                    return error;
                }
                return value;
            }
        })
    ),
    defaultMeta: { 
        service: 'pingone-import',
        env: process.env.NODE_ENV || 'development',
        pid: process.pid
    },
    transports: [
        // Console transport for all levels in development
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(({ timestamp, level, message, ...meta }) => {
                    const metaString = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
                    return `[${timestamp}] ${level}: ${message}${metaString}`;
                })
            ),
            handleExceptions: true,
            handleRejections: true,
            level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
        })
    ],
    exitOnError: false
});

// Add file transports only if not in test environment
if (process.env.NODE_ENV !== 'test') {
    // Error logs (errors only)
    logger.add(new winston.transports.File({ 
        filename: path.join(__dirname, 'logs/error.log'),
        level: 'error',
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
        tailable: true,
        zippedArchive: true,
        handleExceptions: true,
        handleRejections: true,
        format: winston.format.combine(
            winston.format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss.SSS'
            }),
            winston.format.json()
        )
    }));
    
    // Combined logs (all levels)
    logger.add(new winston.transports.File({
        filename: path.join(__dirname, 'logs/combined.log'),
        level: 'info',
        maxsize: 20 * 1024 * 1024, // 20MB
        maxFiles: 5,
        tailable: true,
        zippedArchive: true
    }));
    
    // Client logs (from browser)
    const clientLogger = winston.createLogger({
        level: 'info',
        format: winston.format.combine(
            winston.format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss.SSS'
            }),
            winston.format.json()
        ),
        defaultMeta: { 
            service: 'pingone-import-client',
            env: process.env.NODE_ENV || 'development'
        },
        transports: [
            new winston.transports.File({
                filename: path.join(__dirname, 'logs/client.log'),
                maxsize: 10 * 1024 * 1024, // 10MB
                maxFiles: 5,
                tailable: true,
                zippedArchive: true
            })
        ]
    });
    
    // Add client logger to the main logger
    logger.client = clientLogger;
    
    // Combined logs (all levels)
    logger.add(new winston.transports.File({
        filename: path.join(__dirname, 'logs/combined.log'),
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        tailable: true
    }));
    
    // Client-side logs
    logger.add(new winston.transports.File({
        filename: path.join(__dirname, 'logs/client.log'),
        level: 'info',
        maxsize: 10485760, // 10MB
        maxFiles: 5,
        tailable: true,
        format: winston.format.combine(
            winston.format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss'
            }),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
                const logEntry = `${timestamp} [${level.toUpperCase()}] ${message} ${
                    Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
                }`;
                return `\n${'-'.repeat(80)}\n${logEntry}`;
            })
        )
    }));
}

// Log to console in development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

// Middleware
app.use(cors());

// Log all incoming requests
app.use((req, res, next) => {
app.use(morgan('dev'));

// Standard body parsers
app.use(express.urlencoded({ extended: true }));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Log storage
const logStore = [];
const MAX_LOG_ENTRIES = 1000;

// Ensure logs directory exists with proper permissions
const ensureLogsDir = async () => {
    const logsDir = path.join(__dirname, 'logs');
    
    try {
        // Check if directory exists
        try {
            await fs.access(logsDir, fs.constants.F_OK | fs.constants.W_OK);
            logger.debug('Logs directory exists and is writable', { path: logsDir });
            return true;
        } catch (err) {
            if (err.code === 'ENOENT') {
                // Directory doesn't exist, create it
                logger.info('Creating logs directory', { path: logsDir });
                await fs.mkdir(logsDir, { 
                    recursive: true,
                    mode: 0o777 // rwxrwxrwx - Full permissions (will be modified by umask)
                });
                
                // Verify directory was created with correct permissions
                const stats = await fs.stat(logsDir);
                logger.info('Created logs directory', {
                    path: logsDir,
                    mode: stats.mode.toString(8),
                    uid: stats.uid,
                    gid: stats.gid
                });
                
                return true;
            } else if (err.code === 'EACCES') {
                // Permission denied
                const error = new Error(`Permission denied accessing logs directory: ${logsDir}`);
                error.code = 'EACCES';
                error.path = logsDir;
                error.user = process.env.USER || process.env.USERNAME || 'unknown';
                logger.error('Permission error accessing logs directory', {
                    error: error.message,
                    path: logsDir,
                    user: error.user,
                    cwd: process.cwd(),
                    umask: process.umask().toString(8)
                });
                throw error;
            } else {
                // Other error
                logger.error('Error accessing logs directory', {
                    error: err.message,
                    code: err.code,
                    path: logsDir
                });
                throw err;
            }
        }
    } catch (error) {
        logger.error('Failed to ensure logs directory exists', {
            error: error.message,
            stack: error.stack,
            code: error.code,
            path: logsDir,
            cwd: process.cwd()
        });
        // Don't throw here, let the server start anyway
        return false;
    }
};

// Initialize logs directory and write headers
const initializeLogging = async () => {
    try {
        const logsDirReady = await ensureLogsDir();
        if (!logsDirReady) {
            logger.warn('Logs directory initialization had issues, continuing with reduced logging capabilities');
        }
        
        const logFiles = [
            { path: 'logs/error.log', type: 'ERROR' },
            { path: 'logs/combined.log', type: 'COMBINED' },
            { path: 'logs/client.log', type: 'CLIENT' }
        ];
        
        // Process log files in parallel
        await Promise.all(logFiles.map(async (file) => {
            try {
                const fullPath = path.join(__dirname, file.path);
                const header = createLogHeader(file.type);
                
                // Check if file exists and is writable
                try {
                    await fs.access(fullPath, fs.constants.F_OK | fs.constants.W_OK);
                    logger.debug(`Log file exists: ${file.path}`);
                } catch (accessError) {
                    if (accessError.code === 'ENOENT') {
                        // File doesn't exist, create it
                        logger.info(`Creating log file: ${file.path}`);
                        await fs.writeFile(fullPath, header, { flag: 'wx' });
                        logger.info(`Created log file: ${file.path}`);
                    } else {
                        throw accessError;
                    }
                }
                
                // Verify file is writable
                try {
                    const stats = await fs.stat(fullPath);
                    logger.debug(`Log file stats: ${file.path}`, {
                        size: stats.size,
                        mode: stats.mode.toString(8),
                        mtime: stats.mtime
                    });
                } catch (statError) {
                    logger.warn(`Could not get stats for ${file.path}:`, statError);
                }
                
            } catch (error) {
                logger.error(`Failed to initialize log file ${file.path}`, {
                    error: error.message,
                    code: error.code,
                    path: file.path,
                    stack: error.stack
                });
                // Don't throw, continue with other files
            }
        }));
        
        logger.info('Logging system initialized successfully');
        return true;
        
    } catch (error) {
        logger.error('Failed to initialize logging system', {
            error: error.message,
            code: error.code,
            stack: error.stack
        });
        // Don't throw, allow server to start with reduced functionality
        return false;
    }
};

// Initialize logging before starting the server
let isLoggingInitialized = false;

const initializeLoggingSystem = async () => {
    try {
        const success = await initializeLogging();
        isLoggingInitialized = success;
        
        if (success) {
            logger.info('Logging initialization completed successfully');
        } else {
            logger.warn('Logging initialization completed with warnings');
        }
        return success;
    } catch (error) {
        logger.error('Unexpected error during logging initialization', {
            error: error.message,
            stack: error.stack
        });
        isLoggingInitialized = false;
        return false;
    }
};

// API routes
// GET logs endpoint for the frontend
app.get('/api/logs', async (req, res) => {
    try {
        // Read the log file
        const logFilePath = path.join(logsDir, 'combined.log');
        const logContent = await fs.readFile(logFilePath, 'utf-8');
        
        // Parse the log lines into structured objects
        const logLines = logContent.split('\n').filter(line => line.trim() !== '');
        const logs = [];
        
        logLines.forEach(line => {
            try {
                // Parse each log line as JSON
                const logEntry = JSON.parse(line);
                logs.push({
                    level: logEntry.level,
                    message: logEntry.message,
                    data: logEntry.data || {},
                    timestamp: logEntry.timestamp || new Date().toISOString(),
                    source: logEntry.source || 'server'
                });
            } catch (parseError) {
                // If the line isn't valid JSON, include it as a raw log
                logs.push({
                    level: 'info',
                    message: line,
                    data: {},
                    timestamp: new Date().toISOString(),
                    source: 'server',
                    raw: true
                });
            }
        });
        
        // Return the logs in reverse chronological order (newest first)
        res.json(logs.reverse());
    } catch (error) {
        console.error('Error reading logs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to read logs',
            details: error.message
        });
    }
});

// POST logs endpoint for client-side logging
app.post('/api/logs', async (req, res) => {
    const startTime = Date.now();
    const requestId = `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create a response object to ensure we always send a response
    const sendResponse = (status, data) => {
        if (!res.headersSent) {
            return res.status(status).json({
                ...data,
                requestId,
                timestamp: new Date().toISOString(),
                processingTime: Date.now() - startTime
            });
        }
    };
    
    const logContext = {
        requestId,
        method: req.method,
        url: req.url,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent'),
        timestamp: new Date().toISOString()
    };
    
    try {
        // Log the incoming request
        logger.debug('Received log request', {
            ...logContext,
            headers: req.headers,
            body: req.body
        });
        
        // Check if logging system is initialized
        if (!isLoggingInitialized) {
            logger.warn('Logging system not initialized', logContext);
            return sendResponse(503, {
                success: false,
                error: 'Logging system not initialized',
                code: 'SERVICE_UNAVAILABLE'
            });
        }
        
        const { level = 'info', message = '', data = {} } = req.body;
        
        if (!message) {
            const error = new Error('Message is required');
            error.code = 'MISSING_MESSAGE';
            throw error;
        }
        
        // Validate log level
        const validLevels = ['error', 'warn', 'info', 'verbose', 'debug', 'silly'];
        if (!validLevels.includes(level)) {
            const error = new Error(`Invalid log level: ${level}`);
            error.code = 'INVALID_LEVEL';
            error.allowedLevels = validLevels;
            throw error;
        }
        
        const timestamp = new Date().toISOString();
        const logEntry = {
            ...logContext,
            level,
            message,
            data,
            source: 'client',
            timestamp,
            processingTime: 0
        };
        
        // Add to in-memory store (for UI)
        logStore.push(logEntry);
        
        // Limit the number of stored logs
        if (logStore.length > MAX_LOG_ENTRIES) {
            logStore.shift();
        }
        
        // Log to client logger with timeout
        try {
            // Add log to in-memory store first
            logStore.push(logEntry);
            
            // Limit the number of stored logs
            if (logStore.length > MAX_LOG_ENTRIES) {
                logStore.shift();
            }
            
            // Prepare log data
            const logData = {
                ...logContext,
                message,
                ...(data && typeof data === 'object' ? data : { data })
            };
            
            // Use the client logger if available, otherwise fall back to main logger
            const targetLogger = logger.client || logger;
            
            // Log asynchronously but don't wait for completion
            targetLogger.log(level, logData, (error) => {
                if (error) {
                    console.error('Error in async logger callback:', error);
                    // Don't fail the request for logging errors
                }
            });
            
            // Calculate processing time
            const processingTime = Date.now() - startTime;
            logEntry.processingTime = processingTime;
            
            // Log success (synchronously)
            logger.debug('Log entry processed successfully', {
                ...logContext,
                level,
                messageLength: message.length,
                dataSize: JSON.stringify(data).length,
                processingTime
            });
            
            // Send success response
            return sendResponse(200, { 
                success: true,
                timestamp: new Date().toISOString()
            });
            
        } catch (logError) {
            console.error('Error in logging process:', logError);
            
            // Log the error (synchronously)
            logger.error('Error writing log entry', {
                ...logContext,
                error: logError.message,
                stack: logError.stack,
                code: logError.code
            });
            
            // Still send a success response since we've stored the log in memory
            return sendResponse(202, {
                success: true,
                warning: 'Log stored in memory but there was an issue with persistent logging',
                code: 'LOG_WRITE_WARNING'
            });
        }
        
    } catch (error) {
        const processingTime = Date.now() - startTime;
        const errorResponse = {
            success: false,
            requestId,
            error: error.message,
            code: error.code || 'LOG_PROCESSING_ERROR',
            timestamp: new Date().toISOString(),
            processingTime
        };
        
        // Add additional error details if available
        if (error.allowedLevels) {
            errorResponse.allowedLevels = error.allowedLevels;
        }
        
        logger.error('Error processing log request', {
            ...logContext,
            error: error.message,
            stack: error.stack,
            code: error.code,
            processingTime,
            response: errorResponse
        });
        
        res.status(error.code === 'INVALID_LEVEL' ? 400 : 500)
           .json(errorResponse);
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    try {
        const status = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            server: serverState.getStatus(),
            system: {
                node: process.version,
                platform: process.platform,
                memory: process.memoryUsage(),
                cpu: process.cpuUsage ? process.cpuUsage() : { user: 0, system: 0 },
                env: process.env.NODE_ENV || 'development'
            },
            // Add any additional health checks here
            checks: {
                database: 'ok', // Add actual database health check
                storage: 'ok',  // Add storage health check
                memory: process.memoryUsage().heapUsed / process.memoryUsage().heapTotal < 0.9 ? 'ok' : 'warn'
            }
        };
        
        // If any critical check fails, return 503
        const isHealthy = Object.values(status.checks).every(check => check === 'ok');
        
        if (!isHealthy) {
            logger.warn('Health check failed', { status });
            return res.status(503).json({
                ...status,
                status: 'degraded',
                message: 'One or more services are not healthy'
            });
        }
        
        res.json(status);
    } catch (error) {
        logger.error('Health check failed:', error);
        res.status(500).json({
            status: 'error',
            error: 'Internal server error during health check',
            message: error.message
        });
    }
});

// Get logs
app.get('/api/logs', (req, res) => {
    try {
        res.json(logStore);
    } catch (error) {
        logger.error('Error retrieving logs:', error);
        res.status(500).json({ error: 'Failed to retrieve logs' });
    }
});

// API Routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// PingOne API proxy endpoints
app.get('/api/pingone/*', async (req, res) => {
    try {
        const url = `https://api.pingone.com${req.url.replace('/api/pingone', '')}`;
        
        // Get the access token from the token manager
        const tokenManager = req.app.get('tokenManager');
        const token = await tokenManager.getAccessToken();
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`API request failed with status ${response.status}: ${errorData}`);
        }
        
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            res.json(data);
        } else {
            const text = await response.text();
            res.send(text);
        }
    } catch (error) {
        console.error('Error in PingOne API proxy:', error);
        res.status(500).json({ error: error.message });
    }
});

// Custom JSON parser middleware for specific content types
const customJsonParser = (req, res, next) => {
    // Only process if it's our special content type
    if (req.headers['content-type'] && 
        req.headers['content-type'].includes('application/vnd.pingone.import.users+json')) {
        
        console.log('Processing PingOne import request with custom parser');
        
        // Simple buffer to collect request data
        let body = [];
        
        // Handle data events
        req.on('data', chunk => {
            body.push(chunk);
        });
        
        // Handle request end
        req.on('end', () => {
            try {
                // Parse the body as JSON
                const rawBody = Buffer.concat(body).toString('utf8');
                req.body = JSON.parse(rawBody);
                console.log('Successfully parsed import request body');
                next();
            } catch (e) {
                console.error('Error parsing import request:', e);
                if (!res.headersSent) {
                    res.status(400).json({
                        error: 'Invalid JSON',
                        message: e.message
                    });
                }
            }
        });
        
        // Handle request errors
        req.on('error', (error) => {
            console.error('Request error:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    error: 'Request Error',
                    message: error.message
                });
            }
        });
    } else {
        // Use standard JSON parser for other content types
        express.json()(req, res, next);
    }
};

// Add the custom JSON parser middleware
// This will handle application/vnd.pingone.import.users+json content type
app.use(customJsonParser);

// For all other JSON content types, use the standard JSON parser
app.use(express.json());

app.post('/api/pingone/*', async (req, res) => {
    try {
        const url = `https://api.pingone.com${req.url.replace('/api/pingone', '')}`;
        
        // Get the access token from the token manager
        const tokenManager = req.app.get('tokenManager');
        const token = await tokenManager.getAccessToken();
        
        // Check if this is a user import request
        const isUserImport = url.includes('/users/import');
        
        // Set content type and accept headers based on the request type
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': isUserImport ? 'application/vnd.pingone.import.users+json' : 'application/json'
        };
        
        // For user imports, we need to add the specific content type header
        if (isUserImport) {
            headers['Content-Type'] = 'application/vnd.pingone.import.users+json';
        }
        
        // Log the request details for debugging
        console.log('\n=== Request Details ===');
        console.log('URL:', url);
        console.log('Method: POST');
        console.log('Headers:', JSON.stringify({
            ...headers,
            'Authorization': `Bearer ${token ? '***' + token.slice(-8) : 'missing'}`
        }, null, 2));
        console.log('Is User Import:', isUserImport);
        
        // For user imports, ensure the request body is in the correct format
        let requestBody = req.body;
        
        if (isUserImport) {
            console.log('Original request body:', JSON.stringify(req.body, null, 2));
            
            // If the body already has a users array, use it as is
            if (req.body && req.body.users) {
                requestBody = req.body;
                console.log('Using existing users array with', requestBody.users.length, 'users');
            } 
            // If the body is an array, wrap it in a users object
            else if (Array.isArray(req.body)) {
                console.log('Wrapping array in users object');
                requestBody = { users: req.body };
            }
            // If it's a single user object, wrap it in a users array
            else if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
                console.log('Wrapping single user object in users array');
                requestBody = { users: [req.body] };
            } else {
                console.log('Empty or invalid request body, using as-is');
            }
            
            console.log('Formatted request body:', JSON.stringify(requestBody, null, 2));
            
            // Validate the request body structure
            if (!requestBody.users || !Array.isArray(requestBody.users) || requestBody.users.length === 0) {
                const error = new Error('Invalid request body: expected an object with a non-empty "users" array');
                console.error('Validation error:', error.message);
                return res.status(400).json({
                    error: 'Invalid Request',
                    message: error.message,
                    details: {
                        expected: { users: '[array of user objects]' },
                        received: requestBody
                    }
                });
            }
        }

        // Prepare the request options for PingOne API
        const requestOptions = {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
        };
        
        console.log('Request options:', {
            method: 'POST',
            url,
            headers: {
                ...headers,
                'Authorization': `Bearer ${token ? '***' + token.slice(-8) : 'missing'}`
            },
            body: requestBody ? '*** request body ***' : 'empty',
            bodyLength: requestBody ? JSON.stringify(requestBody).length : 0
        });

        console.log('Sending request to PingOne API:', {
            url,
            method: 'POST',
            headers: {
                ...requestOptions.headers,
                'Authorization': 'Bearer ***' + (token ? token.slice(-8) : 'missing')
            },
            bodyLength: requestOptions.body ? requestOptions.body.length : 0
        });

        // Log the first 500 characters of the request body for debugging
        if (requestOptions.body) {
            console.log('Request body preview:', 
                requestOptions.body.substring(0, 500) + 
                (requestOptions.body.length > 500 ? '...' : '')
            );
        }

        // Make the request to PingOne API
        let response;
        try {
            response = await fetch(url, requestOptions);

            // Log response status and headers
            console.log('PingOne API response status:', response.status, response.statusText);
            console.log('Response headers:', Object.fromEntries([...response.headers.entries()]));

            // Get the response text first (we'll parse it as JSON if possible)
            const responseText = await response.text();

            // Try to parse as JSON, fall back to text if not JSON
            let responseData;
            try {
                responseData = responseText ? JSON.parse(responseText) : {};
            } catch (e) {
                console.log('Response is not JSON, using raw text');
                responseData = responseText;
            }
            
            // Log response data (truncated if too large)
            const responseLog = JSON.stringify(responseData);
            console.log('Response data:', 
                responseLog.length > 1000 
                    ? responseLog.substring(0, 1000) + '... [truncated]' 
                    : responseLog
            );
            
            // Forward the response with the appropriate status code
            if (response.ok) {
                res.status(response.status).json(responseData);
            } else {
                // For error responses, include more details
                const errorDetails = {
                    status: response.status,
                    statusText: response.statusText,
                    error: responseData.error || 'Unknown error',
                    message: responseData.message || 'An error occurred',
                    details: responseData.details || responseData
                };
                
                console.error('PingOne API error:', JSON.stringify(errorDetails, null, 2));
                res.status(response.status).json(errorDetails);
            }
        } catch (error) {
            console.error('Error processing PingOne API response:', error);
            res.status(500).json({ 
                error: 'Request Failed',
                message: error.message,
                code: error.code,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    } catch (error) {
        console.error('Error in PingOne API proxy (POST):', error);
        res.status(500).json({ 
            error: 'Request Failed',
            message: error.message,
            code: error.code,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Settings endpoints
const SETTINGS_FILE = path.join(__dirname, 'data', 'settings.json');

// Load settings
app.get('/api/settings', async (req, res) => {
    try {
        const data = await fs.readFile(SETTINGS_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        if (error.code === 'ENOENT') {
            // File doesn't exist yet, return default settings
            res.json({});
        } else {
            logger.error(`Error reading settings: ${error.message}`);
            res.status(500).json({ error: 'Failed to load settings' });
        }
    }
});

// Save settings
app.post('/api/settings', async (req, res) => {
    try {
        const settings = req.body;
        await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
        await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
        res.json({ success: true });
    } catch (error) {
        logger.error(`Error saving settings: ${error.message}`);
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

// Serve the main application for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    // Log the error
    logger.error('Unhandled error:', {
        error: err.message,
        stack: err.stack,
        code: err.code,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        body: req.body
    });
    
    // Determine status code
    const statusCode = err.statusCode || err.status || 500;
    
    // Prepare error response
    const errorResponse = {
        success: false,
        error: err.message || 'Internal Server Error',
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
        ...(err.code && { code: err.code }),
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method
    };
    
    // Send error response
    res.status(statusCode).json(errorResponse);
});

// 404 handler
app.use((req, res) => {
    const error = new Error(`Not Found - ${req.method} ${req.originalUrl}`);
    error.status = 404;
    
    logger.warn('404 Not Found', {
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('user-agent')
    });
    
    res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Cannot ${req.method} ${req.originalUrl}`,
        status: 404,
        timestamp: new Date().toISOString()
    });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', { 
        promise, 
        reason: reason instanceof Error ? reason.message : reason,
        stack: reason instanceof Error ? reason.stack : undefined
    });
    
    // For development, log the full error
    if (process.env.NODE_ENV !== 'production') {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', {
        error: error.message,
        stack: error.stack,
        name: error.name
    });
    
    // For development, log the full error
    if (process.env.NODE_ENV !== 'production') {
        console.error('Uncaught Exception:', error);
    }
    
    // In production, we might want to gracefully shut down
    if (process.env.NODE_ENV === 'production') {
        logger.on('finish', () => process.exit(1));
    }
});

// Handle process termination
const shutdown = (signal) => {
    console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
    
    // Update server state
    serverState.isShuttingDown = true;
    
    // Close the server
    if (server) {
        logger.info('Closing HTTP server...');
        
        server.close((err) => {
            if (err) {
                console.error('❌ Error closing server:', err);
                logger.error('Error closing server:', {
                    error: err.message,
                    stack: err.stack,
                    code: err.code
                });
                process.exit(1);
            }
            
            logger.info('✅ Server closed successfully');
            console.log('✅ Server closed successfully');
            
            // Perform any additional cleanup here if needed
            // e.g., close database connections, release resources, etc.
            
            // Exit with success
            process.exit(0);
        });
        
        // Force shutdown after timeout
        const forceShutdownTimer = setTimeout(() => {
            console.error('❌ Could not close connections in time, forcefully shutting down');
            logger.error('Could not close connections in time, forcefully shutting down');
            process.exit(1);
        }, 10000);
        
        // Don't keep the process open just for this timer
        forceShutdownTimer.unref();
    } else {
        // No server to close, just exit
        process.exit(0);
    }
};

// Handle termination signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle process exit
process.on('exit', (code) => {
    const message = `Process exiting with code ${code}`;
    if (code === 0) {
        logger.info(message);
    } else {
        logger.warn(message);
    }
});

// Initialize server state
const serverState = {
    isInitialized: false,
    isInitializing: false,
    isShuttingDown: false,
    pingOneInitialized: false,
    lastError: null,
    startTime: new Date().toISOString(),
    uptime: () => process.uptime(),
    getStatus: function() {
        return {
            status: this.isShuttingDown ? 'shutting_down' : 
                   this.isInitialized ? 'running' : 
                   this.isInitializing ? 'initializing' : 'stopped',
            pingOneInitialized: this.pingOneInitialized,
            uptime: this.uptime(),
            startTime: this.startTime,
            lastError: this.lastError ? {
                message: this.lastError.message,
                code: this.lastError.code,
                time: new Date().toISOString()
            } : null
        };
    }
};

// Start the server with async initialization
const startServer = async () => {
    console.log('🚀 Starting server initialization...');
    
    if (serverState.isInitializing) {
        throw new Error('Server initialization already in progress');
    }
    
    if (serverState.isInitialized) {
        throw new Error('Server is already initialized');
    }
    
    serverState.isInitializing = true;
    serverState.lastError = null;
    
    // Initialize logging system first
    console.log('🔧 Initializing logging system...');
    try {
        await initializeLoggingSystem();
        console.log('✅ Logging system initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize logging system:', error);
        serverState.lastError = error;
        serverState.isInitializing = false;
        throw error;
    }
    
    // Initialize token manager with timeout
    console.log('🔑 Initializing PingOne connection...');
    const pingOneInit = tokenManager.getAccessToken()
        .then(token => {
            console.log('✅ Successfully connected to PingOne API');
            serverState.pingOneInitialized = true;
            logger.info('Successfully connected to PingOne API');
        })
        .catch(error => {
            const warningMsg = 'Failed to initialize PingOne token manager. Some features may not work.';
            console.warn(`⚠️  ${warningMsg}`);
            console.warn('Please check your PINGONE_CLIENT_ID, PINGONE_CLIENT_SECRET, and PINGONE_ENVIRONMENT_ID environment variables');
            
            logger.warn(warningMsg, {
                error: error.message,
                stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
                code: error.code
            });
            
            // Don't fail the server startup for PingOne connection issues
            serverState.pingOneInitialized = false;
        });
    
    // Return a promise that resolves when the server is listening
    return new Promise((resolve, reject) => {
        console.log(`🌐 Attempting to start server on port ${PORT}...`);
        
        // Track server startup time and state
        const startTime = Date.now();
        let server;
        let serverStartupTimeout;
        
        // Set a timeout for the entire server startup process
        serverStartupTimeout = setTimeout(() => {
            const error = new Error(`Server startup timed out after ${(Date.now() - startTime) / 1000} seconds`);
            error.code = 'SERVER_STARTUP_TIMEOUT';
            
            // Clean up any server instance that might have been created
            if (server) {
                server.close();
            }
            
            // Update server state
            serverState.isInitializing = false;
            serverState.lastError = error;
            
            reject(error);
        }, 30000);
        
        // Cleanup function
        const cleanup = () => {
            clearTimeout(serverStartupTimeout);
            process.off('unhandledRejection', cleanup);
            process.off('rejectionHandled', cleanup);
        };
        
        // Register cleanup handlers
        process.once('unhandledRejection', cleanup);
        process.once('rejectionHandled', cleanup);
        
        // Set a timeout for the HTTP server to start listening
        const httpStartTimeout = setTimeout(() => {
            const error = new Error(`HTTP server failed to start listening after ${(Date.now() - startTime) / 1000} seconds`);
            error.code = 'HTTP_STARTUP_TIMEOUT';
            
            // Log the error
            console.error(`❌ ${error.message}`);
            
            // Clean up any server instance that might have been created
            if (server) {
                server.close(() => {
                    serverState.isInitializing = false;
                    serverState.lastError = error;
                    reject(error);
                });
            } else {
                serverState.isInitializing = false;
                serverState.lastError = error;
                reject(error);
            }
            
            // Ensure cleanup
            cleanup();
        }, 30000); // 30 second timeout for HTTP server to start
        
        // Start the HTTP server
        try {
            server = app.listen(PORT, '127.0.0.1', async () => {
                // Clear the HTTP server startup timeout
                clearTimeout(httpStartTimeout);
                
                // Update server state
                serverState.isInitializing = false;
                serverState.isInitialized = true;
                
                const serverAddress = server.address();
                if (!serverAddress) {
                    const error = new Error('Server address is null - server may not have started properly');
                    console.error(`❌ Server error: ${error.message}`);
                    reject(error);
                    return;
                }
                const { address, port } = serverAddress;
                const host = address === '::' ? '127.0.0.1' : address; // Always use 127.0.0.1 for consistency
                const url = `http://${host}:${port}`;
                
                // Wait for PingOne initialization to complete (with timeout)
                try {
                    await Promise.race([
                        pingOneInit,
                        new Promise((_, rej) => setTimeout(() => rej(new Error('PingOne initialization timeout')), 5000))
                    ]);
                    console.log('✅ PingOne API connection verified');
                } catch (pingOneError) {
                    console.warn('⚠️  PingOne initialization warning:', pingOneError.message);
                    // Continue server startup even if PingOne fails
                }
                
                // Prepare server info
                const serverInfo = {
                    port,
                    pid: process.pid,
                    node: process.version,
                    platform: process.platform,
                    env: process.env.NODE_ENV || 'development',
                    memory: process.memoryUsage(),
                    uptime: process.uptime(),
                    pingOneInitialized: serverState.pingOneInitialized
                };
                
                // Log server info
                logger.info(`Server is running on ${url}`, serverInfo);
                
                // Console output for better visibility
                console.log('\n🚀 Server started successfully!');
                console.log('='.repeat(60));
                console.log(`   URL: ${url}`);
                console.log(`   PID: ${process.pid}`);
                console.log(`   Node: ${process.version}`);
                console.log(`   Platform: ${process.platform}`);
                console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
                console.log(`   PingOne: ${serverState.pingOneInitialized ? '✅ Connected' : '⚠️  Not connected'}`);
                console.log('='.repeat(60) + '\n');
                
                // Emit ready event for testing
                if (process.env.NODE_ENV === 'test') {
                    server.emit('ready');
                }
                
                // Clean up and resolve
                cleanup();
                resolve(server);
            });
            
            // Handle server errors after startup
            server.on('error', (error) => {
                const errorMessage = `Server error: ${error.message}`;
                console.error(`❌ ${errorMessage}`, error.code ? `(code: ${error.code})` : '');
                
                logger.error('Server error:', {
                    error: error.message,
                    code: error.code,
                    stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
                    syscall: error.syscall,
                    address: error.address,
                    port: error.port
                });
                
                // Don't exit in development to allow for auto-restart
                if (process.env.NODE_ENV === 'production') {
                    process.exit(1);
                }
            });
            
        } catch (error) {
            console.error('❌ Failed to start HTTP server:', error.message);
            
            // Update server state
            serverState.isInitializing = false;
            serverState.lastError = error;
            
            // Clean up
            cleanup();
            clearTimeout(httpStartTimeout);
            
            // Close server if it was created
            if (server) {
                server.close(() => {
                    reject(error);
                });
            } else {
                reject(error);
            }
        }
        
        // Handle server startup errors
        server.once('error', (error) => {
            console.error('❌ Server error during startup:', error.message);
            
            // Clean up
            cleanup();
            clearTimeout(httpStartTimeout);
            
            // Update server state
            serverState.isInitializing = false;
            serverState.lastError = error;
            
            // Handle specific listen errors with friendly messages
            if (error.syscall === 'listen') {
                const bind = typeof PORT === 'string' ? `Pipe ${PORT}` : `Port ${PORT}`;
                
                // Enhance error message with more details
                let errorMessage = '';
                let shouldExit = true;
                
                switch (error.code) {
                    case 'EACCES':
                        errorMessage = `❌ Error: ${bind} requires elevated privileges. Please try running with sudo or use a different port.`;
                        break;
                    case 'EADDRINUSE':
                        errorMessage = `❌ Error: Port ${PORT} is already in use. Please stop the other process or use a different port.`;
                        
                        // In development, suggest how to find and kill the process
                        if (process.env.NODE_ENV !== 'production') {
                            // Use sync method to avoid async/await issues in error handling
                            try {
                                // Use process.platform directly to avoid async/await
                                const isWindows = process.platform === 'win32';
                                const command = isWindows 
                                    ? `netstat -ano | findstr :${PORT}`
                                    : `lsof -i :${PORT} | grep LISTEN`;
                                    
                                errorMessage += `\n\nTo find and kill the process, run:\n${command}`;
                                errorMessage += isWindows 
                                    ? '\nthen: taskkill /F /PID <PID>'
                                    : '\nthen: kill -9 <PID>';
                            } catch (osError) {
                                console.warn('⚠️  Could not determine OS-specific process commands:', osError.message);
                                errorMessage += '\n\nNote: Could not determine OS-specific commands to find and kill the process.';
                            }
                        }
                        break;
                    case 'EADDRNOTAVAIL':
                        errorMessage = `❌ Error: The requested address ${error.address} is not available on this machine.`;
                        break;
                    case 'ECONNREFUSED':
                        errorMessage = `❌ Error: Connection refused. The server might not be running or is not accessible.`;
                        break;
                    default:
                        errorMessage = `❌ Unhandled server error (${error.code}): ${error.message}`;
                        shouldExit = false;
                        break;
                }
                
                // Log the detailed error
                logger.error('Server startup failed:', {
                    error: error.message,
                    code: error.code,
                    syscall: error.syscall,
                    address: error.address,
                    port: error.port,
                    stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
                });
                
                console.error('\n' + '='.repeat(80));
                console.error(errorMessage);
                console.error('='.repeat(80) + '\n');
                
                // Only exit for critical errors
                if (shouldExit) {
                    process.exit(1);
                }
                
                // Re-throw the error if it's not a critical error
                throw error;
            }
            
            // Reject the promise with the error
            reject(error);
        });
        
        // Handle unhandled rejections
        process.on('unhandledRejection', (reason, promise) => {
            console.error('⚠️  Unhandled Rejection at:', promise, 'reason:', reason);
            logger.error('Unhandled Rejection at:', { promise, reason });
            
            // In production, you might want to restart the server or take other actions
            if (process.env.NODE_ENV === 'production') {
                // Consider implementing a more robust error recovery strategy here
                console.error('⚠️  Unhandled rejection in production. Consider implementing error recovery.');
            }
        });
        
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            console.error('⚠️  Uncaught Exception:', error);
            logger.error('Uncaught Exception:', {
                error: error.message,
                stack: error.stack,
                code: error.code
            });
            
            // In production, you might want to restart the server or take other actions
            if (process.env.NODE_ENV === 'production') {
                // Consider implementing a more robust error recovery strategy here
                console.error('⚠️  Uncaught exception in production. Consider implementing error recovery.');
                process.exit(1); // Exit with failure
            }
        });
        
        // Set a timeout for server startup
        server.setTimeout(5000, () => {
            const error = new Error('Server startup timed out');
            console.error('Server startup timed out');
            reject(error);
        });
    });
};

// Start the server
// Export for production use
module.exports = app;

// If this file is run directly, start the server
if (require.main === module) {
    startServer()
        .then(server => {
            console.log('✅ Server started successfully');
        })
        .catch(error => {
            console.error('❌ Failed to start server:', error.message);
            process.exit(1);
        });
}
