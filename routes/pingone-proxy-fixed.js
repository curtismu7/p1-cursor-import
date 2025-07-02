import { Router } from 'express';
import fetch from 'node-fetch';
import { URL } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

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

// Middleware to inject settings
const injectSettings = (req, res, next) => {
    try {
        // Use environment variables for settings
        req.settings = {
            environmentId: process.env.PINGONE_ENVIRONMENT_ID || '',
            region: process.env.PINGONE_REGION || 'NorthAmerica',
            apiClientId: process.env.PINGONE_CLIENT_ID || '',
            apiSecret: process.env.PINGONE_CLIENT_SECRET || ''
        };
        next();
    } catch (error) {
        console.error('Error injecting settings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Proxy request handler
const proxyRequest = async (req, res) => {
    const requestId = uuidv4();
    const startTime = Date.now();
    
    try {
        // Check if URL is provided in query parameter
        const targetUrl = req.query.url;
        
        if (!targetUrl) {
            return res.status(400).json({ error: 'Target URL is required' });
        }
        
        // Determine if this is an auth request
        const isAuthRequest = targetUrl.includes('/as/token');
        
        console.log(`[${requestId}] Proxying to: ${targetUrl}`);
        
        // Prepare request headers - filter out unwanted headers
        const headers = {};
        
        // Copy only the headers we want to forward
        const allowedHeaders = [
            'accept',
            'accept-encoding',
            'authorization',
            'content-type',
            'x-request-id'
        ];
        
        // Add allowed headers from the original request
        Object.entries(req.headers).forEach(([key, value]) => {
            const lowerKey = key.toLowerCase();
            if (allowedHeaders.includes(lowerKey)) {
                headers[key] = value;
            }
        });
        
        // Add our own headers
        headers['x-request-id'] = requestId;
        headers['accept'] = 'application/json';
        
        // Handle authentication for token requests
        if (isAuthRequest && process.env.PINGONE_CLIENT_ID && process.env.PINGONE_CLIENT_SECRET) {
            const credentials = Buffer.from(`${process.env.PINGONE_CLIENT_ID}:${process.env.PINGONE_CLIENT_SECRET}`).toString('base64');
            headers['authorization'] = `Basic ${credentials}`;
        }
        
        // Prepare request options
        const options = {
            method: req.method,
            headers,
            timeout: 30000, // 30 second timeout
            redirect: 'follow'
        };
        
        // Add request body for applicable methods
        if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
            options.body = JSON.stringify(req.body);
        }
        
        // Make the request to PingOne API
        const response = await fetch(targetUrl, options);
        const responseTime = Date.now() - startTime;
        
        // Get response headers
        const responseHeaders = Object.fromEntries([...response.headers.entries()]);
        
        // Handle response based on content type
        const contentType = response.headers.get('content-type') || '';
        let responseData;
        
        if (contentType.includes('application/json')) {
            responseData = await response.json().catch(() => ({}));
        } else {
            responseData = await response.text();
        }
        
        console.log(`[${requestId}] Response status: ${response.status} (${responseTime}ms)`);
        
        // Set CORS headers
        res.set({
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'access-control-allow-headers': 'Content-Type, Authorization, X-Requested-With',
            ...responseHeaders
        });
        
        // Remove problematic headers
        res.removeHeader('content-encoding');
        res.removeHeader('transfer-encoding');
        
        // Send response
        if (typeof responseData === 'string') {
            res.status(response.status).send(responseData);
        } else {
            res.status(response.status).json(responseData);
        }
        
    } catch (error) {
        console.error(`[${requestId}] Error:`, error);
        res.status(500).json({
            error: 'Proxy Error',
            message: error.message,
            ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
        });
    }
};

// Apply middleware and routes
router.use(express.json());

// Only apply settings validation to non-auth requests
router.use((req, res, next) => {
    if (req.path !== '/as/token' && !req.query.url?.includes('/as/token')) {
        injectSettings(req, res, () => {
            validateSettings(req, res, next);
        });
    } else {
        next();
    }
});

// All requests go through the proxy handler
router.all('*', proxyRequest);

export default router;
