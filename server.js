// File: server.js
// Description: Main server entry point for PingOne user import tool
// 
// This file sets up the Express server with all necessary middleware,
// route handlers, and server management functionality. It handles:
// - Express app configuration and middleware setup
// - Rate limiting and security measures
// - API routing and request handling
// - Logging and monitoring
// - Graceful shutdown and error handling
// - Token management and authentication
// 
// The server provides both REST API endpoints and serves the frontend application.

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import cors from 'cors';
import winston from 'winston';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import TokenManager from './server/token-manager.js';
import logsRouter from './routes/logs.js';
import settingsRouter from './routes/settings.js';
import pingoneProxyRouter from './routes/pingone-proxy.js';
import apiRouter from './routes/api/index.js';
import util from 'util';

// Import chalk for colored console output (optional dependency)
let chalk = null;
try {
  chalk = (await import('chalk')).default;
} catch {}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config();

// Initialize Express application
const app = express();
const PORT = parseInt(process.env.PORT) || 4000;

// Validate port number is within valid range
if (PORT < 0 || PORT > 65535) {
    console.error(`Invalid port number: ${PORT}. Port must be between 0 and 65535.`);
    process.exit(1);
}

// Debug logging for port configuration
console.log(`🔍 PORT debugging:`, {
    rawEnvPort: process.env.PORT,
    parsedPort: PORT,
    portType: typeof PORT,
    portValid: PORT >= 0 && PORT <= 65535
});

/**
 * Create a rate limiter with configurable settings
 * 
 * Creates an Express rate limiter middleware with burst handling and queue
 * management. Designed to handle bulk import operations while preventing
 * API abuse.
 * 
 * @param {number} maxRequests - Maximum requests per second (default: 50)
 * @returns {Object} Express rate limiter middleware
 */
function createRateLimiter(maxRequests = 50) {
    return rateLimit({
        windowMs: 1000, // 1 second window
        max: maxRequests, // limit each IP to maxRequests per second
        message: {
            error: 'Too many requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter: 1
        },
        standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
        legacyHeaders: false, // Disable the `X-RateLimit-*` headers
        handler: (req, res) => {
            res.status(429).json({
                error: 'Rate limit exceeded',
                message: 'Too many requests. Please try again later.',
                retryAfter: 1
            });
        },
        // Burst handling configuration for bulk operations
        skipSuccessfulRequests: false, // Count all requests
        skipFailedRequests: false, // Count failed requests too
        // Allow burst of up to 4x maxRequests in first 1000ms, then enforce maxRequests/sec
        burstLimit: maxRequests * 4,
        burstWindowMs: 1000,
        // Queue configuration for handling request bursts
        queue: {
            enabled: true,
            maxQueueSize: 300, // Maximum number of requests to queue (increased from 100)
            maxQueueTime: 30000, // Maximum time to wait in queue (30 seconds, increased from 10)
            retryAfter: 2 // Time to wait before retry
        }
    });
}

// Get rate limit from environment or use default
const getRateLimit = () => {
    const envRateLimit = parseInt(process.env.RATE_LIMIT);
    if (envRateLimit && envRateLimit >= 1 && envRateLimit <= 200) {
        return envRateLimit;
    }
    return 150; // Increased default rate limit for bulk operations
};

// Create rate limiter with current settings
const limiter = createRateLimiter(getRateLimit());

// Function to update rate limiter when settings change
function updateRateLimiter(newRateLimit) {
    if (newRateLimit && newRateLimit >= 1 && newRateLimit <= 100) {
        // Remove the old rate limiter middleware
        app._router.stack = app._router.stack.filter(layer => {
            return !(layer.name === 'rateLimit' && layer.regexp && layer.regexp.source.includes('/api'));
        });
        
        // Create new rate limiter with updated settings
        const newLimiter = createRateLimiter(newRateLimit);
        
        // Apply the new rate limiter to API routes
        app.use('/api', newLimiter);
        
        console.log(`Rate limiter updated to ${newRateLimit} requests per second`);
    }
}

// Create a more lenient rate limiter specifically for logs
const logsRateLimiter = rateLimit({
    windowMs: 1000, // 1 second
    max: 100, // Allow more requests for logs (100 per second)
    message: {
        error: 'Logs API rate limit exceeded',
        message: 'Too many log requests. Please wait before trying again.',
        retryAfter: 1
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            error: 'Logs API rate limit exceeded',
            message: 'Too many log requests. Please wait before trying again.',
            retryAfter: 1
        });
    },
    // Burst handling configuration for logs
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    // Allow large burst for logs (logs are mostly read operations)
    burstLimit: 500,
    burstWindowMs: 1000,
    // Queue configuration for logs
    queue: {
        enabled: true,
        maxQueueSize: 200,
        maxQueueTime: 10000, // 10 seconds
        retryAfter: 1
    }
});

// Create a very lenient rate limiter specifically for health checks
const healthRateLimiter = rateLimit({
    windowMs: 1000, // 1 second
    max: 200, // Allow many health checks (200 per second)
    message: {
        error: 'Health API rate limit exceeded',
        message: 'Too many health check requests. Please wait before trying again.',
        retryAfter: 1
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            error: 'Health API rate limit exceeded',
            message: 'Too many health check requests. Please wait before trying again.',
            retryAfter: 1
        });
    },
    // Burst handling configuration for health checks
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    // Allow very large burst for health checks during initialization
    burstLimit: 1000,
    burstWindowMs: 1000,
    // Queue configuration for health checks
    queue: {
        enabled: true,
        maxQueueSize: 100,
        maxQueueTime: 5000, // 5 seconds
        retryAfter: 1
    }
});

// Apply rate limiting to all API routes (except logs which has its own limiter)
app.use('/api', limiter);

// API request/response logging middleware
// Logs all API requests and responses for debugging and monitoring
app.use('/api', (req, res, next) => {
    // Generate unique request ID for tracking
    const startTime = Date.now();
    const requestId = `api-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    req.requestId = requestId;
    req.startTime = startTime;

    // Log the incoming request with sanitized data
    // Redacts sensitive information like authorization headers
    const requestLog = {
        type: 'api_request',
        method: req.method,
        url: req.originalUrl,
        headers: {
            ...req.headers,
            'authorization': req.headers.authorization ? '***REDACTED***' : 'None'
        },
        body: req.method !== 'GET' ? req.body : undefined,
        timestamp: new Date().toISOString(),
        requestId: requestId,
        clientIp: req.ip,
        userAgent: req.get('user-agent'),
        source: 'server-api'
    };

    // Pretty print request log
    const reqSummary = `${chalk ? chalk.cyan('🔄 API REQUEST') : '🔄 API REQUEST'} ${req.method} ${req.originalUrl} [${requestId}]`;
    const reqDetails = util.inspect(requestLog, { depth: 3, colors: !!chalk, compact: false });
    console.log('\n' + '-'.repeat(60));
    console.log(reqSummary);
    console.log(reqDetails);
    console.log('-'.repeat(60));
    logger.info('🔄 Server API Request:', requestLog);

    // Capture the original res.json and res.send methods to log responses
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    res.json = function(data) {
        const responseLog = {
            type: 'api_response',
            status: res.statusCode,
            statusMessage: res.statusMessage,
            url: req.originalUrl,
            method: req.method,
            headers: res.getHeaders(),
            data: data,
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime,
            requestId: requestId,
            source: 'server-api'
        };
        const resSummary = `${chalk ? chalk.green('✅ API RESPONSE') : '✅ API RESPONSE'} ${res.statusCode} ${req.method} ${req.originalUrl} [${requestId}] (${responseLog.duration}ms)`;
        const resDetails = util.inspect(responseLog, { depth: 3, colors: !!chalk, compact: false });
        console.log(resSummary);
        console.log(resDetails);
        console.log('-'.repeat(60) + '\n');
        logger.info('✅ Server API Response:', responseLog);
        return originalJson(data);
    };

    res.send = function(data) {
        const responseLog = {
            type: 'api_response',
            status: res.statusCode,
            statusMessage: res.statusMessage,
            url: req.originalUrl,
            method: req.method,
            headers: res.getHeaders(),
            data: typeof data === 'string' ? data : data,
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime,
            requestId: requestId,
            source: 'server-api'
        };
        const resSummary = `${chalk ? chalk.green('✅ API RESPONSE') : '✅ API RESPONSE'} ${res.statusCode} ${req.method} ${req.originalUrl} [${requestId}] (${responseLog.duration}ms)`;
        const resDetails = util.inspect(responseLog, { depth: 3, colors: !!chalk, compact: false });
        console.log(resSummary);
        console.log(resDetails);
        console.log('-'.repeat(60) + '\n');
        logger.info('✅ Server API Response:', responseLog);
        return originalSend(data);
    };

    next();
});

// Make updateRateLimiter available to routes
app.set('updateRateLimiter', updateRateLimiter);

// --- Middleware (must come BEFORE routers) ---
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- API Routers (must come BEFORE static files) ---
// This file uses ES modules (import/export syntax)
// (imports moved to the top of the file)

// Apply specific rate limiter to logs endpoints
app.use('/api/logs', logsRateLimiter, logsRouter);

// Apply specific rate limiter to health endpoints
app.use('/api/health', healthRateLimiter);

// Health check endpoint
app.get('/api/health', (req, res) => {
    try {
        const status = {
            server: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
            },
            checks: {
                server: 'ok',
                // Add any additional health checks here
                database: 'ok', // Add actual database health check
                storage: 'ok',  // Add storage health check
                pingone: 'ok'   // Add PingOne API health check
            }
        };

        const isHealthy = Object.values(status.checks).every(check => check === 'ok');
        
        if (!isHealthy) {
            logger.warn('Health check failed', { status });
            return res.status(503).json({
                status: 'unhealthy',
                message: 'One or more services are not healthy',
                details: status
            });
        }

        res.json({
            status: 'healthy',
            message: 'All services are healthy',
            details: status
        });
    } catch (error) {
        logger.error('Health check failed:', error);
        res.status(500).json({
            status: 'error',
            error: 'Internal server error during health check',
            message: error.message
        });
    }
});

app.use('/api/settings', settingsRouter);
app.use('/api', apiRouter);

// Test PingOne connection endpoint (must be before pingone-proxy router)
app.post('/api/pingone/test-connection', async (req, res) => {
    // Use request body for settings
    const { apiClientId, apiSecret, environmentId, region = 'NorthAmerica', populationId } = req.body;
    
    if (!apiClientId || !apiSecret || !environmentId) {
        return res.status(400).json({
            success: false,
            message: 'Missing required settings: apiClientId, apiSecret, and environmentId are required'
        });
    }
    
    try {
        // Test the connection by getting an access token using the server's token manager
        const tokenManager = req.app.get('tokenManager');
        if (!tokenManager) {
            throw new Error('Token manager not available');
        }
        
        // Pass custom settings to the token manager
        const customSettings = {
            apiClientId: apiClientId,
            apiSecret: apiSecret,
            environmentId: environmentId,
            region: region
        };
        
        const token = await tokenManager.getAccessToken(customSettings);
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Failed to authenticate with PingOne API: No token received'
            });
        }
        
        // ALWAYS return success for token retrieval, but validate population ID separately
        let populationValidationResult = {
            isValid: true,
            message: '',
            error: null
        };
        
        // If populationId is provided and not empty, validate it exists in the environment
        if (populationId && populationId.trim() !== '' && populationId !== 'not set') {
            try {
                const axios = require('axios');
                const apiBaseUrl = region === 'Europe' ? 'https://api.pingone.eu' : 
                                 region === 'AsiaPacific' ? 'https://api.pingone.asia' : 
                                 'https://api.pingone.com';
                
                // Use the correct Management API endpoint
                const populationsUrl = `${apiBaseUrl}/v1/environments/${environmentId}/populations`;
                
                const response = await axios.get(populationsUrl, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000 // 10 second timeout
                });
                
                if (response.data && response.data._embedded && response.data._embedded.populations) {
                    const populations = response.data._embedded.populations;
                    const populationExists = populations.some(pop => pop.id === populationId);
                    
                    if (!populationExists) {
                        const availableIds = populations.map(p => `${p.name} (${p.id.slice(-8)})`).join(', ');
                        populationValidationResult = {
                            isValid: false,
                            message: `Population ID '${populationId}' not found in environment. Available populations: ${availableIds}`,
                            error: 'INVALID_POPULATION_ID'
                        };
                    } else {
                        const foundPop = populations.find(pop => pop.id === populationId);
                        populationValidationResult = {
                            isValid: true,
                            message: `Population ID validated successfully: ${foundPop.name} (${populationId.slice(-8)})`,
                            error: null
                        };
                    }
                } else {
                    populationValidationResult = {
                        isValid: false,
                        message: 'No populations found in environment',
                        error: 'NO_POPULATIONS_FOUND'
                    };
                }
            } catch (popError) {
                // Never let population validation failure break the connection test
                console.warn('Population validation failed (non-fatal):', popError.message);
                
                // Provide user-friendly warning based on error type
                let errorMessage = '';
                if (popError.response && popError.response.status === 404) {
                    errorMessage = `Population ID '${populationId}' not found in environment. Please check if the ID is correct.`;
                } else if (popError.response && popError.response.status === 403) {
                    errorMessage = `Unable to validate Population ID '${populationId}' - insufficient permissions to access populations.`;
                } else if (popError.code === 'ECONNABORTED' || popError.code === 'ETIMEDOUT') {
                    errorMessage = `Population ID validation timed out. Population ID '${populationId}' may be invalid.`;
                } else {
                    errorMessage = `Unable to validate Population ID '${populationId}'. Please verify the ID is correct.`;
                }
                
                populationValidationResult = {
                    isValid: false,
                    message: errorMessage,
                    error: 'POPULATION_VALIDATION_FAILED'
                };
            }
        }
        
        // Always return success for token retrieval, but include population validation result
        return res.json({
            success: true,
            message: 'Successfully connected to PingOne API and obtained token',
            tokenObtained: true,
            populationValidation: populationValidationResult
        });
        
    } catch (error) {
        console.error('PingOne connection test failed:', error);
        return res.status(401).json({
            success: false,
            message: `Failed to connect to PingOne API: ${error.message || 'Unknown error'}`
        });
    }
});

// Add token endpoint for frontend (must be before pingone proxy)
app.post('/api/pingone/get-token', async (req, res) => {
    console.log('[DEBUG] /api/pingone/get-token called');
    try {
        const tokenManager = req.app.get('tokenManager');
        if (!tokenManager) {
            console.error('[DEBUG] Token manager not available');
            return res.status(500).json({ 
                error: 'Token manager not available',
                message: 'Server token manager is not initialized'
            });
        }
        // Log settings used
        const settings = await tokenManager.getCredentials();
        console.log('[DEBUG] Token request settings:', settings);
        const token = await tokenManager.getAccessToken();
        console.log('[DEBUG] Token manager returned:', token ? token.substring(0, 8) + '...' : token);
        // If token is missing or empty, return 401
        if (!token) {
            console.error('[DEBUG] No token returned from token manager');
            return res.status(401).json({
                error: 'Failed to get token',
                message: 'PingOne did not return a valid token. Check your credentials.'
            });
        }
        // Get the actual expiry time from the token manager
        const tokenExpiry = tokenManager.tokenExpiry;
        const now = Date.now();
        const expiresIn = tokenExpiry ? Math.floor((tokenExpiry - now) / 1000) : 3600;
        console.log('[DEBUG] Returning token to frontend:', {
            tokenLength: token ? token.length : 0,
            tokenPreview: token ? token.substring(0, 8) + '...' : null,
            expiresIn: expiresIn,
            tokenExpiry: tokenExpiry,
            now: now
        });
        res.json({ 
            access_token: token,
            token_type: 'Bearer',
            expires_in: expiresIn
        });
    } catch (error) {
        console.error('[DEBUG] Error in /api/pingone/get-token:', error.stack || error);
        logger.error('Error getting token for frontend:', error);
        res.status(500).json({ 
            error: 'Failed to get token',
            message: error.message,
            stack: error.stack
        });
    }
});

// Dedicated token refresh endpoint that bypasses all validation
app.post('/api/pingone/refresh-token', async (req, res) => {
    try {
        const tokenManager = req.app.get('tokenManager');
        if (!tokenManager) {
            return res.status(500).json({ 
                success: false,
                error: 'Token manager not available',
                message: 'Server token manager is not initialized'
            });
        }

        // Force clear any cached token and get a fresh one
        tokenManager.clearCache?.();
        
        const token = await tokenManager.getAccessToken();
        
        res.json({ 
            success: true,
            message: '✅ Token refreshed successfully',
            token_info: {
                access_token: token,
                token_type: 'Bearer',
                expires_in: 3600,
                preview: token.slice(0, 20) + '...'
            }
        });
    } catch (error) {
        logger.error('Error refreshing token:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to refresh token',
            message: error.message
        });
    }
});

// Debug endpoint to show token details
app.get('/api/debug/token', async (req, res) => {
    try {
        const tokenManager = req.app.get('tokenManager');
        if (!tokenManager) {
            return res.status(500).json({ 
                error: 'Token manager not available'
            });
        }

        const token = await tokenManager.getAccessToken();
        
        // Check if token is valid JWT format
        const parts = token.split('.');
        const isValidJWT = parts.length === 3;
        
        res.json({
            tokenLength: token.length,
            tokenPreview: token.slice(0, 20) + '...',
            isValidJWT: isValidJWT,
            jwtParts: parts.length,
            authHeader: `Bearer ${token}`,
            authHeaderLength: `Bearer ${token}`.length,
            hasSpecialChars: /[^A-Za-z0-9+/=.-]/.test(token),
            environment: {
                hasClientId: !!process.env.PINGONE_CLIENT_ID,
                hasClientSecret: !!process.env.PINGONE_CLIENT_SECRET,
                hasEnvironmentId: !!process.env.PINGONE_ENVIRONMENT_ID,
                clientIdEnding: process.env.PINGONE_CLIENT_ID ? process.env.PINGONE_CLIENT_ID.slice(-4) : 'NOT SET',
                secretEnding: process.env.PINGONE_CLIENT_SECRET ? process.env.PINGONE_CLIENT_SECRET.slice(-4) : 'NOT SET'
            }
        });
    } catch (error) {
        res.status(500).json({ 
            error: 'Failed to get token debug info',
            message: error.message
        });
    }
});

app.use('/api/pingone', pingoneProxyRouter);

/**
 * List all registered routes for debugging
 * @param {Object} app - Express app instance
 */
function listRoutes(app) {
  if (!app || !app._router || !Array.isArray(app._router.stack)) {
    console.warn('Cannot list routes: Invalid app or router');
    return;
  }

  console.log('\n=== Registered Routes ===');
  const routes = [];
  
  app._router.stack.forEach((middleware) => {
    if (middleware.route) { // routes registered directly on the app
      routes.push(middleware.route);
    } else if (middleware.name === 'router') { // router middleware 
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          routes.push({
            ...handler.route,
            path: middleware.regexp.source.replace(/^\^|\$\//g, '') + handler.route.path
          });
        }
      });
    }
  });
  
  // Sort routes by path for better readability
  routes.sort((a, b) => a.path.localeCompare(b.path));
  
  // Calculate column widths
  let maxMethodLength = 0;
  let maxPathLength = 0;
  
  routes.forEach(route => {
    const methods = Object.keys(route.methods).join(',').toUpperCase();
    maxMethodLength = Math.max(maxMethodLength, methods.length);
    maxPathLength = Math.max(maxPathLength, route.path.length);
  });
  
  // Print routes in a formatted table
  console.log(
    'METHOD'.padEnd(maxMethodLength + 2) + 
    'PATH'.padEnd(Math.min(maxPathLength + 2, 50)) + 
    'HANDLER'
  );
  console.log('-'.repeat(80));
  
  routes.forEach(route => {
    const methods = Object.keys(route.methods)
      .filter(method => method !== '_all')
      .map(method => method.toUpperCase())
      .join(',');
      
    console.log(
      methods.padEnd(maxMethodLength + 2) + 
      route.path.padEnd(Math.min(maxPathLength + 2, 50)) +
      (route.stack ? route.stack[0].name : 'anonymous')
    );
  });
  
  console.log('\nTotal routes:', routes.length);
  console.log('='.repeat(80) + '\n');
}

// --- Static Files ---
app.use(express.static(path.join(__dirname, 'public')));

// --- Middleware ---
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const logger = winston.createLogger({
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
        // Console transport with cleaner format
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(({ timestamp, level, message, ...meta }) => {
                    // Clean up the message for better readability
                    let cleanMessage = message;
                    
                    // Remove common verbose prefixes
                    cleanMessage = cleanMessage.replace(/^\[.*?\]\s*/, '');
                    
                    // Format meta data more concisely
                    let metaString = '';
                    if (Object.keys(meta).length > 0) {
                        // Filter out common verbose fields
                        const filteredMeta = { ...meta };
                        delete filteredMeta.service;
                        delete filteredMeta.env;
                        delete filteredMeta.pid;
                        delete filteredMeta.timestamp;
                        
                        if (Object.keys(filteredMeta).length > 0) {
                            // Only show key fields for readability
                            const keyFields = ['error', 'code', 'url', 'method', 'status', 'endpoint'];
                            const importantMeta = {};
                            keyFields.forEach(field => {
                                if (filteredMeta[field]) {
                                    importantMeta[field] = filteredMeta[field];
                                }
                            });
                            
                            if (Object.keys(importantMeta).length > 0) {
                                metaString = ` | ${JSON.stringify(importantMeta)}`;
                            }
                        }
                    }
                    
                    return `${timestamp} [${level.toUpperCase()}] ${cleanMessage}${metaString}`;
                })
            ),
            handleExceptions: true,
            handleRejections: true,
            level: 'info'
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
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
                // Clean up the message for better readability
                let cleanMessage = message;
                cleanMessage = cleanMessage.replace(/^\[.*?\]\s*/, '');
                
                // Format meta data more concisely
                let metaString = '';
                if (Object.keys(meta).length > 0) {
                    const filteredMeta = { ...meta };
                    delete filteredMeta.service;
                    delete filteredMeta.env;
                    delete filteredMeta.pid;
                    delete filteredMeta.timestamp;
                    
                    if (Object.keys(filteredMeta).length > 0) {
                        const keyFields = ['error', 'code', 'url', 'method', 'status', 'endpoint'];
                        const importantMeta = {};
                        keyFields.forEach(field => {
                            if (filteredMeta[field]) {
                                importantMeta[field] = filteredMeta[field];
                            }
                        });
                        
                        if (Object.keys(importantMeta).length > 0) {
                            metaString = ` | ${JSON.stringify(importantMeta)}`;
                        }
                    }
                }
                
                return `[${timestamp}] ${level}: ${cleanMessage}${metaString}`;
            })
        )
    }));
    // Combined logs (all levels, most verbose)
    logger.add(new winston.transports.File({
        filename: path.join(__dirname, 'logs/combined.log'),
        level: 'debug',
        maxsize: 20 * 1024 * 1024, // 20MB
        maxFiles: 5,
        tailable: true,
        zippedArchive: true,
        format: winston.format.combine(
            winston.format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss.SSS'
            }),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
                const metaString = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
                return `[${timestamp}] ${level}: ${message}${metaString}\n${'*'.repeat(80)}`;
            })
        )
    }));
    // Server logs (info+ only, matches console)
    logger.add(new winston.transports.File({
        filename: path.join(__dirname, 'logs/server.log'),
        level: 'info',
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
        tailable: true,
        zippedArchive: true,
        format: winston.format.combine(
            winston.format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss.SSS'
            }),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
                const metaString = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
                return `[${timestamp}] ${level}: ${message}${metaString}\n${'*'.repeat(80)}`;
            })
        )
    }));
    // Client logs (from browser)
    const clientLogger = winston.createLogger({
        level: 'info',
        format: winston.format.combine(
            winston.format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss.SSS'
            }),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
                const metaString = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
                return `[${timestamp}] ${level}: ${message}${metaString}\n${'*'.repeat(80)}`;
            })
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
    logger.client = clientLogger;
}

// Initialize TokenManager and attach to app
const tokenManager = new TokenManager(logger);
app.set('tokenManager', tokenManager);

// Log to console in development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

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

// Create log file header
const createLogHeader = (logType) => {
    const timestamp = new Date().toISOString();
    return [
        '='.repeat(80),
        `PingOne Import Tool - ${logType} Log`,
        `Started: ${timestamp}`,
        `Node.js ${process.version} on ${process.platform} ${process.arch}`,
        `PID: ${process.pid}`,
        `Environment: ${process.env.NODE_ENV || 'development'}`,
        '='.repeat(80),
        ''
    ].join('\n');
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

// Initialize logging system
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

// Test PingOne connection endpoint is now defined earlier in the file

// API routes - REMOVED: Conflicting logs endpoints
// The logs router mounted at /api/logs provides comprehensive logging functionality
// including GET, POST, DELETE endpoints for UI and disk logs

// Health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        // Get server status
        const serverStatus = serverState.getStatus();
        
        // Check if we have all required PingOne environment variables
        const hasRequiredPingOneVars = process.env.PINGONE_CLIENT_ID && 
                                     process.env.PINGONE_CLIENT_SECRET && 
                                     process.env.PINGONE_ENVIRONMENT_ID;
        
        // Get memory usage and hostname
        const memoryUsage = process.memoryUsage();
        const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
        const { hostname } = await import('os');
        
        // Prepare status object
        const status = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            server: {
                ...serverStatus,
                pingOne: {
                    initialized: serverStatus.pingOneInitialized,
                    hasRequiredConfig: hasRequiredPingOneVars,
                    environmentId: process.env.PINGONE_ENVIRONMENT_ID ? 'configured' : 'not configured',
                    region: process.env.PINGONE_REGION || 'not configured',
                    populationId: process.env.PINGONE_POPULATION_ID || 'not configured'
                }
            },
            system: {
                node: process.version,
                platform: process.platform,
                memory: memoryUsage,
                memoryUsage: `${Math.round(memoryUsagePercent)}%`,
                cpu: process.cpuUsage ? process.cpuUsage() : { user: 0, system: 0 },
                env: process.env.NODE_ENV || 'development',
                pid: process.pid,
                cwd: process.cwd()
            },
            checks: {
                // Critical checks
                pingOneConfigured: hasRequiredPingOneVars ? 'ok' : 'error',
                pingOneConnected: serverStatus.pingOneInitialized ? 'ok' : 'error',
                
                // System resource checks
                memory: memoryUsagePercent < 90 ? 'ok' : 'warn',
                diskSpace: 'ok',  // Add actual disk space check if needed
                
                // Application health checks
                api: 'ok',
                storage: 'ok',
                logging: 'ok'
            },
            // Add queue system information
            queues: {
                export: exportQueue.getStats(),
                import: importQueue.getStats(),
                api: apiQueue.getStats()
            },
            // Add any additional non-critical information
            info: {
                nodeEnv: process.env.NODE_ENV || 'development',
                appVersion: process.env.npm_package_version || 'unknown',
                hostname: hostname()
            }
        };
        
        // Determine overall status based on critical checks
        // Note: PingOne connection is not critical - the tool can work without it
        const criticalChecks = {
            memory: status.checks.memory
        };
        
        // Only consider PingOne configuration as critical, not connection
        if (status.checks.pingOneConfigured === 'error') {
            criticalChecks.pingOneConfigured = 'error';
        }
        
        const hasCriticalErrors = Object.values(criticalChecks).some(check => check === 'error');
        const hasWarnings = Object.values(status.checks).some(check => check === 'warn');
        
        // Set appropriate status code and message
        if (hasCriticalErrors) {
            status.status = 'error';
            status.message = 'One or more critical services are not healthy';
            logger.warn('Health check failed', { status });
            return res.status(503).json(status);
        } else if (hasWarnings) {
            status.status = 'degraded';
            status.message = 'One or more services have warnings';
            logger.info('Health check completed with warnings', { status });
        } else {
            status.message = 'All services are operational';
            logger.debug('Health check passed', { status });
        }
        
        res.json(status);
    } catch (error) {
        const errorId = Math.random().toString(36).substring(2, 10);
        logger.error(`Health check failed [${errorId}]:`, error);
        
        res.status(500).json({
            status: 'error',
            error: 'Internal server error during health check',
            message: error.message,
            errorId: errorId,
            timestamp: new Date().toISOString()
        });
    }
});

// Get logs - REMOVED: This conflicts with the logs router mounted at /api/logs
// The logs router provides more comprehensive logging functionality

// API Routes
// Health endpoint is defined later in the file with comprehensive server status

// PingOne API proxy endpoints - using routes/pingone-proxy.js

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

// PingOne API proxy routes are handled by routes/pingone-proxy.js

// Settings endpoints
const SETTINGS_FILE = path.join(__dirname, 'data', 'settings.json');

// Queue status endpoints (must be before catch-all route)
app.get('/api/queue/status', (req, res) => {
    res.json({
        export: exportQueue.getStats(),
        import: importQueue.getStats(),
        api: apiQueue.getStats(),
        timestamp: new Date().toISOString()
    });
});

// Queue health endpoint
app.get('/api/queue/health', (req, res) => {
    const exportStats = exportQueue.getStats();
    const importStats = importQueue.getStats();
    const apiStats = apiQueue.getStats();
    
    const isHealthy = 
        exportStats.queueLength < exportStats.maxQueueSize * 0.8 &&
        importStats.queueLength < importStats.maxQueueSize * 0.8 &&
        apiStats.queueLength < apiStats.maxQueueSize * 0.8;
    
    res.json({
        status: isHealthy ? 'healthy' : 'warning',
        message: isHealthy ? 'All queues are operating normally' : 'Some queues are approaching capacity',
        queues: {
            export: {
                ...exportStats,
                health: exportStats.queueLength < exportStats.maxQueueSize * 0.8 ? 'healthy' : 'warning'
            },
            import: {
                ...importStats,
                health: importStats.queueLength < importStats.maxQueueSize * 0.8 ? 'healthy' : 'warning'
            },
            api: {
                ...apiStats,
                health: apiStats.queueLength < apiStats.maxQueueSize * 0.8 ? 'healthy' : 'warning'
            }
        },
        timestamp: new Date().toISOString()
    });
});

// Add this BEFORE your catch-all route
app.get('/api/pingone/populations', (req, res) => {
    console.log('[DEBUG] /api/pingone/populations endpoint hit');
    res.json({ message: 'Endpoint exists', timestamp: new Date().toISOString() });
});

// Add this BEFORE your catch-all route (app.get('*', ...))
app.get('/api/debug/settings', async (req, res) => {
    try {
        console.log('[DEBUG] /api/debug/settings called');
        
        // Read settings file
        const settingsPath = path.join(process.cwd(), 'data', 'settings.json');
        let settings = {};
        
        try {
            const data = await fs.readFile(settingsPath, 'utf8');
            settings = JSON.parse(data);
            console.log('[DEBUG] Settings loaded from file');
        } catch (error) {
            console.log('[DEBUG] No settings file found:', error.message);
        }
        
        // Check token manager
        const tokenManager = req.app.get('tokenManager');
        let tokenManagerStatus = 'not available';
        let credentials = null;
        
        if (tokenManager) {
            try {
                credentials = await tokenManager.getCredentials();
                tokenManagerStatus = 'available';
            } catch (error) {
                tokenManagerStatus = `error: ${error.message}`;
            }
        }
        
        res.json({
            success: true,
            fileSettings: settings,
            tokenManagerStatus,
            credentials: credentials ? {
                environmentId: credentials.environmentId ? '***' + credentials.environmentId.slice(-4) : 'not set',
                apiClientId: credentials.apiClientId ? '***' + credentials.apiClientId.slice(-4) : 'not set',
                apiSecret: credentials.apiSecret ? '***' + credentials.apiSecret.slice(-4) : 'not set',
                region: credentials.region || 'not set'
            } : null,
            filePath: settingsPath,
            hasCredentials: !!(credentials?.apiClientId && credentials?.apiSecret)
        });
        
    } catch (error) {
        console.error('[DEBUG] Error in /api/debug/settings:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
});

// Serve the main application for non-API routes (must be last)
app.get('*', (req, res) => {
    // Don't serve HTML for API routes
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            error: 'API endpoint not found',
            message: `Cannot ${req.method} ${req.originalUrl}`,
            status: 404,
            timestamp: new Date().toISOString()
        });
    }
    
    // Serve the main HTML page for all other routes
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use(async (err, req, res, next) => {
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
    
    // Post error to UI for display
    try {
        const uiResponse = await fetch(`http://localhost:${PORT}/api/logs/error`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: `Server error: ${err.message}`,
                details: {
                    error: err.message,
                    code: err.code,
                    url: req.originalUrl,
                    method: req.method,
                    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
                },
                source: 'server'
            })
        });
        
        if (!uiResponse.ok) {
            console.error('Failed to post error to UI:', uiResponse.statusText);
        }
    } catch (uiError) {
        console.error('Error posting to UI logs:', uiError.message);
    }
    
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
process.on('unhandledRejection', async (reason, promise) => {
    logger.error('Unhandled Rejection at:', { 
        promise, 
        reason: reason instanceof Error ? reason.message : reason,
        stack: reason instanceof Error ? reason.stack : undefined
    });
    
    // Post error to UI for display
    try {
        const uiResponse = await fetch(`http://localhost:${PORT}/api/logs/error`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: `Unhandled promise rejection: ${reason instanceof Error ? reason.message : reason}`,
                details: {
                    reason: reason instanceof Error ? reason.message : reason,
                    stack: reason instanceof Error ? reason.stack : undefined,
                    promise: promise.toString()
                },
                source: 'server'
            })
        });
        
        if (!uiResponse.ok) {
            console.error('Failed to post error to UI:', uiResponse.statusText);
        }
    } catch (uiError) {
        console.error('Error posting to UI logs:', uiError.message);
    }
    
    // For development, log the full error
    if (process.env.NODE_ENV !== 'production') {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    }
});

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
    logger.error('Uncaught Exception:', {
        error: error.message,
        stack: error.stack,
        name: error.name
    });
    
    // Post error to UI for display
    try {
        const uiResponse = await fetch(`http://localhost:${PORT}/api/logs/error`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: `Uncaught exception: ${error.message}`,
                details: {
                    error: error.message,
                    stack: error.stack,
                    name: error.name
                },
                source: 'server'
            })
        });
        
        if (!uiResponse.ok) {
            console.error('Failed to post error to UI:', uiResponse.statusText);
        }
    } catch (uiError) {
        console.error('Error posting to UI logs:', uiError.message);
    }
    
    // For development, log the full error
    if (process.env.NODE_ENV !== 'production') {
        console.error('Uncaught Exception:', error);
    }
    
    // In production, we might want to gracefully shut down
    if (process.env.NODE_ENV === 'production') {
        logger.on('finish', () => process.exit(1));
    }
});

// Server instance (will be initialized in startServer)
let server = null;

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

// Server state management
const serverState = {
    isShuttingDown: false,
    isInitialized: false,
    isInitializing: false,
    lastError: null,
    pingOneInitialized: false,
    
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            isInitializing: this.isInitializing,
            isShuttingDown: this.isShuttingDown,
            lastError: this.lastError ? this.lastError.message : null,
            uptime: process.uptime(),
            pingOneInitialized: this.pingOneInitialized
        };
    },
    
    uptime() {
        return process.uptime();
    }
};

// Start the server with async initialization
const startServer = async () => {
    console.log('🚀 Starting server initialization...');
    console.log(`Node.js version: ${process.version}`);
    console.log(`Platform: ${process.platform} ${process.arch}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    
    const startTime = Date.now();
    
    if (serverState.isInitializing) {
        const error = new Error('Server initialization already in progress');
        console.error('❌ Server initialization error:', error.message);
        throw error;
    }
    
    if (serverState.isInitialized) {
        const error = new Error('Server is already initialized');
        console.error('❌ Server already initialized');
        throw error;
    }
    
    serverState.isInitializing = true;
    serverState.lastError = null;
    
    console.log('🔍 Server state:', {
        isInitializing: serverState.isInitializing,
        isInitialized: serverState.isInitialized,
        lastError: serverState.lastError
    });
    
    // Helper function to log timing information
    const logTime = (message) => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`[${elapsed}s] ${message}`);
    };
    
    // Initialize logging system first
    logTime('🔧 Initializing logging system...');
    try {
        console.log('📁 Logs directory:', path.join(__dirname, 'logs'));
        console.log('📝 Checking write permissions...');
        
        // Test directory write permissions
        try {
            const testFile = path.join(__dirname, 'logs', 'permission-test.txt');
            await fs.writeFile(testFile, 'test', 'utf8');
            await fs.unlink(testFile);
            console.log('✅ Write permissions verified');
        } catch (permError) {
            console.error('❌ Write permission error:', permError.message);
            console.error('Current working directory:', process.cwd());
            console.error('__dirname:', __dirname);
            throw new Error(`Insufficient permissions to write to logs directory: ${permError.message}`);
        }
        
        await initializeLoggingSystem();
        logTime('✅ Logging system initialized successfully');
    } catch (error) {
        const errorMsg = `❌ Failed to initialize logging system: ${error.message}`;
        console.error(errorMsg);
        console.error('Error details:', error.stack || 'No stack trace available');
        
        serverState.lastError = error;
        serverState.isInitializing = false;
        
        // Log to console with more details
        console.error('📌 Server state after logging init failure:', {
            isInitializing: serverState.isInitializing,
            isInitialized: serverState.isInitialized,
            lastError: serverState.lastError ? serverState.lastError.message : 'none'
        });
        
        // Continue with server startup but log the error
        logTime('⚠️  Continuing despite logging system initialization error');
    }
    
    // Load settings from file and set environment variables
    try {
        const settingsPath = path.join(__dirname, 'data', 'settings.json');
        const settingsData = await fs.readFile(settingsPath, 'utf8');
        const settings = JSON.parse(settingsData);
        
        // Set environment variables from settings file
        if (settings.apiClientId) {
            process.env.PINGONE_CLIENT_ID = settings.apiClientId;
        }
        if (settings.environmentId) {
            process.env.PINGONE_ENVIRONMENT_ID = settings.environmentId;
        }
        if (settings.region) {
            process.env.PINGONE_REGION = settings.region;
        }
        
        // Handle API secret - prioritize environment variable over file settings
        if (!process.env.PINGONE_CLIENT_SECRET && settings.apiSecret) {
            if (settings.apiSecret.startsWith('enc:')) {
                // This is an encrypted secret, we need to decrypt it
                // For now, we'll skip setting it and let the user know
                console.warn('⚠️  API secret is encrypted. Please update settings to use unencrypted secret.');
            } else {
                // This is an unencrypted secret, use it directly
                process.env.PINGONE_CLIENT_SECRET = settings.apiSecret;
            }
        } else if (process.env.PINGONE_CLIENT_SECRET) {
            console.log('✅ Using API secret from environment variable');
        }
        
        console.log('✅ Loaded settings from file and set environment variables');
    } catch (error) {
        console.warn('⚠️  Could not load settings from file:', error.message);
        // Continue with existing environment variables
    }
    
    // Log environment variables (masking sensitive data)
    const maskedEnv = {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        PINGONE_CLIENT_ID: process.env.PINGONE_CLIENT_ID ? '***' + process.env.PINGONE_CLIENT_ID.slice(-4) : 'Not set',
        PINGONE_ENVIRONMENT_ID: process.env.PINGONE_ENVIRONMENT_ID ? '***' + process.env.PINGONE_ENVIRONMENT_ID.slice(-4) : 'Not set',
        PINGONE_REGION: process.env.PINGONE_REGION || 'Not set',
        HAS_CLIENT_SECRET: !!process.env.PINGONE_CLIENT_SECRET
    };
    
    console.log('🌐 Environment variables:', JSON.stringify(maskedEnv, null, 2));
    
    // Initialize token manager with timeout (completely non-blocking)
    logTime('🔑 Starting PingOne connection in background...');
    serverState.pingOneInitialized = false;
    
    // Debug: Check if we have all required PingOne environment variables
    const hasRequiredPingOneVars = process.env.PINGONE_CLIENT_ID && 
                                 process.env.PINGONE_CLIENT_SECRET && 
                                 process.env.PINGONE_ENVIRONMENT_ID;
    
    console.log('🔍 PingOne Environment Check:', {
        hasClientId: !!process.env.PINGONE_CLIENT_ID,
        hasClientSecret: !!process.env.PINGONE_CLIENT_SECRET,
        hasEnvId: !!process.env.PINGONE_ENVIRONMENT_ID,
        hasRegion: !!process.env.PINGONE_REGION
    });
    
    if (hasRequiredPingOneVars) {
        // Start PingOne initialization in the background
        tokenManager.getAccessToken()
            .then(token => {
                logTime('✅ Successfully connected to PingOne API');
                serverState.pingOneInitialized = true;
                logger.info('Successfully connected to PingOne API');
            })
            .catch(error => {
                logTime(`⚠️  Warning: Could not connect to PingOne API (${error.message})`);
                logger.warn(`Could not connect to PingOne API: ${error.message}`);
                // Don't fail the server startup, just mark as not initialized
                serverState.pingOneInitialized = false;
                
                // Log additional error details for debugging
                if (error.response) {
                    console.error('PingOne API Error Response:', {
                        status: error.response.status,
                        statusText: error.response.statusText,
                        headers: error.response.headers,
                        data: error.response.data
                    });
                } else if (error.request) {
                    console.error('PingOne API Request Error:', {
                        message: error.message,
                        code: error.code,
                        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
                    });
                } else {
                    console.error('PingOne API Error:', {
                        message: error.message,
                        code: error.code,
                        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
                    });
                }
                
                const warningMsg = 'Failed to initialize PingOne token manager. Some features may not work.';
                console.warn(`⚠️  ${warningMsg}`);
                console.warn('Error details:', error.message);
                logger.warn(warningMsg, { error: error.message });
                
                if (!process.env.PINGONE_CLIENT_ID || !process.env.PINGONE_CLIENT_SECRET || !process.env.PINGONE_ENVIRONMENT_ID) {
                    console.warn('⚠️  Missing required PingOne environment variables. Please check your .env file.');
                }
                
                serverState.pingOneInitialized = false;
            });
    } else {
        const warningMsg = 'PingOne environment variables not set. PingOne features will be disabled.';
        logTime(`⚠️  ${warningMsg}`);
        logger.warn(warningMsg);
        serverState.pingOneInitialized = false;
    }
    
    // Start the HTTP server immediately
    logTime(`🌐 Starting HTTP server on port ${PORT}...`);
    
    return new Promise((resolve, reject) => {
        console.log('🔄 Creating HTTP server instance...');
        let server;
        let timeoutId;
        let isResolved = false;
        
        // Log current memory usage
        const logMemoryUsage = () => {
            const used = process.memoryUsage();
            console.log('🧠 Memory usage (MB):', {
                rss: (used.rss / 1024 / 1024).toFixed(2),
                heapTotal: (used.heapTotal / 1024 / 1024).toFixed(2),
                heapUsed: (used.heapUsed / 1024 / 1024).toFixed(2),
                external: (used.external / 1024 / 1024).toFixed(2)
            });
        };
        
        // Log memory usage initially
        logMemoryUsage();
        // Log memory usage every 5 seconds
        const memoryInterval = setInterval(() => {
            const used = process.memoryUsage();
            const memoryUsage = {
                rss: (used.rss / 1024 / 1024).toFixed(2),
                heapTotal: (used.heapTotal / 1024 / 1024).toFixed(2),
                heapUsed: (used.heapUsed / 1024 / 1024).toFixed(2),
                external: (used.external / 1024 / 1024).toFixed(2)
            };
            
            console.log('🧠 Memory usage (MB):', memoryUsage);
            
            // Post warning if memory usage is high
            const heapUsedMB = parseFloat(memoryUsage.heapUsed);
            const heapTotalMB = parseFloat(memoryUsage.heapTotal);
            const memoryPercentage = (heapUsedMB / heapTotalMB) * 100;
            
            if (memoryPercentage > 80) {
                postWarningToUI('High memory usage detected', {
                    memoryUsage: memoryUsage,
                    percentage: memoryPercentage.toFixed(1),
                    threshold: 80
                }, 'memory-monitor');
            }
        }, 5000);
        
        // Set a timeout for the server to start listening
        const LISTEN_TIMEOUT = 30000; // 30 seconds
        console.log(`⏳ Setting up server listen timeout (${LISTEN_TIMEOUT}ms)...`);
        
        timeoutId = setTimeout(() => {
            if (isResolved) return;
            const error = new Error(`Server failed to start listening on port ${PORT} within ${LISTEN_TIMEOUT/1000} seconds`);
            error.code = 'SERVER_LISTEN_TIMEOUT';
            
            // Log detailed error information
            console.error('❌ Server listen timeout error:', {
                code: error.code,
                message: error.message,
                port: PORT,
                timeElapsed: `${(Date.now() - startTime) / 1000}s`,
                isResolved,
                serverListening: server?.listening
            });
            
            // Post warning to UI for display
            postWarningToUI('Server listen timeout', {
                timeout: LISTEN_TIMEOUT / 1000,
                port: PORT,
                timeElapsed: `${(Date.now() - startTime) / 1000}s`,
                serverListening: server?.listening
            }, 'server-listen');
            
            // Log active handles that might be keeping the process alive
            if (process._getActiveHandles) {
                console.error('Active handles:', process._getActiveHandles().length);
            }
            
            // Log current state of the server
            if (server) {
                console.error('Server state:', {
                    listening: server.listening,
                    address: server.address(),
                    maxHeadersCount: server.maxHeadersCount,
                    timeout: server.timeout,
                    keepAliveTimeout: server.keepAliveTimeout,
                    headersTimeout: server.headersTimeout,
                    requestTimeout: server.requestTimeout
                });
            }
            
            reject(error);
        }, LISTEN_TIMEOUT);
        
        // Create HTTP server
        try {
            server = app.listen(PORT, '0.0.0.0', () => {
                if (isResolved) return;
                clearTimeout(timeoutId);
                isResolved = true;
                
                try {
                    const address = server.address();
                    if (!address) {
                        const error = new Error('Server address is null - server may not have started properly');
                        logTime(`❌ Server error: ${error.message}`);
                        reject(error);
                        return;
                    }
                    const host = address.address === '::' ? 'localhost' : address.address;
                    const url = `http://${host}:${address.port}`;
                    
                    serverState.isInitialized = true;
                    serverState.isInitializing = false;
                    serverState.lastError = null;
                    
                    logTime(`✅ Server running at ${url}`);
                    logTime(`   Environment: ${process.env.NODE_ENV || 'development'}`);
                    logTime(`   PID: ${process.pid}`);
                    logTime(`   PingOne: ${serverState.pingOneInitialized ? 'Connected' : 'Not connected'}`);
                    
                    resolve(server);
                } catch (addressError) {
                    const error = new Error(`Failed to get server address: ${addressError.message}`);
                    logTime(`❌ Server error: ${error.message}`);
                    reject(error);
                }
            });
        } catch (listenError) {
            const error = new Error(`Failed to start server: ${listenError.message}`);
            logTime(`❌ Server error: ${error.message}`);
            reject(error);
        }
        
        // Handle server errors
        server.on('error', (error) => {
            if (isResolved) return;
            clearTimeout(timeoutId);
            isResolved = true;
            
            serverState.isInitialized = false;
            serverState.isInitializing = false;
            serverState.lastError = error;
            
            logTime(`❌ Server error: ${error.message}`);
            reject(error);
        });
        
        // Initialize server startup timeout with more detailed logging
        let serverStartupTimeout;
        const SERVER_STARTUP_TIMEOUT = 60000; // 60 seconds
        
        console.log(`⏳ Setting up server startup timeout (${SERVER_STARTUP_TIMEOUT/1000}s)...`);
        
        // Cleanup function with detailed logging
        const cleanup = (reason) => {
            console.log(`🧹 Cleaning up resources (reason: ${reason || 'normal'})`);
            
            // Clear all timeouts
            if (serverStartupTimeout) {
                clearTimeout(serverStartupTimeout);
                console.log('✅ Cleared server startup timeout');
            }
            
            // Clear memory usage interval
            if (memoryInterval) {
                clearInterval(memoryInterval);
                console.log('✅ Stopped memory usage monitoring');
            }
            
            // Remove event listeners
            process.off('unhandledRejection', cleanup);
            process.off('rejectionHandled', cleanup);
            
            console.log('🧹 Cleanup completed');
        };
        
        // Set server startup timeout with detailed error information
        serverStartupTimeout = setTimeout(() => {
            if (isResolved) return;
            
            const error = new Error(`Server failed to start within ${SERVER_STARTUP_TIMEOUT/1000} seconds`);
            error.code = 'SERVER_STARTUP_TIMEOUT';
            error.details = {
                timeElapsed: `${(Date.now() - startTime) / 1000}s`,
                isResolved,
                serverListening: server?.listening,
                port: PORT,
                environment: process.env.NODE_ENV || 'development',
                nodeVersion: process.version,
                platform: process.platform,
                memoryUsage: process.memoryUsage()
            };
            
            console.error('❌ Server startup timeout error:', {
                code: error.code,
                message: error.message,
                ...error.details
            });
            
            // Post warning to UI for display
            postWarningToUI('Server startup timeout', {
                timeout: SERVER_STARTUP_TIMEOUT / 1000,
                timeElapsed: `${(Date.now() - startTime) / 1000}s`,
                serverListening: server?.listening,
                port: PORT
            }, 'server-startup');
            
            // Log active handles that might be keeping the process alive
            if (process._getActiveHandles) {
                const handles = process._getActiveHandles();
                console.error(`Active handles (${handles.length}):`);
                handles.slice(0, 10).forEach((handle, i) => {
                    console.error(`  ${i + 1}.`, {
                        type: handle.constructor.name,
                        fd: handle.fd,
                        destroyed: handle.destroyed,
                        connecting: handle.connecting
                    });
                });
                if (handles.length > 10) {
                    console.error(`  ...and ${handles.length - 10} more`);
                }
            }
            
            // Clean up and reject
            cleanup('startup timeout');
            reject(error);
        }, SERVER_STARTUP_TIMEOUT);
        
        // Register cleanup handlers
        process.once('unhandledRejection', (reason) => {
            console.error('⚠️  Unhandled rejection during server startup:', reason);
            cleanup('unhandled rejection');
        });
        
        process.once('rejectionHandled', () => {
            console.log('ℹ️  Rejection was handled');
            cleanup('rejection handled');
        });
        
        // Set a timeout for the HTTP server to start listening
        const httpStartTimeout = setTimeout(() => {
            const error = new Error(`HTTP server failed to start listening after ${(Date.now() - startTime) / 1000} seconds`);
            error.code = 'HTTP_STARTUP_TIMEOUT';
            
            // Log the error
            console.error(`❌ ${error.message}`);
            
            // Post warning to UI for display
            postWarningToUI('HTTP server startup timeout', {
                timeElapsed: `${(Date.now() - startTime) / 1000}s`,
                port: PORT,
                serverListening: server?.listening
            }, 'http-startup');
            
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
                
                try {
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
                        tokenManager.getAccessToken(), // Assuming tokenManager.getAccessToken is the actual initialization
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
            } catch (addressError) {
                const error = new Error(`Failed to get server address: ${addressError.message}`);
                console.error(`❌ Server error: ${error.message}`);
                reject(error);
            }
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
                
                // Post error to UI for display
                postErrorToUI(errorMessage, {
                    code: error.code,
                    syscall: error.syscall,
                    address: error.address,
                    port: error.port
                }, 'server-error');
                
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
            
            // Post error to UI for display
            postErrorToUI(`Failed to start HTTP server: ${error.message}`, {
                code: error.code,
                stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
            }, 'server-startup');
            
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
            
            // Post error to UI for display
            postErrorToUI(`Server error during startup: ${error.message}`, {
                code: error.code,
                syscall: error.syscall,
                address: error.address,
                port: error.port
            }, 'server-startup');
            
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
                        errorMessage =
`================================================================================\n❌ Error: Port ${PORT} is already in use. Please stop the other process or use a different port.\n\nTo find and kill the process, run:\nlsof -i :${PORT} | grep LISTEN\nthen: kill -9 <PID>\n================================================================================`;
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
                
                // Post error to UI for display
                postErrorToUI(`Server startup failed: ${error.message}`, {
                    code: error.code,
                    syscall: error.syscall,
                    address: error.address,
                    port: error.port
                }, 'server-startup');
                
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
            
            // Post warning to UI for display
            postWarningToUI('Unhandled promise rejection', {
                reason: reason instanceof Error ? reason.message : reason.toString(),
                promise: promise.toString(),
                stack: reason instanceof Error ? reason.stack : undefined
            }, 'unhandled-rejection');
            
            // Post error to UI for display
            postErrorToUI(`Unhandled Rejection: ${reason}`, {
                promise: promise.toString(),
                reason: reason.toString()
            }, 'unhandled-rejection');
            
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
            
            // Post warning to UI for display
            postWarningToUI('Uncaught exception', {
                message: error.message,
                code: error.code,
                stack: error.stack
            }, 'uncaught-exception');
            
            // Post error to UI for display
            postErrorToUI(`Uncaught Exception: ${error.message}`, {
                stack: error.stack,
                code: error.code
            }, 'uncaught-exception');
            
            // In production, you might want to restart the server or take other actions
            if (process.env.NODE_ENV === 'production') {
                // Consider implementing a more robust error recovery strategy here
                console.error('⚠️  Uncaught exception in production. Consider implementing error recovery.');
                process.exit(1); // Exit with failure
            }
        });
        
        // Set a timeout for server startup (using proper timeout mechanism)
        const startupTimeout = setTimeout(() => {
            if (isResolved) return;
            
            const error = new Error('Server startup timed out');
            console.error('Server startup timed out');
            
            // Post warning to UI for display
            postWarningToUI('Server startup timed out', {
                timeout: 5000,
                message: 'Server startup process exceeded timeout limit'
            }, 'server-startup');
            
            reject(error);
        }, 5000);
        
        // Clear the startup timeout when server starts successfully
        server.on('listening', () => {
            clearTimeout(startupTimeout);
        });
    });
};

// Function to post errors to UI logs for display on screen
const postErrorToUI = async (message, details = {}, source = 'server') => {
    try {
        const response = await fetch(`http://localhost:${PORT}/api/logs/error`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message,
                details,
                source
            })
        });
        
        if (!response.ok) {
            console.error('Failed to post error to UI:', response.statusText);
        }
    } catch (error) {
        console.error('Error posting to UI logs:', error.message);
    }
};

// Function to post warnings to UI logs for display on screen
const postWarningToUI = async (message, details = {}, source = 'server') => {
    try {
        const response = await fetch(`http://localhost:${PORT}/api/logs/warning`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message,
                details,
                source
            })
        });
        
        if (!response.ok) {
            console.error('Failed to post warning to UI:', response.statusText);
        }
    } catch (error) {
        console.error('Error posting to UI logs:', error.message);
    }
};

// --- Custom Queue Manager for Export/Import Operations ---
class RequestQueue {
    constructor(maxConcurrent = 5, maxQueueSize = 100) {
        this.maxConcurrent = maxConcurrent;
        this.maxQueueSize = maxQueueSize;
        this.queue = [];
        this.running = 0;
        this.processing = false;
    }

    async add(task, priority = 0) {
        return new Promise((resolve, reject) => {
            if (this.queue.length >= this.maxQueueSize) {
                reject(new Error('Queue is full'));
                return;
            }

            const queueItem = {
                task,
                priority,
                resolve,
                reject,
                timestamp: Date.now()
            };

            // Insert based on priority (higher priority first)
            let inserted = false;
            for (let i = 0; i < this.queue.length; i++) {
                if (this.queue[i].priority < priority) {
                    this.queue.splice(i, 0, queueItem);
                    inserted = true;
                    break;
                }
            }
            if (!inserted) {
                this.queue.push(queueItem);
            }

            this.process();
        });
    }

    async process() {
        if (this.processing || this.running >= this.maxConcurrent) {
            return;
        }

        this.processing = true;

        while (this.queue.length > 0 && this.running < this.maxConcurrent) {
            const item = this.queue.shift();
            this.running++;

            try {
                const result = await item.task();
                item.resolve(result);
            } catch (error) {
                item.reject(error);
            } finally {
                this.running--;
            }
        }

        this.processing = false;
    }

    getStats() {
        return {
            queueLength: this.queue.length,
            running: this.running,
            maxConcurrent: this.maxConcurrent,
            maxQueueSize: this.maxQueueSize
        };
    }
}

// Create queue instances
const exportQueue = new RequestQueue(3, 50); // 3 concurrent exports, max 50 queued
const importQueue = new RequestQueue(2, 30); // 2 concurrent imports, max 30 queued
const apiQueue = new RequestQueue(10, 100); // 10 concurrent API calls, max 100 queued


// List all registered routes before starting the server
if (process.env.NODE_ENV !== 'production') {
    listRoutes(app);
}

// Start the server
const serverPromise = startServer().catch(error => {
    console.error('Fatal error during server startup:', error);
    process.exit(1);
});

// Export for testing and for use with require()
// Export at the top level for ES modules
let testServer;
if (process.env.NODE_ENV === 'test') {
    testServer = {
        then: async (resolve) => {
            const server = await serverPromise;
            resolve({ app, server });
        }
    };
}
export { app };
export { testServer };
export default app;

console.log("Server running - version 4.9");
