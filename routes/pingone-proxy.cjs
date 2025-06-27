const express = require('express');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const router = express.Router();

// PingOne API base URLs by region
const PINGONE_API_BASE_URLS = {
    'NorthAmerica': 'https://api.pingone.com',
    'Europe': 'https://api.eu.pingone.com',
    'Canada': 'https://api.ca.pingone.com',
    'Asia': 'https://api.apsoutheast.pingone.com',
    'Australia': 'https://api.aus.pingone.com'
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
        console.log('=== Starting proxyRequest ===');
        console.log('Request path:', req.path);
        console.log('Request method:', req.method);
        
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
        
        // Add Authorization header if we have credentials
        if (req.settings.apiClientId && req.settings.apiSecret) {
            console.log('Using API credentials for authentication');
            
            // For PingOne API, we need to get an access token first
            const tokenUrl = `https://auth.pingone.com/${req.settings.environmentId}/as/token`;
            const auth = Buffer.from(`${req.settings.apiClientId}:${req.settings.apiSecret}`).toString('base64');
            
            try {
                console.log('Requesting access token...');
                const tokenResponse = await fetch(tokenUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `Basic ${auth}`
                    },
                    body: 'grant_type=client_credentials'
                });
                
                if (!tokenResponse.ok) {
                    const errorData = await tokenResponse.text();
                    console.error('Failed to get access token:', errorData);
                    throw new Error('Failed to authenticate with PingOne API');
                }
                
                const tokenData = await tokenResponse.json();
                console.log('Successfully obtained access token');
                
                // Use the access token for the API request
                headers['Authorization'] = `Bearer ${tokenData.access_token}`;
                console.log('Authorization header set with Bearer token');
                
            } catch (error) {
                console.error('Error obtaining access token:', error);
                throw error;
            }
        } else {
            console.warn('No API credentials provided');
            return res.status(401).json({ error: 'API credentials are required' });
        }
        
        console.log('Request headers:', JSON.stringify(headers, null, 2));
        
        // Prepare the request body
        let requestBody;
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            // If the content type is for user import, use the raw body
            if (headers['Content-Type'] === 'application/vnd.pingone.import.users+json') {
                // Log the raw body for debugging
                console.log('Raw body for user import:', req.rawBody ? 'exists' : 'missing');
                
                // If we have a raw body, use it directly
                if (req.rawBody) {
                    requestBody = req.rawBody;
                } 
                // Otherwise, construct the expected format from the parsed body
                else if (req.body) {
                    requestBody = JSON.stringify({
                        users: Array.isArray(req.body) ? req.body : [req.body]
                    });
                }
                
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
            
            // Set response headers
            res.status(response.status);
            response.headers.forEach((value, key) => {
                if (key.toLowerCase() !== 'content-encoding' && key.toLowerCase() !== 'content-length') {
                    res.setHeader(key, value);
                }
            });
            
            // Handle different response types
            if (contentType.includes('application/json')) {
                try {
                    const data = await response.json();
                    console.log('Successfully parsed JSON response');
                    return res.json(data);
                } catch (e) {
                    console.error('Error parsing JSON response:', e);
                    const text = await response.text();
                    console.error('Response text:', text);
                    return res.status(500).json({
                        error: 'Invalid JSON response',
                        details: e.message,
                        response: text
                    });
                }
            } else if (contentType.includes('text/')) {
                const text = await response.text();
                console.log('Sending text response');
                return res.send(text);
            } else {
                // For binary data or other content types, pipe the response
                console.log('Piping binary/unknown response');
                response.body.pipe(res);
                return;
            }
        } catch (error) {
            clearTimeout(timeoutId);
            console.error('Fetch error:', error);
            
            if (error.name === 'AbortError') {
                return res.status(504).json({
                    error: 'Request Timeout',
                    message: 'The request to PingOne API timed out after 30 seconds'
                });
            }
            
            throw error; // Let the error handler deal with it
        }
    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).json({
            error: 'Proxy error',
            message: error.message
        });
    }
};

// Apply middleware and routes
// Save raw body for user import requests
router.use((req, res, next) => {
    if (req.headers['content-type'] === 'application/vnd.pingone.import.users+json') {
        let data = '';
        req.on('data', chunk => {
            data += chunk;
        });
        req.on('end', () => {
            req.rawBody = data;
            try {
                req.body = JSON.parse(data);
                next();
            } catch (e) {
                next(e);
            }
        });
    } else {
        express.json()(req, res, next);
    }
});

router.use(injectSettings);
router.use(validateSettings);

// Proxy all requests to PingOne API
router.all('*', proxyRequest);

// Export the router using ES modules
module.exports = router;
