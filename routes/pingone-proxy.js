import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import winston from 'winston';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a logger instance for this module
const logger = winston.createLogger({
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
        service: 'pingone-proxy',
        env: process.env.NODE_ENV || 'development'
    },
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(({ timestamp, level, message, ...meta }) => {
                    const metaString = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
                    return `[${timestamp}] ${level}: ${message}${metaString}\n${'*'.repeat(80)}`;
                })
            )
        }),
        // Add file transports for proper logging
        new winston.transports.File({
            filename: 'logs/combined.log',
            level: 'info'
        }),
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error'
        })
    ]
});

// PingOne API specific rate limiter (more permissive for better user experience)
const pingoneApiLimiter = rateLimit({
    windowMs: 1000, // 1 second
    max: 150, // Increased from 90 to 150 requests per second for PingOne API calls
    message: {
        error: 'PingOne API rate limit exceeded',
        message: 'Too many PingOne API requests. Please wait before trying again.',
        retryAfter: 1
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger.warn('PingOne API rate limit exceeded', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.path
        });
        res.status(429).json({
            error: 'PingOne API rate limit exceeded',
            message: 'Too many PingOne API requests. Please wait before trying again.',
            retryAfter: 1
        });
    },
    // Burst handling for PingOne API
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    // Allow burst of up to 600 requests in first 1000ms for export/import operations (4x the base limit)
    burstLimit: 600,
    burstWindowMs: 1000,
    // Queue configuration for PingOne API calls
    queue: {
        enabled: true,
        maxQueueSize: 600, // Increased from 400 to 600
        maxQueueTime: 60000, // Increased from 45 to 60 seconds
        retryAfter: 2 // Wait 2 seconds before retry
    }
});

const router = express.Router();

// Path to settings file
const SETTINGS_PATH = path.join(process.cwd(), "data/settings.json");

// PingOne API base URLs by region
const PINGONE_API_BASE_URLS = {
    'NorthAmerica': 'https://api.pingone.com',
    'Europe': 'https://api.eu.pingone.com',
    'Canada': 'https://api.ca.pingone.com',
    'Asia': 'https://api.apsoutheast.pingone.com',
    'Australia': 'https://api.aus.pingone.com',
    'US': 'https://api.pingone.com',
    'EU': 'https://api.eu.pingone.com',
    'AP': 'https://api.apsoutheast.pingone.com',
    'default': 'https://api.pingone.com'
};

// Helper function to read settings from file
async function readSettingsFromFile() {
    try {
        const data = await fs.readFile(SETTINGS_PATH, "utf8");
        return JSON.parse(data);
    } catch (error) {
        if (error.code === "ENOENT") {
            // Return empty settings if file doesn't exist
            return {};
        }
        throw error;
    }
}

// Helper function to read settings from environment variables
function readSettingsFromEnv() {
    return {
        environmentId: process.env.PINGONE_ENVIRONMENT_ID || "",
        region: process.env.PINGONE_REGION || "NorthAmerica",
        apiClientId: process.env.PINGONE_CLIENT_ID || "",
        apiSecret: process.env.PINGONE_CLIENT_SECRET || ""
    };
}

// Validate settings middleware
const validateSettings = (req, res, next) => {
    const { environmentId, apiClientId, apiSecret } = req.settings;
    
    if (!environmentId || !apiClientId || !apiSecret) {
        return res.status(400).json({
            error: 'Missing Configuration',
            message: 'PingOne configuration is incomplete. Please configure your settings.',
            missing: {
                environmentId: !environmentId,
                apiClientId: !apiClientId,
                apiSecret: !apiSecret
            }
        });
    }
    
    next();
};

// Extract environment ID from URL path
const extractEnvironmentId = (path) => {
    const match = path.match(/\/environments\/([^\/]+)/);
    return match ? match[1] : null;
};

// Inject settings middleware
const injectSettings = async (req, res, next) => {
    try {
        logger.info('=== Starting injectSettings ===');
        
        // Extract environment ID from URL if present
        const envIdFromUrl = extractEnvironmentId(req.path);
        
        // Read settings from file first
        let fileSettings = {};
        try {
            fileSettings = await readSettingsFromFile();
            logger.info('Settings loaded from file');
        } catch (error) {
            logger.info('No settings file found, using environment variables');
        }
        
        // Read settings from environment variables
        const envSettings = readSettingsFromEnv();
        
        // Initialize settings with file settings first, then environment variables as fallback
        // For API secret, prioritize environment variables to avoid encrypted values
        req.settings = {
            environmentId: envIdFromUrl || fileSettings.environmentId || envSettings.environmentId || '',
            region: fileSettings.region || envSettings.region || 'NorthAmerica',
            apiClientId: fileSettings.apiClientId || envSettings.apiClientId || '',
            apiSecret: envSettings.apiSecret || fileSettings.apiSecret || '' // Prioritize env for API secret
        };

        logger.info('Initial settings (from file/env):', {
            environmentId: req.settings.environmentId ? '***' + req.settings.environmentId.slice(-4) : 'not set',
            region: req.settings.region,
            apiClientId: req.settings.apiClientId ? '***' + req.settings.apiClientId.slice(-4) : 'not set',
            apiSecret: req.settings.apiSecret ? '***' + req.settings.apiSecret.slice(-4) : 'not set'
        });

        logger.debug('Session data:', req.session || {});
        logger.debug('Request body:', req.body || {});

        // Get settings from session if available (lowest priority)
        if (req.session) {
            // Only override environmentId from session if not in URL and not set from file/env
            if (!envIdFromUrl && !fileSettings.environmentId && !envSettings.environmentId) {
                req.settings.environmentId = req.session.environmentId || req.settings.environmentId;
            }
            req.settings.region = req.session.region || req.settings.region;
            req.settings.apiClientId = req.session.apiClientId || req.settings.apiClientId;
            req.settings.apiSecret = req.session.apiSecret || req.settings.apiSecret;
        }

        // Override with body parameters if provided (lowest priority)
        if (req.body) {
            // Only override environmentId from body if not in URL and not set from file/env
            if (!envIdFromUrl && !fileSettings.environmentId && !envSettings.environmentId) {
                req.settings.environmentId = req.body.environmentId || req.settings.environmentId;
            }
            req.settings.region = req.body.region || req.settings.region;
            req.settings.apiClientId = req.body.apiClientId || req.settings.apiClientId;
            req.settings.apiSecret = req.body.apiSecret || req.settings.apiSecret;
        }
        
        // Log final settings (masking sensitive data)
        logger.info('Final settings:', {
            environmentId: req.settings.environmentId ? '***' + req.settings.environmentId.slice(-4) : 'not set',
            region: req.settings.region,
            apiClientId: req.settings.apiClientId ? '***' + req.settings.apiClientId.slice(-4) : 'not set',
            apiSecret: req.settings.apiSecret ? '***' + req.settings.apiSecret.slice(-4) : 'not set',
            hasCredentials: !!(req.settings.apiClientId && req.settings.apiSecret)
        });
        
        logger.info('=== Ending injectSettings ===');
        next();
    } catch (error) {
        logger.error('Error in injectSettings middleware:', error);
        next(error);
    }
};

// Proxy middleware
const proxyRequest = async (req, res) => {
    try {
        logger.info('=== Starting proxyRequest ===');
        logger.info('Request path:', req.path);
        logger.info('Request method:', req.method);
        logger.debug('Request headers:', req.headers);
        logger.debug('Request body type:', typeof req.body);
        logger.debug('Request rawBody exists:', !!req.rawBody);
        if (req.rawBody) {
            logger.debug('Raw body length:', req.rawBody.length);
            logger.debug('Raw body start:', req.rawBody.substring(0, 200) + (req.rawBody.length > 200 ? '...' : ''));
        }
        
        const { environmentId, region } = req.settings;
        logger.info('Using environmentId:', environmentId);
        logger.info('Using region:', region);
        
        const baseUrl = PINGONE_API_BASE_URLS[region];
        logger.info('Base URL:', baseUrl);
        
        if (!baseUrl) {
            throw new Error(`Invalid region: ${region}`);
        }
        
        // Construct the target URL
        const targetPath = req.path.replace(/^\/api\/pingone/, '');
        
        // For certain endpoints, we need to inject the environment ID if not already present
        let finalPath = targetPath;
        if (!finalPath.includes('/environments/')) {
            // These endpoints require environment ID in the path
            const environmentScopedEndpoints = [
                '/populations',
                '/users',
                '/applications',
                '/groups',
                '/roles',
                '/schemas',
                '/resources'
            ];
            
            const needsEnvironmentId = environmentScopedEndpoints.some(endpoint => 
                finalPath.startsWith(endpoint) || finalPath.includes(endpoint));
            
            if (needsEnvironmentId) {
                finalPath = `/environments/${environmentId}${targetPath}`;
            }
        }
        
        const targetUrl = new URL(`${baseUrl}/v1${finalPath}`);
        logger.info('Target URL:', targetUrl.toString());
        
        // Forward query parameters
        Object.entries(req.query).forEach(([key, value]) => {
            targetUrl.searchParams.append(key, value);
        });
        
        // Prepare headers
        const headers = {
            'Content-Type': req.get('Content-Type') || 'application/json',
            'Accept': 'application/json',
            'X-Correlation-ID': req.get('X-Correlation-ID') || crypto.randomUUID()
        };
        
        // Use the server's token manager for authentication
        try {
            logger.info('Getting access token from server token manager...');
            const tokenManager = req.app.get('tokenManager');
            if (!tokenManager) {
                throw new Error('Token manager not available');
            }
            
            const token = await tokenManager.getAccessToken();
            logger.info('Successfully obtained access token from token manager');
            
            // Use the access token for the API request
            headers['Authorization'] = `Bearer ${token}`;
            logger.info('Authorization header set with Bearer token');
            
        } catch (error) {
            logger.error('Error obtaining access token from token manager:', error);
            
            // Post error to UI for display
            try {
                const response = await fetch(`http://localhost:${process.env.PORT || 4000}/api/logs/error`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        message: `PingOne API authentication failed: ${error.message}`,
                        details: {
                            error: error.message,
                            endpoint: req.path,
                            method: req.method
                        },
                        source: 'pingone-api'
                    })
                });
                
                if (!response.ok) {
                    logger.error('Failed to post error to UI:', response.statusText);
                }
            } catch (uiError) {
                logger.error('Error posting to UI logs:', uiError.message);
            }
            
            // Return a proper error response instead of throwing
            res.status(403).json({
                error: 'Authentication failed',
                message: error.message,
                details: {
                    endpoint: req.path,
                    method: req.method
                }
            });
            return;
        }
        
        // Prepare request body
        let requestBody = null;
        
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            if (req.body) {
                // For regular JSON requests, stringify the body
                if (headers['Content-Type'] === 'application/json') {
                    requestBody = JSON.stringify(req.body);
                    logger.info('Request body prepared for JSON request, length:', requestBody ? requestBody.length : 0);
                    logger.debug('Request body content:', req.body);
                }
                // For other content types, send as-is (e.g., FormData)
                else {
                    requestBody = req.body;
                }
            }
        }
        
        // Forward the request with a timeout
        logger.info('Sending request to PingOne API...');
        
        // Comprehensive request logging
        const requestLog = {
            type: 'api_request',
            method: req.method,
            url: targetUrl.toString(),
            headers: {
                'Content-Type': headers['Content-Type'],
                'Accept': headers['Accept'],
                'Authorization': headers['Authorization'] ? 'Bearer ***' : 'None',
                'X-Correlation-ID': headers['X-Correlation-ID']
            },
            body: requestBody ? (typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody) : null,
            timestamp: new Date().toISOString(),
            requestId: req.requestId,
            clientIp: req.ip,
            userAgent: req.get('user-agent'),
            source: 'pingone-proxy'
        };
        
        logger.info('🔄 PingOne API Request:', requestLog);
        
        // Also send to UI logs for display
        try {
            await fetch(`http://localhost:${process.env.PORT || 4000}/api/logs/info`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: `PingOne API Request: ${req.method} ${targetUrl.toString()}`,
                    details: requestLog,
                    source: 'pingone-proxy'
                })
            });
        } catch (logError) {
            console.warn('Failed to send request log to UI:', logError);
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        try {
            const response = await fetch(targetUrl.toString(), {
                method: req.method,
                headers,
                body: requestBody,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            logger.info('Received response with status:', response.status);
            logger.debug('Response headers:', [...response.headers.entries()]);
            
            // Check for error status codes and post to UI logs
            if (!response.ok) {
                let errorData = {};
                try {
                    const contentType = response.headers.get('content-type') || '';
                    if (contentType.includes('application/json')) {
                        errorData = await response.json();
                    } else {
                        errorData = { message: await response.text() };
                    }
                } catch (parseError) {
                    errorData = { message: 'Failed to parse error response' };
                }
                
                // Check if this is a uniqueness violation (user already exists)
                const isUniquenessViolation = response.status === 400 && 
                    errorData.code === 'INVALID_DATA' && 
                    errorData.details && 
                    errorData.details.some(detail => detail.code === 'UNIQUENESS_VIOLATION' && detail.target === 'username');
                
                if (isUniquenessViolation) {
                    // Extract username from request body for friendly message
                    let username = 'unknown';
                    try {
                        if (req.body && req.body.username) {
                            username = req.body.username;
                        }
                    } catch (e) {
                        // Ignore parsing errors
                    }
                    
                    const friendlyMessage = `User '${username}' already exists in PingOne. Skipping this user.`;
                    
                    // Post warning to UI for display
                    try {
                        const uiResponse = await fetch(`http://localhost:${process.env.PORT || 4000}/api/logs/warning`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                message: friendlyMessage,
                                details: {
                                    status: response.status,
                                    statusText: response.statusText,
                                    error: errorData,
                                    endpoint: req.path,
                                    method: req.method,
                                    url: targetUrl.toString(),
                                    username: username
                                },
                                source: 'pingone-api'
                            })
                        });
                        
                        if (!uiResponse.ok) {
                            logger.warn('Failed to post warning to UI:', uiResponse.statusText);
                        }
                    } catch (uiError) {
                        logger.warn('Error posting to UI logs:', uiError.message);
                    }
                    
                    // Log the warning to console as well
                    logger.warn(friendlyMessage, errorData);
                    
                    // Return a success response with warning message
                    res.status(200).json({
                        success: true,
                        warning: true,
                        message: friendlyMessage,
                        details: {
                            username: username,
                            reason: 'User already exists',
                            originalError: errorData
                        }
                    });
                    return;
                } else {
                    // Check if this is a 403 authentication error (wrong API secret)
                    let friendlyMessage = `PingOne API request failed with status ${response.status}: ${errorData.message || 'Unknown error'}`;
                    
                    if (response.status === 403) {
                        // Check for specific authentication error messages
                        const errorMessage = errorData.message || '';
                        if (errorMessage.includes('Invalid key=value pair') || 
                            errorMessage.includes('Authorization header') ||
                            errorMessage.includes('authentication') ||
                            errorMessage.includes('credentials')) {
                            friendlyMessage = '🔐 Authentication Failed: Your API Client Secret appears to be incorrect. Please check your PingOne settings and make sure you\'re using the correct Client Secret.';
                        } else {
                            friendlyMessage = '🚫 Access Denied: You don\'t have permission to access this resource. Please check your PingOne configuration and permissions.';
                        }
                    } else if (response.status === 401) {
                        friendlyMessage = '🔑 Authentication Required: Your API credentials are invalid or expired. Please check your PingOne Client ID and Secret.';
                    } else if (response.status === 400) {
                        friendlyMessage = '⚠️ Bad Request: There was an issue with your request. Please check the data you\'re trying to send.';
                    } else if (response.status === 404) {
                        friendlyMessage = '🔍 Not Found: The requested resource was not found. Please check your Environment ID and endpoint.';
                    } else if (response.status === 429) {
                        friendlyMessage = '⏰ Rate Limited: Too many requests. Please wait a moment before trying again.';
                    } else if (response.status >= 500) {
                        friendlyMessage = '🔧 Server Error: PingOne is experiencing technical difficulties. Please try again later.';
                    }
                    
                    // Post error to UI for display (for non-uniqueness violations)
                    try {
                        const uiResponse = await fetch(`http://localhost:${process.env.PORT || 4000}/api/logs/error`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                message: friendlyMessage,
                                details: {
                                    status: response.status,
                                    statusText: response.statusText,
                                    error: errorData,
                                    endpoint: req.path,
                                    method: req.method,
                                    url: targetUrl.toString(),
                                    originalMessage: errorData.message || 'Unknown error'
                                },
                                source: 'pingone-api'
                            })
                        });
                        
                        if (!uiResponse.ok) {
                            logger.error('Failed to post error to UI:', uiResponse.statusText);
                        }
                    } catch (uiError) {
                        logger.error('Error posting to UI logs:', uiError.message);
                    }
                    
                    // Log the error to console as well
                    logger.error(`PingOne API request failed: ${response.status} ${response.statusText}`, errorData);
                }
            }
            
            // Get the content type
            const contentType = response.headers.get('content-type') || '';
            
            try {
                // Handle different content types
                let responseData;
                
                if (contentType.includes('application/json')) {
                    responseData = await response.json().catch(() => ({}));
                } else {
                    responseData = await response.text();
                }
                
                // Comprehensive response logging
                const responseLog = {
                    type: 'api_response',
                    status: response.status,
                    statusText: response.statusText,
                    url: targetUrl.toString(),
                    method: req.method,
                    headers: Object.fromEntries([...response.headers.entries()]),
                    data: responseData,
                    timestamp: new Date().toISOString(),
                    duration: Date.now() - req.startTime,
                    requestId: req.requestId,
                    contentType: contentType,
                    source: 'pingone-proxy'
                };
                
                logger.info('✅ PingOne API Response:', responseLog);
                logger.info(`[${req.requestId}] Response status: ${response.status} (${Date.now() - req.startTime}ms)`);
                
                // Also send to UI logs for display
                try {
                    await fetch(`http://localhost:${process.env.PORT || 4000}/api/logs/info`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            message: `PingOne API Response: ${response.status} ${req.method} ${targetUrl.toString()}`,
                            details: responseLog,
                            source: 'pingone-proxy'
                        })
                    });
                } catch (logError) {
                    console.warn('Failed to send response log to UI:', logError);
                }
                
                // Forward the response with appropriate headers and status
                const resHeaders = {
                    ...Object.fromEntries([...response.headers.entries()]),
                    'access-control-allow-origin': '*',
                    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'access-control-allow-headers': 'Content-Type, Authorization, X-Requested-With'
                };
                
                // Remove problematic headers
                delete resHeaders['content-encoding'];
                delete resHeaders['transfer-encoding'];
                
                res.status(response.status)
                    .set(resHeaders);
                    
                if (typeof responseData === 'string') {
                    res.send(responseData);
                } else {
                    res.json(responseData);
                }
            } catch (error) {
                logger.error(`[${req.requestId}] Error:`, error);
                
                // Post error to UI for display
                try {
                    const uiResponse = await fetch(`http://localhost:${process.env.PORT || 4000}/api/logs/error`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            message: `PingOne API response parsing error: ${error.message}`,
                            details: {
                                error: error.message,
                                endpoint: req.path,
                                method: req.method,
                                requestId: req.requestId
                            },
                            source: 'pingone-proxy'
                        })
                    });
                    
                    if (!uiResponse.ok) {
                        console.error('Failed to post error to UI:', uiResponse.statusText);
                    }
                } catch (uiError) {
                    console.error('Error posting to UI logs:', uiError.message);
                }
                
                res.status(500).json({
                    error: 'Proxy Error',
                    message: error.message,
                    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
                });
            }
        } catch (error) {
            console.error(`[${req.requestId}] Error:`, error);
            
            // Post error to UI for display
            try {
                const uiResponse = await fetch(`http://localhost:${process.env.PORT || 4000}/api/logs/error`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        message: `PingOne API proxy error: ${error.message}`,
                        details: {
                            error: error.message,
                            endpoint: req.path,
                            method: req.method,
                            requestId: req.requestId
                        },
                        source: 'pingone-proxy'
                    })
                });
                
                if (!uiResponse.ok) {
                    console.error('Failed to post error to UI:', uiResponse.statusText);
                }
            } catch (uiError) {
                console.error('Error posting to UI logs:', uiError.message);
            }
            
            res.status(500).json({
                error: 'Proxy Error',
                message: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    } catch (error) {
        console.error('Error in proxyRequest middleware:', error);
        
        // Post error to UI for display
        try {
            const uiResponse = await fetch(`http://localhost:${process.env.PORT || 4000}/api/logs/error`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: `PingOne API proxy middleware error: ${error.message}`,
                    details: {
                        error: error.message,
                        endpoint: req.path,
                        method: req.method
                    },
                    source: 'pingone-proxy'
                })
            });
            
            if (!uiResponse.ok) {
                console.error('Failed to post error to UI:', uiResponse.statusText);
            }
        } catch (uiError) {
            console.error('Error posting to UI logs:', uiError.message);
        }
        
        res.status(500).json({
            error: 'Proxy Error',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

// Apply middleware and routes
// Note: express.json() is already applied by the main server

// Apply CORS headers to all responses
router.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'http://localhost:4000');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-PingOne-Environment-Id, X-PingOne-Region');
    res.header('Access-Control-Allow-Credentials', 'true');
    next();
});

// Apply settings middleware
router.use(injectSettings);
router.use(validateSettings);

// Apply rate limiting middleware
router.use(pingoneApiLimiter);

// Handle specific endpoints that don't exist in PingOne API
router.get('/token', (req, res) => {
    res.status(404).json({
        error: 'Endpoint Not Found',
        message: 'The /token endpoint does not exist in the PingOne API. Use the server\'s token manager for authentication.',
        availableEndpoints: [
            '/environments/{environmentId}/users',
            '/environments/{environmentId}/populations',
            '/environments/{environmentId}/applications',
            '/environments/{environmentId}/groups'
        ]
    });
});

router.post('/token', (req, res) => {
    res.status(404).json({
        error: 'Endpoint Not Found',
        message: 'The /token endpoint does not exist in the PingOne API. Use the server\'s token manager for authentication.',
        availableEndpoints: [
            '/environments/{environmentId}/users',
            '/environments/{environmentId}/populations',
            '/environments/{environmentId}/applications',
            '/environments/{environmentId}/groups'
        ]
    });
});

// Proxy all other requests to PingOne API
router.all('*', proxyRequest);

// Export the router
export default router;
