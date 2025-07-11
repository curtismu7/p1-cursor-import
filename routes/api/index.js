/**
 * @fileoverview Express API routes for PingOne user import tool
 * 
 * This module handles all backend API endpoints for the PingOne user import tool,
 * including user import/export/modify operations, real-time progress tracking via SSE,
 * population validation, and token management.
 * 
 * Key Features:
 * - CSV file upload and parsing
 * - User import with conflict resolution
 * - Real-time progress streaming via Server-Sent Events (SSE)
 * - Population validation and conflict handling
 * - User export in JSON/CSV formats
 * - User modification with batch processing
 * - Token management and authentication
 * - Feature flag management
 * 
 * @author PingOne Import Tool
 * @version 1.0.0
 */

import { Router } from 'express';
import multer from 'multer';
import { isFeatureEnabled, setFeatureFlag, getAllFeatureFlags, resetFeatureFlags } from '../../server/feature-flags.js';
import { v4 as uuidv4 } from 'uuid';

// Feature flags configuration object for easy access
const featureFlags = {
  isFeatureEnabled,
  setFeatureFlag,
  getAllFeatureFlags,
  resetFeatureFlags,
};

const router = Router();

// Enable debug logging in development mode
const DEBUG_MODE = process.env.NODE_ENV === 'development';

/**
 * Debug logging utility for server-side diagnostics
 * Provides structured logging with timestamps and area categorization
 * Only active in development mode to avoid production noise
 * 
 * @param {string} area - Log area/tag for categorization (e.g., 'Import', 'SSE', 'User')
 * @param {string} message - Human-readable log message
 * @param {any} data - Optional data object for detailed debugging
 */
function debugLog(area, message, data = null) {
    if (!DEBUG_MODE) return;
    const timestamp = new Date().toISOString();
    const formatted = `[DEBUG - ${area}] ${message}`;
    if (data !== null) {
        console.log(`${timestamp} ${formatted}`, data);
    } else {
        console.log(`${timestamp} ${formatted}`);
    }
}

/**
 * Configure multer for secure file uploads
 * Uses memory storage for processing CSV files with 10MB size limit
 * This prevents disk I/O and allows direct buffer access for parsing
 */
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit - sufficient for most CSV files
    }
});

// ============================================================================
// FEATURE FLAGS MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * GET /api/feature-flags
 * Retrieves all current feature flags and their states
 * Used by frontend to display and manage feature toggle UI
 */
router.get('/feature-flags', (req, res) => {
    try {
        const flags = featureFlags.getAllFeatureFlags();
        res.json({ success: true, flags });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get feature flags', details: error.message });
    }
});

/**
 * POST /api/feature-flags/:flag
 * Updates a specific feature flag's enabled state
 * 
 * @param {string} flag - Feature flag name to update
 * @param {boolean} enabled - New enabled state for the flag
 */
router.post('/feature-flags/:flag', (req, res) => {
    try {
        const { flag } = req.params;
        const { enabled } = req.body;
        
        // Validate that enabled is a boolean value
        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ error: 'enabled must be a boolean' });
        }
        
        featureFlags.setFeatureFlag(flag, enabled);
        res.json({ success: true, flag, enabled });
    } catch (error) {
        res.status(500).json({ error: 'Failed to set feature flag', details: error.message });
    }
});

/**
 * POST /api/feature-flags/reset
 * Resets all feature flags to their default values
 * Useful for testing or when configuration gets corrupted
 */
router.post('/feature-flags/reset', (req, res) => {
    try {
        featureFlags.resetFeatureFlags();
        res.json({ success: true, message: 'Feature flags reset to defaults' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reset feature flags', details: error.message });
    }
});

// ============================================================================
// USER EXPORT ENDPOINT
// ============================================================================

/**
 * POST /api/export-users
 * Exports users from PingOne in JSON or CSV format with optional filtering
 * 
 * This endpoint fetches users from PingOne API, applies population filtering,
 * processes field selection (basic/custom/all), and returns data in the requested format.
 * 
 * @param {string} populationId - Population ID to filter users (empty string for all populations)
 * @param {string} fields - Field selection: 'basic', 'custom', or 'all'
 * @param {string} format - Output format: 'json' or 'csv'
 * @param {boolean|string} ignoreDisabledUsers - Whether to exclude disabled users
 * 
 * @returns {Object} JSON response with processed user data or CSV file download
 */
router.post('/export-users', async (req, res, next) => {
    try {
        const { populationId, fields, format, ignoreDisabledUsers } = req.body;
        
        // Convert ignoreDisabledUsers to boolean if it's a string (handles form data)
        const shouldIgnoreDisabledUsers = ignoreDisabledUsers === true || ignoreDisabledUsers === 'true';
        
        // Validate required population ID parameter
        if (!populationId && populationId !== '') {
            return res.status(400).json({
                error: 'Missing population ID',
                message: 'Population ID is required for export'
            });
        }

        // Build PingOne API URL with population filtering and population details expansion
        // This ensures we get complete user data including population information
        let pingOneUrl = 'http://127.0.0.1:4000/api/pingone/users';
        const params = new URLSearchParams();
        
        // Add population filter if specified (empty string means all populations)
        if (populationId && populationId.trim() !== '') {
            params.append('population.id', populationId.trim());
        }
        
        // Always expand population details to get population name and ID in response
        params.append('expand', 'population');
        
        // Append query parameters if any exist
        if (params.toString()) {
            pingOneUrl += `?${params.toString()}`;
        }

        const pingOneResponse = await fetch(pingOneUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!pingOneResponse.ok) {
            const errorData = await pingOneResponse.json().catch(() => ({}));
            return res.status(pingOneResponse.status).json({
                error: 'Failed to fetch users from PingOne',
                message: errorData.message || `HTTP ${pingOneResponse.status}`,
                details: errorData
            });
        }

        let users = await pingOneResponse.json();
        
        // Handle PingOne API response format variations
        // PingOne can return users directly as array or nested in _embedded.users
        if (users._embedded && users._embedded.users) {
            users = users._embedded.users;
        } else if (!Array.isArray(users)) {
            users = [];
        }

        // Filter out disabled users if the ignore flag is set
        // This provides a way to export only active users
        if (shouldIgnoreDisabledUsers) {
            users = users.filter(user => user.enabled !== false);
        }

        // Check if population information is available in the user objects
        // This determines whether we need to fetch population data separately
        let hasPopulationInfo = false;
        if (users.length > 0 && users[0].population) {
            hasPopulationInfo = true;
        }

        // If population info is not available, try to fetch it separately
        if (!hasPopulationInfo && populationId && populationId.trim() !== '') {
            try {
                const populationResponse = await fetch(`http://127.0.0.1:4000/api/pingone/populations/${populationId.trim()}`);
                if (populationResponse.ok) {
                    const populationData = await populationResponse.json();
                    const populationName = populationData.name || '';
                    
                    // Add population information to all users
                    users = users.map(user => ({
                        ...user,
                        population: {
                            id: populationId.trim(),
                            name: populationName
                        }
                    }));
                }
            } catch (error) {
                // [CLEANUP] Removed verbose debug logging
            }
        }
        
        // Process user data based on the requested field selection
        // This transforms the raw PingOne API response into the desired format
        let processedUsers = users;
        
        if (fields === 'basic') {
            // Basic fields: minimal set of essential user information
            // Useful for quick exports with core user data only
            processedUsers = users.map(user => ({
                id: user.id,
                username: user.username || '',
                email: user.email || '',
                populationId: user.population?.id || '',
                populationName: user.population?.name || '',
                enabled: user.enabled || false
            }));
        } else if (fields === 'custom') {
            // Custom fields: comprehensive field mapping with nested object flattening
            // Excludes complex objects and _links, flattens nested structures for CSV compatibility
            processedUsers = users.map(user => {
                const customFields = {};
                
                Object.keys(user).forEach(key => {
                    // Skip _links entirely (PingOne API metadata)
                    if (key === '_links') {
                        return;
                    }
                    
                    const value = user[key];
                    
                    // Handle nested objects by flattening or extracting meaningful values
                    // This prevents [object Object] in CSV exports
                    if (typeof value === 'object' && value !== null) {
                        if (key === 'name') {
                            // Flatten name object into givenName and familyName
                            customFields.givenName = value.given || '';
                            customFields.familyName = value.family || '';
                        } else if (key === 'population') {
                            // Flatten population object into populationId and populationName
                            customFields.populationId = value.id || '';
                            customFields.populationName = value.name || '';
                        } else if (key === 'environment') {
                            customFields.environmentId = value.id || '';
                        } else if (key === 'account') {
                            customFields.accountId = value.id || '';
                        } else if (key === 'identityProvider') {
                            customFields.identityProviderType = value.type || '';
                        } else if (key === 'lifecycle') {
                            customFields.lifecycleStatus = value.status || '';
                        } else if (key === 'address') {
                            // Flatten address object into individual address fields
                            customFields.streetAddress = value.streetAddress || '';
                            customFields.locality = value.locality || '';
                            customFields.region = value.region || '';
                            customFields.postalCode = value.postalCode || '';
                            customFields.countryCode = value.countryCode || '';
                        } else {
                            // Skip other complex objects to avoid [object Object] in CSV
                        }
                    } else {
                        // Include primitive values as-is
                        customFields[key] = value;
                    }
                });
                return {
                    id: user.id,
                    populationId: user.population?.id || '',
                    populationName: user.population?.name || '',
                    ...customFields
                };
            });
        } else {
            // All fields: comprehensive export with all available data
            // Similar to custom but processes all users with complete field mapping
            processedUsers = users.map(user => {
                const processedUser = {};
                
                Object.keys(user).forEach(key => {
                    // Skip _links entirely (PingOne API metadata)
                    if (key === '_links') {
                        return;
                    }
                    
                    const value = user[key];
                    
                    // Handle nested objects by flattening or extracting meaningful values
                    if (typeof value === 'object' && value !== null) {
                        if (key === 'name') {
                            // Flatten name object into givenName and familyName
                            processedUser.givenName = value.given || '';
                            processedUser.familyName = value.family || '';
                        } else if (key === 'population') {
                            // Flatten population object into populationId and populationName
                            processedUser.populationId = value.id || '';
                            processedUser.populationName = value.name || '';
                        } else if (key === 'environment') {
                            processedUser.environmentId = value.id || '';
                        } else if (key === 'account') {
                            processedUser.accountId = value.id || '';
                        } else if (key === 'address') {
                            // Flatten address object into individual address fields
                            processedUser.streetAddress = value.streetAddress || '';
                            processedUser.locality = value.locality || '';
                            processedUser.region = value.region || '';
                            processedUser.postalCode = value.postalCode || '';
                            processedUser.countryCode = value.countryCode || '';
                        } else if (key === 'identityProvider') {
                            processedUser.identityProviderType = value.type || '';
                            processedUser.identityProviderName = value.name || '';
                        } else if (key === 'lifecycle') {
                            processedUser.lifecycleStatus = value.status || '';
                        } else {
                            // Skip other complex objects to avoid [object Object] in CSV
                        }
                    } else {
                        // Include primitive values as-is
                        processedUser[key] = value;
                    }
                });
                
                return processedUser;
            });
        }

        // Convert processed user data to the requested output format
        // Supports both JSON and CSV formats with proper content type headers
        let output;
        let contentType;
        let fileName;
        
        if (format === 'json') {
            // JSON format: pretty-printed with 2-space indentation
            output = JSON.stringify(processedUsers, null, 2);
            contentType = 'application/json';
            fileName = `pingone-users-export-${new Date().toISOString().split('T')[0]}.json`;
        } else {
            // CSV format: comma-separated values with proper escaping
            if (processedUsers.length === 0) {
                output = '';
            } else {
                // Extract headers from the first user object
                const headers = Object.keys(processedUsers[0]);
                const csvRows = [headers.join(',')];
                
                // Convert each user to a CSV row with proper escaping
                processedUsers.forEach(user => {
                    const row = headers.map(header => {
                        const value = user[header];
                        // Escape commas and quotes in CSV values
                        // Double quotes are escaped by doubling them
                        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                            return `"${value.replace(/"/g, '""')}"`;
                        }
                        return value || '';
                    });
                    csvRows.push(row.join(','));
                });
                
                output = csvRows.join('\n');
            }
            contentType = 'text/csv';
            fileName = `pingone-users-export-${new Date().toISOString().split('T')[0]}.csv`;
        }

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(output);
        
    } catch (error) {
        next(error);
    }
});

// ============================================================================
// USER MODIFICATION ENDPOINT
// ============================================================================

/**
 * POST /api/modify
 * Modifies existing users in PingOne based on CSV data
 * 
 * This endpoint processes a CSV file containing user data and updates existing users
 * in PingOne. It supports user lookup by username or email, batch processing with
 * delays to avoid API rate limits, and detailed result reporting.
 * 
 * @param {Object} req.file - Uploaded CSV file buffer
 * @param {string} createIfNotExists - Whether to create users if they don't exist
 * @param {string} defaultPopulationId - Default population ID for new users
 * @param {string} defaultEnabled - Default enabled state for new users
 * @param {string} generatePasswords - Whether to generate passwords for new users
 * 
 * @returns {Object} JSON response with modification results and statistics
 */
router.post('/modify', upload.single('file'), async (req, res, next) => {
    try {
        const { createIfNotExists, defaultPopulationId, defaultEnabled, generatePasswords } = req.body;
        
        // Validate that a CSV file was uploaded
        if (!req.file) {
            return res.status(400).json({
                error: 'No file uploaded',
                message: 'Please upload a CSV file with user data'
            });
        }
        
        // Parse CSV file content from uploaded buffer
        // Convert buffer to string and split into lines, filtering out empty lines
        const csvContent = req.file.buffer.toString('utf8');
        const lines = csvContent.split('\n').filter(line => line.trim());
        
        // Validate CSV structure: must have header row and at least one data row
        if (lines.length < 2) {
            return res.status(400).json({
                error: 'Invalid CSV file',
                message: 'CSV file must have at least a header row and one data row'
            });
        }
        
        // Parse CSV headers from the first line
        const headers = lines[0].split(',').map(h => h.trim());
        const users = [];
        
        // Parse each data row into user objects
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            const user = {};
            
            // Map each header to its corresponding value
            headers.forEach((header, index) => {
                let value = values[index] || '';
                // Remove surrounding quotes if present (handles quoted CSV values)
                if (value.startsWith('"') && value.endsWith('"')) {
                    value = value.slice(1, -1);
                }
                user[header] = value;
            });
            
            // Only include users that have either username or email (required for lookup)
            if (user.username || user.email) {
                users.push(user);
            }
        }
        
        if (users.length === 0) {
            return res.status(400).json({
                error: 'No valid users found',
                message: 'CSV file must contain at least one user with username or email'
            });
        }
        
        // Get settings for environment ID
        // [CLEANUP] Removed unused imports: fs, path, fileURLToPath, fetch
        const settingsData = await fetch('http://localhost:3000/api/settings').then(res => res.json());
        const settings = settingsData;
        const environmentId = settings.environmentId;
        
        if (!environmentId) {
            return res.status(400).json({
                error: 'Missing environment ID',
                message: 'Please configure your PingOne environment ID in settings'
            });
        }
        
        // Initialize results tracking object for detailed reporting
        // Tracks various outcome categories for comprehensive result analysis
        const results = {
            total: users.length,
            modified: 0,
            created: 0,
            failed: 0,
            skipped: 0,
            noChanges: 0,
            details: []
        };
        
        // Configure batch processing to avoid overwhelming the PingOne API
        // Small batches with delays help prevent rate limiting and improve reliability
        const batchSize = 5;
        const delayBetweenBatches = 1000; // 1 second delay between batches
        
        for (let i = 0; i < users.length; i += batchSize) {
            const batch = users.slice(i, i + batchSize);
            
            for (const user of batch) {
                try {
                    // Find existing user in PingOne by username or email
                    // Uses PingOne API filtering to locate users efficiently
                    let existingUser = null;
                    let lookupMethod = null;
                    
                    // First attempt: Look up user by username (preferred method)
                    if (user.username) {
                        const lookupResponse = await fetch(`http://127.0.0.1:4000/api/pingone/environments/${environmentId}/users?filter=username eq "${encodeURIComponent(user.username)}"`);
                        
                        if (lookupResponse.ok) {
                            const lookupData = await lookupResponse.json();
                            if (lookupData._embedded?.users?.length > 0) {
                                existingUser = lookupData._embedded.users[0];
                                lookupMethod = 'username';
                            }
                        }
                    }
                    
                    // Second attempt: Look up user by email if username lookup failed
                    if (!existingUser && user.email) {
                        const lookupResponse = await fetch(`http://127.0.0.1:4000/api/pingone/environments/${environmentId}/users?filter=email eq "${encodeURIComponent(user.email)}"`);
                        
                        if (lookupResponse.ok) {
                            const lookupData = await lookupResponse.json();
                            if (lookupData._embedded?.users?.length > 0) {
                                existingUser = lookupData._embedded.users[0];
                                lookupMethod = 'email';
                            }
                        }
                    }
                    
                    // If user not found and createIfNotExists is enabled, create the user
                    if (!existingUser && createIfNotExists === 'true') {
                        try {
                            const userData = {
                                name: {
                                    given: user.firstName || user.givenName || '',
                                    family: user.lastName || user.familyName || ''
                                },
                                email: user.email,
                                username: user.username || user.email,
                                population: {
                                    id: user.populationId || defaultPopulationId || settings.populationId
                                },
                                enabled: user.enabled !== undefined ? user.enabled === 'true' : (defaultEnabled === 'true')
                            };
                            
                            // Add password if generatePasswords is enabled
                            if (generatePasswords === 'true') {
                                userData.password = {
                                    value: Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8)
                                };
                            }
                            
                            const createResponse = await fetch(`http://127.0.0.1:4000/api/pingone/environments/${environmentId}/users`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(userData)
                            });
                            
                            if (createResponse.ok) {
                                const createdUser = await createResponse.json();
                                results.created++;
                                results.details.push({
                                    user,
                                    status: 'created',
                                    pingOneId: createdUser.id,
                                    reason: 'User created because createIfNotExists was enabled'
                                });
                            } else {
                                results.failed++;
                                results.details.push({
                                    user,
                                    status: 'failed',
                                    error: 'Failed to create user',
                                    reason: 'User creation failed'
                                });
                            }
                        } catch (error) {
                            results.failed++;
                            results.details.push({
                                user,
                                status: 'failed',
                                error: error.message,
                                reason: 'User creation failed'
                            });
                        }
                        continue;
                    }
                    
                    // If user not found and createIfNotExists is disabled, skip
                    if (!existingUser) {
                        results.skipped++;
                        results.details.push({
                            user,
                            status: 'skipped',
                            reason: 'User not found and createIfNotExists is disabled'
                        });
                        continue;
                    }
                    
                    // Prepare changes for modification
                    const changes = {};
                    let hasChanges = false;
                    
                    // Map CSV fields to PingOne API fields
                    const fieldMappings = {
                        firstName: 'name.given',
                        lastName: 'name.family',
                        givenName: 'name.given',
                        familyName: 'name.family',
                        email: 'email',
                        phoneNumber: 'phoneNumber',
                        title: 'title',
                        department: 'department'
                    };
                    
                    // Check each field for changes
                    for (const [csvField, apiField] of Object.entries(fieldMappings)) {
                        if (user[csvField] !== undefined && user[csvField] !== '') {
                            if (apiField.startsWith('name.')) {
                                const nameField = apiField.split('.')[1];
                                if (!changes.name) {
                                    changes.name = { ...existingUser.name };
                                }
                                if (user[csvField] !== existingUser.name?.[nameField]) {
                                    changes.name[nameField] = user[csvField];
                                    hasChanges = true;
                                }
                            } else {
                                if (user[csvField] !== existingUser[apiField]) {
                                    changes[apiField] = user[csvField];
                                    hasChanges = true;
                                }
                            }
                        }
                    }
                    
                    // Include required fields
                    if (hasChanges) {
                        changes.username = existingUser.username;
                        changes.email = existingUser.email;
                    }
                    
                    if (!hasChanges) {
                        results.noChanges++;
                        results.details.push({
                            user,
                            status: 'no_changes',
                            pingOneId: existingUser.id,
                            lookupMethod: lookupMethod
                        });
                        continue;
                    }
                    
                    // Update the user
                    const updateResponse = await fetch(`http://127.0.0.1:4000/api/pingone/environments/${environmentId}/users/${existingUser.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(changes)
                    });
                    
                    if (updateResponse.ok) {
                        results.modified++;
                        results.details.push({
                            user,
                            status: 'modified',
                            pingOneId: existingUser.id,
                            changes,
                            lookupMethod: lookupMethod
                        });
                    } else {
                        results.failed++;
                        const errorData = await updateResponse.json().catch(() => ({}));
                        results.details.push({
                            user,
                            status: 'failed',
                            error: errorData.message || 'Update failed',
                            statusCode: updateResponse.status
                        });
                    }
                    
                } catch (error) {
                    results.failed++;
                    results.details.push({
                        user,
                        status: 'failed',
                        error: error.message,
                        reason: 'Processing error'
                    });
                }
            }
            
            // Add delay between batches
            if (i + batchSize < users.length && delayBetweenBatches > 0) {
                await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
            }
        }
        
        res.json({
            success: true,
            ...results
        });
        
    } catch (error) {
        next(error);
    }
});

// ============================================================================
// SERVER-SENT EVENTS (SSE) PROGRESS TRACKING
// ============================================================================

/**
 * In-memory storage for active SSE connections
 * Maps session IDs to their corresponding response objects for real-time updates
 */
const importProgressStreams = new Map(); // sessionId -> res

/**
 * GET /api/import/progress/:sessionId
 * Establishes Server-Sent Events connection for real-time import progress updates
 * 
 * This endpoint creates a persistent HTTP connection that streams progress events
 * to the frontend during long-running import operations. Includes heartbeat
 * mechanism to keep connection alive and proper cleanup on disconnect.
 * 
 * @param {string} sessionId - Unique session identifier for this import operation
 */
router.get('/import/progress/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    
    // Set SSE headers for persistent connection
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });
    res.flushHeaders();
    
    // Store this connection for progress updates
    importProgressStreams.set(sessionId, res);
    
    // Send heartbeat every 25 seconds to keep connection alive
    // This prevents timeouts during long import operations
    const heartbeat = setInterval(() => {
        res.write(': keep-alive\n\n');
        if (typeof res.flush === 'function') res.flush();
    }, 25000);
    
    // Clean up connection when client disconnects
    req.on('close', () => {
        clearInterval(heartbeat);
        importProgressStreams.delete(sessionId);
    });
});

// ============================================================================
// USER IMPORT ENDPOINT
// ============================================================================

/**
 * POST /api/import
 * Initiates user import process with real-time progress tracking
 * 
 * This endpoint handles CSV file upload and starts the import process in the background.
 * It immediately returns a session ID that the frontend can use to establish an SSE
 * connection for real-time progress updates. The actual import processing happens
 * asynchronously to prevent request timeouts.
 * 
 * @param {Object} req.file - Uploaded CSV file buffer
 * @param {string} createIfNotExists - Whether to create users if they don't exist
 * @param {string} defaultPopulationId - Default population ID for new users
 * @param {string} defaultEnabled - Default enabled state for new users
 * @param {string} generatePasswords - Whether to generate passwords for new users
 * @param {string} resolvePopulationConflict - How to handle population conflicts
 * 
 * @returns {Object} JSON response with session ID for SSE connection
 */
router.post('/import', upload.single('file'), async (req, res, next) => {
    try {
        const { createIfNotExists = 'true', defaultPopulationId, defaultEnabled = 'true', generatePasswords = 'false', resolvePopulationConflict } = req.body;
        
        // Generate unique session ID for this import operation
        // This allows multiple concurrent imports and proper SSE routing
        const sessionId = uuidv4();
        debugLog("Import", "Import process initiated", { sessionId, fileSize: req.file?.size });
        
        // Respond immediately with session ID for SSE connection
        // This prevents request timeout while import processes in background
        res.json({ success: true, sessionId });
        
        // Start the actual import process in the background
        // Using process.nextTick ensures the response is sent before processing begins
        process.nextTick(() => {
            runImportProcess(req, sessionId, { createIfNotExists, defaultPopulationId, defaultEnabled, generatePasswords, resolvePopulationConflict });
        });
        
    } catch (error) {
        debugLog("Import", "Error in import endpoint", error);
        next(error);
    }
});

// ============================================================================
// POPULATION CONFLICT RESOLUTION ENDPOINTS
// ============================================================================

/**
 * POST /api/import/resolve-conflict
 * Resolves population conflicts between CSV data and UI selection
 * 
 * When a population conflict is detected during import, this endpoint allows
 * the user to specify which population data to use (CSV or UI selection).
 * The resolution is stored in memory and used by the background import process.
 * 
 * @param {string} sessionId - Import session ID
 * @param {boolean} useCsvPopulation - Whether to use population data from CSV
 * @param {boolean} useUiPopulation - Whether to use population selected in UI
 * 
 * @returns {Object} JSON response confirming resolution was stored
 */
router.post('/import/resolve-conflict', async (req, res, next) => {
    try {
        const { sessionId, useCsvPopulation, useUiPopulation } = req.body;
        
        // Validate required session ID
        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID is required' });
        }
        
        // Validate that user specified a resolution choice
        if (useCsvPopulation === undefined && useUiPopulation === undefined) {
            return res.status(400).json({ error: 'Must specify either useCsvPopulation or useUiPopulation' });
        }
        
        // Initialize global storage for population conflict resolutions
        // This allows the background import process to access user decisions
        if (!global.populationConflictResolutions) {
            global.populationConflictResolutions = new Map();
        }
        
        // Store the user's resolution choice for the background process
        global.populationConflictResolutions.set(sessionId, {
            useCsvPopulation: useCsvPopulation === true,
            useUiPopulation: useUiPopulation === true
        });
        
        res.json({ success: true, message: 'Population conflict resolved' });
        
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/import/resolve-invalid-population
 * Resolves invalid population assignments in CSV data
 * 
 * When CSV data contains invalid population IDs, this endpoint allows the user
 * to specify a valid population ID to use for those users. The resolution is
 * stored in memory and used by the background import process.
 * 
 * @param {string} sessionId - Import session ID
 * @param {string} selectedPopulationId - Valid population ID to use for invalid assignments
 * 
 * @returns {Object} JSON response confirming resolution was stored
 */
router.post('/import/resolve-invalid-population', async (req, res, next) => {
    try {
        const { sessionId, selectedPopulationId } = req.body;
        
        // Validate required session ID
        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID is required' });
        }
        
        // Validate required population ID
        if (!selectedPopulationId) {
            return res.status(400).json({ error: 'Selected population ID is required' });
        }
        
        // Initialize global storage for invalid population resolutions
        // This allows the background import process to access user decisions
        if (!global.invalidPopulationResolutions) {
            global.invalidPopulationResolutions = new Map();
        }
        
        // Store the user's population choice for the background process
        global.invalidPopulationResolutions.set(sessionId, {
            selectedPopulationId
        });
        
        res.json({ success: true, message: 'Invalid population resolved' });
        
    } catch (error) {
        next(error);
    }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validates if a string is a valid UUID v4 format
 * Used for population ID validation throughout the application
 * 
 * @param {string} uuid - String to validate as UUID v4
 * @returns {boolean} True if valid UUID v4, false otherwise
 */
function isValidUUID(uuid) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
}

/**
 * Fetches the default population ID from PingOne API
 * Attempts to find a population marked as default, falls back to first available
 * 
 * @param {string} environmentId - PingOne environment ID
 * @returns {string|null} Default population ID or null if not found
 */
async function fetchDefaultPopulationId(environmentId) {
    try {
        const response = await fetch(`http://127.0.0.1:4000/api/pingone/environments/${environmentId}/populations`);
        if (!response.ok) throw new Error('Failed to fetch populations');
        const data = await response.json();
        const pops = data._embedded?.populations || [];
        
        // Prefer population marked as default, fall back to first available
        let defaultPop = pops.find(p => p.default === true);
        if (!defaultPop) defaultPop = pops[0];
        return defaultPop ? defaultPop.id : null;
    } catch (e) {
        console.error('Error fetching default population:', e);
        return null;
    }
}

/**
 * Reads default population ID from application settings
 * Attempts multiple property names to handle different settings formats
 * 
 * @returns {string} Default population ID from settings or empty string if not found
 */
async function getDefaultPopulationIdFromSettings() {
    try {
        const settingsData = await fetch('http://localhost:4000/api/settings').then(res => res.json());
        const settings = settingsData.success && settingsData.data ? settingsData.data : settingsData;
        
        // Try multiple property names to handle different settings formats
        // Supports both camelCase and kebab-case naming conventions
        return settings.defaultPopulationId || settings['defaultPopulationId'] || settings.populationId || settings['population-id'] || '';
    } catch (e) {
        console.error('Error reading default population from settings:', e);
        return '';
    }
}

/**
 * Background import process function
 * 
 * This is the core import logic that runs asynchronously after the initial request.
 * It handles CSV parsing, population validation, conflict resolution, and real-time
 * progress streaming via Server-Sent Events (SSE).
 * 
 * The function processes users in batches to avoid overwhelming the PingOne API,
 * validates population assignments, handles conflicts, and provides detailed progress
 * updates to the frontend through the SSE connection.
 * 
 * @param {Object} req - Express request object containing file buffer and body data
 * @param {string} sessionId - Unique session identifier for SSE progress tracking
 * @param {Object} options - Import configuration options
 * @param {string} options.createIfNotExists - Whether to create users if they don't exist
 * @param {string} options.defaultPopulationId - Default population ID for new users
 * @param {string} options.defaultEnabled - Default enabled state for new users
 * @param {string} options.generatePasswords - Whether to generate passwords for new users
 */
async function runImportProcess(req, sessionId, options) {
    const { createIfNotExists, defaultPopulationId, defaultEnabled, generatePasswords } = options;
    
    try {
        // Log import start with estimated user count from CSV lines
        debugLog("Import", "Starting background import process", { 
            sessionId, 
            userCount: req.file?.buffer?.toString().split('\n').length - 1 
        });
        
        // Send initial progress event to establish SSE connection
        // This ensures the frontend receives immediate feedback that import has started
        const initialSseRes = importProgressStreams.get(sessionId);
        if (initialSseRes) {
            initialSseRes.write(`event: progress\ndata: ${JSON.stringify({ 
                current: 0, 
                total: 0, 
                message: 'Starting import...',
                counts: { succeeded: 0, failed: 0, skipped: 0 }
            })}\n\n`);
        }

        // Parse CSV file content from uploaded buffer
        // Convert buffer to string and split into lines, filtering out empty lines
        const csvContent = req.file.buffer.toString('utf8');
        const lines = csvContent.split('\n').filter(line => line.trim());
        debugLog("CSV", `Parsing CSV file`, { totalLines: lines.length, headerRow: lines[0] });
        
        // Validate CSV structure: must have header row and at least one data row
        if (lines.length < 2) {
            debugLog("CSV", "Invalid CSV file - insufficient data");
            const csvErrorSseRes = importProgressStreams.get(sessionId);
            if (csvErrorSseRes) {
                csvErrorSseRes.write(`event: error\ndata: ${JSON.stringify({ 
                    error: 'Invalid CSV file', 
                    message: 'CSV file must have at least a header row and one data row' 
                })}\n\n`);
                csvErrorSseRes.end();
                importProgressStreams.delete(sessionId);
            }
            return;
        }
        
        // Parse CSV headers and data rows into user objects
        const headers = lines[0].split(',').map(h => h.trim());
        const users = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            const user = {};
            
            // Map each header to its corresponding value
            headers.forEach((header, index) => {
                let value = values[index] || '';
                // Remove surrounding quotes if present (handles quoted CSV values)
                if (value.startsWith('"') && value.endsWith('"')) {
                    value = value.slice(1, -1);
                }
                user[header] = value;
            });
            
            // Only include users that have either username or email (required for lookup)
            if (user.username || user.email) {
                users.push(user);
            }
        }
        
        debugLog("CSV", `Parsed users from CSV`, { totalUsers: users.length, headers });
        
        // Validate that we have at least one valid user to process
        if (users.length === 0) {
            debugLog("CSV", "No valid users found in CSV");
            const noUsersSseRes = importProgressStreams.get(sessionId);
            if (noUsersSseRes) {
                noUsersSseRes.write(`event: error\ndata: ${JSON.stringify({ 
                    error: 'No valid users found', 
                    message: 'CSV file must contain at least one user with username or email' 
                })}\n\n`);
                noUsersSseRes.end();
                importProgressStreams.delete(sessionId);
            }
            return;
        }
        
        // Get settings for environment ID
        const settingsResponse = await fetch('http://localhost:4000/api/settings');
        const settingsData = await settingsResponse.json();
        const settings = settingsData.success && settingsData.data ? settingsData.data : settingsData;
        const environmentId = settings.environmentId;
        
        debugLog("Settings", "Retrieved settings", { environmentId, hasSettings: !!settings });
        
        if (!environmentId) {
            debugLog("Settings", "Missing environment ID in settings");
            const envErrorSseRes = importProgressStreams.get(sessionId);
            if (envErrorSseRes) {
                envErrorSseRes.write(`event: error\ndata: ${JSON.stringify({ error: 'Missing environment ID', message: 'Please configure your PingOne environment ID in settings' })}\n\n`);
                envErrorSseRes.end();
                importProgressStreams.delete(sessionId);
            }
            return;
        }
        
        // Send progress event with total count
        const progressSseRes = importProgressStreams.get(sessionId);
        if (progressSseRes) {
            progressSseRes.write(`event: progress\ndata: ${JSON.stringify({ 
                current: 0, 
                total: users.length, 
                message: `Starting import of ${users.length} users...`,
                counts: { succeeded: 0, failed: 0, skipped: 0 }
            })}\n\n`);
        }
        
        // Detect population conflicts between CSV data and UI selection
        // A conflict occurs when both CSV contains population data AND UI has selected a population
        const hasCsvPopulationData = users.some(user => user.populationId && user.populationId.trim() !== '');
        const hasUiSelectedPopulation = defaultPopulationId && defaultPopulationId.trim() !== '';
        
        debugLog("Population", "Population conflict check", { hasCsvPopulationData, hasUiSelectedPopulation, defaultPopulationId });
        
        let populationConflict = false;
        let populationConflictMessage = '';
        
        if (hasCsvPopulationData && hasUiSelectedPopulation) {
            populationConflict = true;
            populationConflictMessage = `CSV file contains population data AND you selected a population in the UI. Please choose which to use:
            
CSV Population Data: ${users.filter(u => u.populationId && u.populationId.trim() !== '').length} users have population IDs
UI Selected Population: ${defaultPopulationId}

This conflict needs to be resolved before import can proceed.`;
            
            // Check if user has already resolved this conflict via the UI
            const conflictResolution = global.populationConflictResolutions?.get(sessionId);
            if (conflictResolution) {
                // Apply the user's resolution choice
                if (conflictResolution.useCsvPopulation) {
                    debugLog("Population", "Using CSV population data as resolved by user");
                    // Continue with CSV population data (no change needed)
                } else if (conflictResolution.useUiPopulation) {
                    debugLog("Population", "Using UI selected population as resolved by user");
                    // Override all users to use the UI selected population
                    users.forEach(user => {
                        user.populationId = defaultPopulationId;
                    });
                }
                // Clear the resolution to prevent reuse
                global.populationConflictResolutions.delete(sessionId);
            } else {
                // Send conflict event to frontend for user resolution
                const conflictSseRes = importProgressStreams.get(sessionId);
                if (conflictSseRes) {
                    conflictSseRes.write(`event: population_conflict\ndata: ${JSON.stringify({ 
                        error: 'Population conflict detected',
                        message: populationConflictMessage,
                        hasCsvPopulationData,
                        hasUiSelectedPopulation,
                        csvPopulationCount: users.filter(u => u.populationId && u.populationId.trim() !== '').length,
                        uiSelectedPopulation: defaultPopulationId,
                        sessionId
                    })}\n\n`);
                    conflictSseRes.end();
                    importProgressStreams.delete(sessionId);
                }
                return;
            }
        }
        
        // Validate population IDs in CSV data against available populations
        // This ensures all users are assigned to valid, existing populations
        const uniquePopulationIds = [...new Set(users.filter(u => u.populationId && u.populationId.trim() !== '').map(u => u.populationId))];
        const invalidPopulations = [];
        
        // Initialize availablePopulationIds at function scope for validation
        let availablePopulationIds = [];
        
        // Fetch available populations from PingOne for validation
        // This ensures we only assign users to populations that actually exist
        try {
            debugLog("Populations", "Fetching available populations for validation");
            const populationsResponse = await fetch(`http://127.0.0.1:4000/api/pingone/environments/${environmentId}/populations`);
            if (populationsResponse.ok) {
                const populationsData = await populationsResponse.json();
                availablePopulationIds = populationsData._embedded?.populations?.map(p => p.id) || [];
                debugLog("Populations", `Fetched ${availablePopulationIds.length} available population IDs`);
            } else {
                debugLog("Populations", "Could not fetch available populations for validation");
            }
        } catch (e) {
            debugLog("Populations", "Error fetching available populations", e);
        }
        
        // Handle case where population list is unavailable
        if (!Array.isArray(availablePopulationIds) || availablePopulationIds.length === 0) {
            debugLog("Populations", "Population list is unavailable. Cannot validate population.");
        }
        
        if (uniquePopulationIds.length > 0) {
            debugLog("Populations", `Validating ${uniquePopulationIds.length} unique population IDs from CSV`);
            
            // Assign default population ID to users with missing or invalid population IDs
            // This ensures all users have a valid population assignment
            users.forEach(user => {
                if (!user.populationId || !isValidUUID(user.populationId) || !availablePopulationIds.includes(user.populationId)) {
                    user.populationId = defaultPopulationId;
                }
            });
            debugLog("Populations", `Found ${invalidPopulations.length} invalid populations:`, invalidPopulations);
        }
        
        // Handle invalid populations
        if (invalidPopulations.length > 0) {
            const invalidPopulationMessage = `CSV contains ${invalidPopulations.length} invalid population ID(s): ${invalidPopulations.join(', ')}. Please choose a valid population to use for these users.`;
            
            // Check if invalid population has been resolved
            const invalidPopulationResolution = global.invalidPopulationResolutions?.get(sessionId);
            if (invalidPopulationResolution) {
                debugLog("Populations", `Using resolved population for invalid populations: ${invalidPopulationResolution.selectedPopulationId}`);
                // Override all users with invalid populations to use the selected population
                users.forEach(user => {
                    if (invalidPopulations.includes(user.populationId)) {
                        user.populationId = invalidPopulationResolution.selectedPopulationId;
                    }
                });
                // Clear the resolution
                global.invalidPopulationResolutions.delete(sessionId);
            } else {
                // Send invalid population event to frontend
                const invalidPopulationSseRes = importProgressStreams.get(sessionId);
                if (invalidPopulationSseRes) {
                    invalidPopulationSseRes.write(`event: invalid_population\ndata: ${JSON.stringify({ 
                        error: 'Invalid populations detected',
                        message: invalidPopulationMessage,
                        invalidPopulations,
                        affectedUserCount: users.filter(u => invalidPopulations.includes(u.populationId)).length,
                        sessionId
                    })}\n\n`);
                    invalidPopulationSseRes.end();
                    importProgressStreams.delete(sessionId);
                }
                return;
            }
        }
        
        // After checking defaultPopulationId validity, before fetching PingOne default:
        if (users.every(u => !u.populationId || !isValidUUID(u.populationId) || !availablePopulationIds.includes(u.populationId)) && (!defaultPopulationId || !isValidUUID(defaultPopulationId) || !availablePopulationIds.includes(defaultPopulationId))) {
            // Try to use default from settings.json
            const settingsPopId = await getDefaultPopulationIdFromSettings();
            if (settingsPopId && isValidUUID(settingsPopId) && availablePopulationIds.includes(settingsPopId)) {
                users.forEach(u => u.populationId = settingsPopId);
                debugLog("Populations", "Assigned settings.json default population to all users");
            } else {
                // Try to fetch default from PingOne
                const fallbackPopId = await fetchDefaultPopulationId(environmentId);
                if (fallbackPopId && availablePopulationIds.includes(fallbackPopId)) {
                    users.forEach(u => u.populationId = fallbackPopId);
                    debugLog("Populations", "Assigned PingOne default population to all users");
                } else {
                    // No valid fallback, prompt user as before
                    const pickPopSseRes = importProgressStreams.get(sessionId);
                    if (pickPopSseRes) {
                        pickPopSseRes.write(`event: pick_population_required\ndata: ${JSON.stringify({
                            error: 'No valid population found',
                            message: 'No valid populationId found in CSV, UI, settings.json, or PingOne default. Please pick a population.',
                            sessionId
                        })}\n\n`);
                        pickPopSseRes.end();
                        importProgressStreams.delete(sessionId);
                    }
                    return;
                }
            }
        }
        
        // Initialize results tracking for detailed import reporting
        const results = {
            total: users.length,
            created: 0,
            failed: 0,
            skipped: 0,
            details: []
        };
        
        debugLog("Import", "Starting user processing loop", { totalUsers: users.length, batchSize: 5 });
        
        // Configure batch processing to avoid overwhelming the PingOne API
        const batchSize = 5;
        const delayBetweenBatches = 1000;
        let processed = 0;
        
        // Process users in batches with delays to prevent API rate limiting
        for (let i = 0; i < users.length; i += batchSize) {
            const batch = users.slice(i, i + batchSize);
            debugLog("Import", `Processing batch ${Math.floor(i/batchSize) + 1}`, { batchSize: batch.length, startIndex: i });
            
            for (const user of batch) {
                let status = 'unknown';
                try {
                    // Check if user already exists in the selected population
                    // Import mode only creates new users, never modifies existing ones
                    let existingUser = null;
                    const populationId = user.populationId || defaultPopulationId || settings.populationId;
                    const username = user.username;
                    const email = user.email;
                    
                    debugLog("User", `Processing user ${username || email}`, { populationId, username, email });

                    // First attempt: Look up user by username in the selected population
                    if (username) {
                        const lookupResponse = await fetch(`http://127.0.0.1:4000/api/pingone/environments/${environmentId}/users?filter=username eq \"${encodeURIComponent(username)}\" and population.id eq \"${encodeURIComponent(populationId)}\"`);
                        if (lookupResponse.ok) {
                            const lookupData = await lookupResponse.json();
                            if (lookupData._embedded?.users?.length > 0) {
                                existingUser = lookupData._embedded.users[0];
                            }
                        }
                    }

                    // Second attempt: Look up user by email in the selected population
                    if (!existingUser && email) {
                        const lookupResponse = await fetch(`http://127.0.0.1:4000/api/pingone/environments/${environmentId}/users?filter=email eq \"${encodeURIComponent(email)}\" and population.id eq \"${encodeURIComponent(populationId)}\"`);
                        if (lookupResponse.ok) {
                            const lookupData = await lookupResponse.json();
                            if (lookupData._embedded?.users?.length > 0) {
                                existingUser = lookupData._embedded.users[0];
                            }
                        }
                    }

                    // Check if user exists in the selected population
                    const existsInPopulation = existingUser !== null;
                    debugLog("User", `Import check: ${username || email} exists = ${existsInPopulation}, status = ${status}`);

                    // If user exists in selected population, skip (import mode doesn't modify existing users)
                    if (existingUser) {
                        debugLog("User", `User ${username || email} exists in population ${populationId}, skipping`);
                        results.skipped++;
                        status = 'skipped';
                        results.details.push({ 
                            user, 
                            status, 
                            reason: 'User already exists in selected population',
                            pingOneId: existingUser.id
                        });
                    }

                    // If user does not exist in selected population, create new user
                    if (!existingUser) {
                        // Validate population ID before creating user
                        // This prevents creation attempts with invalid population assignments
                        let finalPopulationId = user.populationId;
                        if (!isValidUUID(finalPopulationId) || !availablePopulationIds.includes(finalPopulationId)) {
                            debugLog("User", `Skipping user ${user.username || user.email}: invalid populationId '${finalPopulationId}'`);
                            results.failed++;
                            status = 'failed';
                            results.details.push({ user, status, error: `Invalid populationId: ${finalPopulationId}` });
                            continue;
                        }
                        
                        // Prepare user data for PingOne API creation
                        // Maps CSV fields to PingOne API format with proper field mapping
                        const userData = {
                            name: {
                                given: user.firstName || user.givenName || '',
                                family: user.lastName || user.familyName || ''
                            },
                            email: user.email,
                            username: user.username || user.email,
                            population: {
                                id: finalPopulationId
                            },
                            enabled: user.enabled !== undefined ? user.enabled === 'true' : (defaultEnabled === 'true')
                        };
                        
                        // Add auto-generated password if requested
                        // Generates a 16-character random password for new users
                        if (generatePasswords === 'true') {
                            userData.password = {
                                value: Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8)
                            };
                        }
                        
                        debugLog("User", `Creating user: ${user.username || user.email} in population ${finalPopulationId}`);
                        
                        // Create user via PingOne API
                        const createResponse = await fetch(`http://127.0.0.1:4000/api/pingone/environments/${environmentId}/users`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(userData)
                        });
                        
                        debugLog("User", `Create response status: ${createResponse.status}`);
                        
                        if (createResponse.ok) {
                            // User created successfully
                            const createdUser = await createResponse.json();
                            debugLog("User", `User created successfully: ${createdUser.id}`);
                            results.created++;
                            status = 'created';
                            results.details.push({ user, status, pingOneId: createdUser.id });
                        } else {
                            // User creation failed
                            const errorData = await createResponse.json().catch(() => ({}));
                            debugLog("User", `Failed to create user: ${createResponse.status}`, errorData);
                            results.failed++;
                            status = 'failed';
                            results.details.push({ user, status, error: errorData.message || 'Failed to create user', statusCode: createResponse.status });
                        }
                    }
                    
                } catch (error) {
                    debugLog("User", `Error processing user ${user.username || user.email}`, error);
                    results.failed++;
                    status = 'failed';
                    results.details.push({ user, status, error: error.message });
                }
                
                processed++;
                
                // Send real-time progress event for each processed user
                // This provides immediate feedback to the frontend during long imports
                const progressSseRes = importProgressStreams.get(sessionId);
                if (progressSseRes) {
                    const progressData = { 
                        current: processed, 
                        total: users.length, 
                        message: `Processing user ${processed}/${users.length}`,
                        counts: { 
                            succeeded: results.created, 
                            failed: results.failed, 
                            skipped: results.skipped 
                        },
                        status,
                        user
                    };
                    debugLog("SSE", `Sending progress event:`, progressData);
                    progressSseRes.write(`event: progress\ndata: ${JSON.stringify(progressData)}\n\n`);
                } else {
                    debugLog("SSE", `No SSE stream found for session ${sessionId}`);
                }
            }
            
            // Add delay between batches to prevent API rate limiting
            // This ensures we don't overwhelm the PingOne API with too many requests
            if (i + batchSize < users.length && delayBetweenBatches > 0) {
                await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
            }
        }
        
        debugLog("Import", "Import process completed", results);
        
        // Send final completion event to frontend
        // This signals that the import process has finished and provides final results
        const finalSseRes = importProgressStreams.get(sessionId);
        if (finalSseRes) {
            finalSseRes.write(`event: done\ndata: ${JSON.stringify({ success: true, ...results })}\n\n`);
            finalSseRes.end();
            importProgressStreams.delete(sessionId);
        }
    } catch (error) {
        // Handle any unexpected errors during the import process
        debugLog("Import", "Error in background import process", error);
        
        // Send error event to frontend via SSE
        // This ensures the user is notified of any failures
        const errorSseRes = importProgressStreams.get(sessionId);
        if (errorSseRes) {
            errorSseRes.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
            errorSseRes.end();
            importProgressStreams.delete(sessionId);
        }
    }
}

// Resolve invalid population endpoint
router.post('/import/resolve-invalid-population', async (req, res, next) => {
    try {
        const { sessionId, selectedPopulationId } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID is required' });
        }
        
        if (!selectedPopulationId) {
            return res.status(400).json({ error: 'Selected population ID is required' });
        }
        
        // Store the resolution in a way that the background process can access
        if (!global.invalidPopulationResolutions) {
            global.invalidPopulationResolutions = new Map();
        }
        
        global.invalidPopulationResolutions.set(sessionId, {
            selectedPopulationId
        });
        
        res.json({ success: true, message: 'Invalid population resolution stored' });
        
    } catch (error) {
        next(error);
    }
});

// ============================================================================
// PINGONE API PROXY ENDPOINTS
// ============================================================================

/**
 * GET /api/pingone/populations
 * Fetches available populations from PingOne API
 * 
 * This endpoint acts as a proxy to the PingOne API, fetching all available
 * populations for the configured environment. It handles authentication and
 * returns the populations in a simplified array format for frontend consumption.
 * 
 * @returns {Array} Array of population objects with id, name, and other properties
 */
router.get('/pingone/populations', async (req, res, next) => {
    try {
        debugLog("Populations", "Fetching populations from PingOne");
        
        // Get application settings to determine environment ID
        const settingsResponse = await fetch('http://localhost:4000/api/settings');
        if (!settingsResponse.ok) {
            console.error('[DEBUG] Failed to fetch settings:', settingsResponse.status);
            return res.status(500).json({ 
                error: 'Failed to load settings',
                message: 'Could not load settings from server'
            });
        }
        
        const settingsData = await settingsResponse.json();
        
        // Handle different settings response formats
        // Some endpoints return {success, data} while others return the data directly
        const settings = settingsData.success && settingsData.data ? settingsData.data : settingsData;
        
        if (!settings || typeof settings !== 'object') {
            console.error('[DEBUG] Invalid settings response:', settingsData);
            return res.status(500).json({ 
                error: 'Invalid settings data',
                message: 'Settings response format is invalid'
            });
        }
        const environmentId = settings.environmentId;
        
        if (!environmentId) {
            console.error('[DEBUG] No environment ID in settings');
            return res.status(400).json({ 
                error: 'Missing environment ID',
                message: 'Please configure your PingOne environment ID in settings'
            });
        }
        
        console.log('[DEBUG] Using environment ID:', environmentId);
        
        // Get token manager from app
        const tokenManager = req.app.get('tokenManager');
        if (!tokenManager) {
            console.error('[DEBUG] Token manager not available');
            return res.status(500).json({ 
                error: 'Token manager not available',
                message: 'Server token manager is not initialized'
            });
        }
        
        // Get access token
        const token = await tokenManager.getAccessToken();
        if (!token) {
            console.error('[DEBUG] Failed to get access token');
            return res.status(500).json({ 
                error: 'Failed to get access token',
                message: 'Could not authenticate with PingOne'
            });
        }
        
        // Call PingOne API directly
        const apiUrl = `https://api.pingone.com/v1/environments/${environmentId}/populations`;
        console.log('[DEBUG] Calling PingOne API:', apiUrl);
        
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('[DEBUG] PingOne API error:', response.status, errorText);
            return res.status(response.status).json({
                error: 'PingOne API error',
                message: `API returned ${response.status}: ${errorText}`,
                status: response.status
            });
        }
        
        const data = await response.json();
        console.log('[DEBUG] Populations response:', data);
        
        const populations = data._embedded && Array.isArray(data._embedded.populations) 
            ? data._embedded.populations 
            : [];
            
        res.json(populations);
        
    } catch (error) {
        console.error('[DEBUG] Error in /api/pingone/populations:', error);
        res.status(500).json({
            success: false,
            error: 'fetch failed',
            stack: error.stack,
            timestamp: new Date().toISOString(),
            path: '/api/pingone/populations',
            method: 'GET'
        });
    }
});

/**
 * POST /api/pingone/get-token
 * Retrieves access token for PingOne API authentication
 * 
 * This endpoint provides access tokens to the frontend for direct PingOne API
 * calls. It uses the server's token manager to handle authentication and token
 * refresh automatically. Returns token information in the format expected by
 * the PingOneClient frontend library.
 * 
 * @returns {Object} Token response with access_token, expires_in, and token_type
 */
router.post('/pingone/get-token', async (req, res, next) => {
    try {
        debugLog("Token", "Getting access token from PingOne");
        
        // Get token manager from Express app context
        // The token manager handles authentication and token refresh
        const tokenManager = req.app.get('tokenManager');
        if (!tokenManager) {
            console.error('[DEBUG] Token manager not available');
            return res.status(500).json({ 
                success: false,
                error: 'Token manager not available',
                message: 'Server token manager is not initialized'
            });
        }
        
        console.log('[DEBUG] Token manager found, getting access token...');
        
        // Retrieve access token from token manager
        // This handles token refresh automatically if needed
        const token = await tokenManager.getAccessToken();
        if (!token) {
            console.error('[DEBUG] Failed to get access token');
            return res.status(500).json({ 
                success: false,
                error: 'Failed to get access token',
                message: 'Could not authenticate with PingOne'
            });
        }
        
        console.log('[DEBUG] Access token obtained, getting token info...');
        
        // Get additional token information for debugging and validation
        const tokenInfo = tokenManager.getTokenInfo();
        
        console.log('[DEBUG] Token retrieved successfully, token info:', {
            hasToken: !!token,
            tokenLength: token ? token.length : 0,
            expiresIn: tokenInfo ? tokenInfo.expiresIn : 'unknown',
            isValid: tokenInfo ? tokenInfo.isValid : false
        });
        
        // Return token in the format expected by PingOneClient frontend library
        // This includes all necessary fields for API authentication
        const response = {
            success: true,
            access_token: token,
            expires_in: tokenInfo ? tokenInfo.expiresIn : 3600, // Default to 1 hour if not available
            token_type: 'Bearer',
            message: 'Token retrieved successfully'
        };
        
        console.log('[DEBUG] Sending response to frontend');
        res.json(response);
        
    } catch (error) {
        console.error('[DEBUG] Error in /api/pingone/get-token:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get token',
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
            path: '/api/pingone/get-token',
            method: 'POST'
        });
    }
});

// Export the configured router with all API endpoints
export default router;
