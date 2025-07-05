import { Router } from 'express';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Enable CORS for all routes
router.use(cors({
    origin: 'http://localhost:4000',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-PingOne-Environment-Id', 'X-PingOne-Region'],
    credentials: true
}));

// Handle preflight requests
router.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', 'http://localhost:4000');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-PingOne-Environment-Id, X-PingOne-Region');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.status(200).end();
});

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
    'default': 'https://auth.pingone.com'
};

// Middleware to validate required settings
const validateSettings = (req, res, next) => {
    const { environmentId, region } = req.settings;
    
    if (!environmentId) {
        return res.status(400).json({ error: 'Environment ID is required' });
    }
    
    if (!region || !PINGONE_API_BASE_URLS[region]) {
        return res.status(400).json({ error: 'Valid region is required' });
    }
    
    next();
};

// Helper to extract environment ID from URL
const extractEnvironmentId = (path) => {
    const match = path.match(/\/environments\/([^\/]+)/);
    return match ? match[1] : null;
};

// Middleware to inject settings
const injectSettings = (req, res, next) => {
    try {
        console.log('=== Starting injectSettings ===');
        
        // Extract environment ID from URL if present
        const envIdFromUrl = extractEnvironmentId(req.path);
        
        // Initialize settings with default values from environment variables
        req.settings = {
            environmentId: envIdFromUrl || process.env.PINGONE_ENVIRONMENT_ID || '',
            region: process.env.PINGONE_REGION || 'NorthAmerica',
            apiClientId: process.env.PINGONE_CLIENT_ID || '',
            apiSecret: process.env.PINGONE_CLIENT_SECRET || ''
        };

        console.log('Initial settings (from env):', JSON.stringify({
            environmentId: req.settings.environmentId ? '***' + req.settings.environmentId.slice(-4) : 'not set',
            region: req.settings.region,
            apiClientId: req.settings.apiClientId ? '***' + req.settings.apiClientId.slice(-4) : 'not set',
            apiSecret: req.settings.apiSecret ? '***' + req.settings.apiSecret.slice(-4) : 'not set'
        }, null, 2));

        console.log('Session data:', JSON.stringify(req.session || {}, null, 2));
        console.log('Request body:', JSON.stringify(req.body || {}, null, 2));

        // Get settings from session if available
        if (req.session) {
            // Only override environmentId from session if not in URL and not set from env
            if (!envIdFromUrl && !process.env.PINGONE_ENVIRONMENT_ID) {
                req.settings.environmentId = req.session.environmentId || req.settings.environmentId;
            }
            req.settings.region = req.session.region || req.settings.region;
            req.settings.apiClientId = req.session.apiClientId || req.settings.apiClientId;
            req.settings.apiSecret = req.session.apiSecret || req.settings.apiSecret;
        }

        // Override with body parameters if provided (lowest priority)
        if (req.body) {
            // Only override environmentId from body if not in URL and not set from env
            if (!envIdFromUrl && !process.env.PINGONE_ENVIRONMENT_ID) {
                req.settings.environmentId = req.body.environmentId || req.settings.environmentId;
            }
            req.settings.region = req.body.region || req.settings.region;
            req.settings.apiClientId = req.body.apiClientId || req.settings.apiClientId;
            req.settings.apiSecret = req.body.apiSecret || req.settings.apiSecret;
        }
        
        // Log final settings (masking sensitive data)
        console.log('Final settings:', JSON.stringify({
            environmentId: req.settings.environmentId ? '***' + req.settings.environmentId.slice(-4) : 'not set',
            region: req.settings.region,
            apiClientId: req.settings.apiClientId ? '***' + req.settings.apiClientId.slice(-4) : 'not set',
            apiSecret: req.settings.apiSecret ? '***' + req.settings.apiSecret.slice(-4) : 'not set',
            hasCredentials: !!(req.settings.apiClientId && req.settings.apiSecret)
        }, null, 2));
        
        console.log('=== Ending injectSettings ===');
        next();
    } catch (error) {
        console.error('Error in injectSettings middleware:', error);
        next(error);
    }
};

// Proxy middleware
const proxyRequest = async (req, res) => {
    try {
        console.log('\n=== Starting proxyRequest ===');
        console.log('Request path:', req.path);
        console.log('Request method:', req.method);
        console.log('Request headers:', JSON.stringify(req.headers, null, 2));
        console.log('Request body type:', typeof req.body);
        console.log('Request rawBody exists:', !!req.rawBody);
        if (req.rawBody) {
            console.log('Raw body length:', req.rawBody.length);
            console.log('Raw body start:', req.rawBody.substring(0, 200) + (req.rawBody.length > 200 ? '...' : ''));
        }
        
        const { environmentId, region } = req.settings;
        console.log('Using environmentId:', environmentId);
        console.log('Using region:', region);
        
        const baseUrl = PINGONE_API_BASE_URLS[region];
        console.log('Base URL:', baseUrl);
        
        if (!baseUrl) {
            throw new Error(`Invalid region: ${region}`);
        }
        
        // Construct the target URL
        const targetPath = req.path.replace(/^\/api\/pingone/, '');
        const targetUrl = new URL(`${baseUrl}${targetPath}`);
        console.log('Target URL:', targetUrl.toString());
        
        // Forward query parameters
        Object.entries(req.query).forEach(([key, value]) => {
            targetUrl.searchParams.append(key, value);
        });
        
        // Prepare headers
        const headers = {
            'Content-Type': req.get('Content-Type') || 'application/json',
            'Accept': 'application/json',
            'X-Correlation-ID': req.get('X-Correlation-ID') || uuidv4()
        };
        
        // Use the server's token manager for authentication
        try {
            console.log('Getting access token from server token manager...');
            const tokenManager = req.app.get('tokenManager');
            if (!tokenManager) {
                throw new Error('Token manager not available');
            }
            
            const token = await tokenManager.getAccessToken();
            console.log('Successfully obtained access token from token manager');
            
            // Use the access token for the API request
            headers['Authorization'] = `Bearer ${token}`;
            console.log('Authorization header set with Bearer token');
            
        } catch (error) {
            console.error('Error obtaining access token from token manager:', error);
            throw new Error(`API request failed with status 403: ${error.message}`);
        }
        
        console.log('Request headers:', JSON.stringify(headers, null, 2));
        
        // Prepare the request body
        let requestBody;
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            // If the content type is for user import, use the raw body
            if (headers['Content-Type'] === 'application/vnd.pingone.import.users+json') {
                console.log('Processing user import request with content type:', headers['Content-Type']);
                console.log('Request body type:', typeof req.body);
                
                // If we have a raw body, use it directly
                if (req.rawBody) {
                    console.log('Using raw body from request');
                    requestBody = req.rawBody;
                } 
                // If body is already a string, use it as is
                else if (typeof req.body === 'string') {
                    console.log('Using string body as is');
                    requestBody = req.body;
                }
                // Otherwise, construct the expected format from the parsed body
                else if (req.body) {
                    console.log('Constructing request body from parsed body');
                    requestBody = JSON.stringify({
                        users: Array.isArray(req.body) ? req.body : [req.body]
                    });
                }
                
                console.log('Request body prepared, length:', requestBody ? requestBody.length : 0);
                // Ensure we have a valid request body
                if (!requestBody) {
                    throw new Error('No request body provided for user import');
                }
                
                console.log('Sending user import request with body:', requestBody);
            } 
            // For regular JSON requests, stringify the body
            else if (headers['Content-Type'] === 'application/json') {
                requestBody = JSON.stringify(req.body);
            }
            // For other content types, send as-is (e.g., FormData)
            else {
                requestBody = req.body;
            }
        }
        
        // Forward the request with a timeout
        console.log('Sending request to PingOne API...');
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
            
            console.log('Received response with status:', response.status);
            console.log('Response headers:', JSON.stringify([...response.headers.entries()], null, 2));
            
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
                
                console.log(`[${req.requestId}] Response status: ${response.status} (${Date.now() - req.startTime}ms)`);
                
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
                console.error(`[${req.requestId}] Error:`, error);
                res.status(500).json({
                    error: 'Proxy Error',
                    message: error.message,
                    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
                });
            }
        } catch (error) {
            console.error(`[${req.requestId}] Error:`, error);
            res.status(500).json({
                error: 'Proxy Error',
                message: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    } catch (error) {
        console.error('Error in proxyRequest middleware:', error);
        res.status(500).json({
            error: 'Proxy Error',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

// Apply middleware and routes
router.use(express.json());
router.use(express.text({ type: ['application/json', 'application/vnd.pingidentity.*+json'] }));

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

// Proxy all requests to PingOne API
router.all('*', proxyRequest);

// Export the router
export default router;
