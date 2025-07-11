import { Router } from 'express';
import multer from 'multer';
import { isFeatureEnabled, setFeatureFlag, getAllFeatureFlags, resetFeatureFlags } from '../../server/feature-flags.js';
import { v4 as uuidv4 } from 'uuid';

const featureFlags = {
  isFeatureEnabled,
  setFeatureFlag,
  getAllFeatureFlags,
  resetFeatureFlags,
};

const router = Router();

// Configure multer for file uploads
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Feature flags endpoints
router.get('/feature-flags', (req, res) => {
    try {
        const flags = featureFlags.getAllFeatureFlags();
        res.json({ success: true, flags });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get feature flags', details: error.message });
    }
});

router.post('/feature-flags/:flag', (req, res) => {
    try {
        const { flag } = req.params;
        const { enabled } = req.body;
        
        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ error: 'enabled must be a boolean' });
        }
        
        featureFlags.setFeatureFlag(flag, enabled);
        res.json({ success: true, flag, enabled });
    } catch (error) {
        res.status(500).json({ error: 'Failed to set feature flag', details: error.message });
    }
});

router.post('/feature-flags/reset', (req, res) => {
    try {
        featureFlags.resetFeatureFlags();
        res.json({ success: true, message: 'Feature flags reset to defaults' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reset feature flags', details: error.message });
    }
});

// Export users endpoint
router.post('/export-users', async (req, res, next) => {
    try {
        const { populationId, fields, format, ignoreDisabledUsers } = req.body;
        
        // Convert ignoreDisabledUsers to boolean if it's a string
        const shouldIgnoreDisabledUsers = ignoreDisabledUsers === true || ignoreDisabledUsers === 'true';
        
        // Validate request
        if (!populationId && populationId !== '') {
            return res.status(400).json({
                error: 'Missing population ID',
                message: 'Population ID is required for export'
            });
        }

        // Build the PingOne API URL with proper population filtering and expand population details
        let pingOneUrl = 'http://127.0.0.1:4000/api/pingone/users';
        const params = new URLSearchParams();
        
        if (populationId && populationId.trim() !== '') {
            params.append('population.id', populationId.trim());
        }
        
        // Add expand parameter to include population details
        params.append('expand', 'population');
        
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
        
        // Handle both array and embedded response formats
        if (users._embedded && users._embedded.users) {
            users = users._embedded.users;
        } else if (!Array.isArray(users)) {
            users = [];
        }

        // Filter out disabled users if requested
        if (shouldIgnoreDisabledUsers) {
            users = users.filter(user => user.enabled !== false);
        }

        // Check if population info is available in user objects
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
        
        // Process users based on fields selection
        let processedUsers = users;
        
        if (fields === 'basic') {
            // Basic fields only
            processedUsers = users.map(user => ({
                id: user.id,
                username: user.username || '',
                email: user.email || '',
                populationId: user.population?.id || '',
                populationName: user.population?.name || '',
                enabled: user.enabled || false
            }));
        } else if (fields === 'custom') {
            // Custom fields - exclude complex objects and flatten nested structures
            processedUsers = users.map(user => {
                const customFields = {};
                
                Object.keys(user).forEach(key => {
                    // Skip _links entirely
                    if (key === '_links') {
                        return;
                    }
                    
                    const value = user[key];
                    
                    // Handle nested objects by flattening or extracting meaningful values
                    if (typeof value === 'object' && value !== null) {
                        if (key === 'name') {
                            customFields.givenName = value.given || '';
                            customFields.familyName = value.family || '';
                        } else if (key === 'population') {
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
                            customFields.streetAddress = value.streetAddress || '';
                            customFields.locality = value.locality || '';
                            customFields.region = value.region || '';
                            customFields.postalCode = value.postalCode || '';
                            customFields.countryCode = value.countryCode || '';
                        } else {
                            // For other objects, skip them to avoid [object Object]
                            // [CLEANUP] Removed verbose debug logging
                        }
                    } else {
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
            // For 'all' fields, process all users but exclude _links and flatten nested objects
            processedUsers = users.map(user => {
                const processedUser = {};
                
                Object.keys(user).forEach(key => {
                    // Skip _links entirely
                    if (key === '_links') {
                        return;
                    }
                    
                    const value = user[key];
                    
                    // Handle nested objects by flattening or extracting meaningful values
                    if (typeof value === 'object' && value !== null) {
                        if (key === 'name') {
                            processedUser.givenName = value.given || '';
                            processedUser.familyName = value.family || '';
                        } else if (key === 'population') {
                            processedUser.populationId = value.id || '';
                            processedUser.populationName = value.name || '';
                        } else if (key === 'environment') {
                            processedUser.environmentId = value.id || '';
                        } else if (key === 'account') {
                            processedUser.accountId = value.id || '';
                        } else if (key === 'address') {
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
                            // For other complex objects that we don't know how to handle,
                            // skip them to avoid [object Object] in CSV
                            // [CLEANUP] Removed verbose debug logging
                        }
                    } else {
                        // For primitive values, include as-is
                        processedUser[key] = value;
                    }
                });
                
                return processedUser;
            });
        }

        // Convert to requested format
        let output;
        let contentType;
        let fileName;
        
        if (format === 'json') {
            output = JSON.stringify(processedUsers, null, 2);
            contentType = 'application/json';
            fileName = `pingone-users-export-${new Date().toISOString().split('T')[0]}.json`;
        } else {
            // CSV format
            if (processedUsers.length === 0) {
                output = '';
            } else {
                const headers = Object.keys(processedUsers[0]);
                const csvRows = [headers.join(',')];
                
                processedUsers.forEach(user => {
                    const row = headers.map(header => {
                        const value = user[header];
                        // Escape commas and quotes in CSV
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

// Modify users endpoint
router.post('/modify', upload.single('file'), async (req, res, next) => {
    try {
        const { createIfNotExists, defaultPopulationId, defaultEnabled, generatePasswords } = req.body;
        
        // Check if file was uploaded
        if (!req.file) {
            return res.status(400).json({
                error: 'No file uploaded',
                message: 'Please upload a CSV file with user data'
            });
        }
        
        // Parse CSV data
        const csvContent = req.file.buffer.toString('utf8');
        const lines = csvContent.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
            return res.status(400).json({
                error: 'Invalid CSV file',
                message: 'CSV file must have at least a header row and one data row'
            });
        }
        
        // Parse headers
        const headers = lines[0].split(',').map(h => h.trim());
        const users = [];
        
        // Parse data rows
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            const user = {};
            
            headers.forEach((header, index) => {
                let value = values[index] || '';
                // Remove quotes if present
                if (value.startsWith('"') && value.endsWith('"')) {
                    value = value.slice(1, -1);
                }
                user[header] = value;
            });
            
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
        
        // Process users through the PingOne API
        const results = {
            total: users.length,
            modified: 0,
            created: 0,
            failed: 0,
            skipped: 0,
            noChanges: 0,
            details: []
        };
        
        // Process users in batches to avoid overwhelming the API
        const batchSize = 5;
        const delayBetweenBatches = 1000;
        
        for (let i = 0; i < users.length; i += batchSize) {
            const batch = users.slice(i, i + batchSize);
            
            for (const user of batch) {
                try {
                    // Find user by username or email
                    let existingUser = null;
                    let lookupMethod = null;
                    
                    // Try to find user by username first
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
                    
                    // If not found by username, try email
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

// --- SSE Progress Tracking ---
const importProgressStreams = new Map(); // sessionId -> res

// SSE endpoint for import progress
router.get('/import/progress/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });
    res.flushHeaders();
    importProgressStreams.set(sessionId, res);
    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
        res.write(': keep-alive\n\n');
        if (typeof res.flush === 'function') res.flush();
    }, 25000);
    req.on('close', () => {
        clearInterval(heartbeat);
        importProgressStreams.delete(sessionId);
    });
});

// Import users endpoint
router.post('/import', upload.single('file'), async (req, res, next) => {
    try {
        const { createIfNotExists = 'true', defaultPopulationId, defaultEnabled = 'true', generatePasswords = 'false', resolvePopulationConflict } = req.body;
        
        // Generate a sessionId for this import
        const sessionId = uuidv4();
        
        // Respond immediately with the sessionId
        res.json({ success: true, sessionId });
        
        // Start the import process in the background
        process.nextTick(() => {
            runImportProcess(req, sessionId, { createIfNotExists, defaultPopulationId, defaultEnabled, generatePasswords, resolvePopulationConflict });
        });
        
    } catch (error) {
        next(error);
    }
});

// Resolve population conflict endpoint
router.post('/import/resolve-conflict', async (req, res, next) => {
    try {
        const { sessionId, useCsvPopulation, useUiPopulation } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID is required' });
        }
        
        if (useCsvPopulation === undefined && useUiPopulation === undefined) {
            return res.status(400).json({ error: 'Must specify either useCsvPopulation or useUiPopulation' });
        }
        
        // Store the resolution in a way that the background process can access
        // For now, we'll use a simple in-memory store
        if (!global.populationConflictResolutions) {
            global.populationConflictResolutions = new Map();
        }
        
        global.populationConflictResolutions.set(sessionId, {
            useCsvPopulation: useCsvPopulation === true,
            useUiPopulation: useUiPopulation === true
        });
        
        res.json({ success: true, message: 'Population conflict resolved' });
        
    } catch (error) {
        next(error);
    }
});

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
        
        res.json({ success: true, message: 'Invalid population resolved' });
        
    } catch (error) {
        next(error);
    }
});

// Helper: Validate UUID v4
function isValidUUID(uuid) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
}

// Helper: Fetch default population from PingOne
async function fetchDefaultPopulationId(environmentId) {
    try {
        const response = await fetch(`http://127.0.0.1:4000/api/pingone/environments/${environmentId}/populations`);
        if (!response.ok) throw new Error('Failed to fetch populations');
        const data = await response.json();
        const pops = data._embedded?.populations || [];
        // Prefer population with default: true
        let defaultPop = pops.find(p => p.default === true);
        if (!defaultPop) defaultPop = pops[0];
        return defaultPop ? defaultPop.id : null;
    } catch (e) {
        console.error('Error fetching default population:', e);
        return null;
    }
}

// Helper: Read default population from settings.json
async function getDefaultPopulationIdFromSettings() {
    try {
        const settingsData = await fetch('http://localhost:4000/api/settings').then(res => res.json());
        const settings = settingsData.success && settingsData.data ? settingsData.data : settingsData;
        // Try both camelCase and kebab-case
        return settings.defaultPopulationId || settings['defaultPopulationId'] || settings.populationId || settings['population-id'] || '';
    } catch (e) {
        console.error('Error reading default population from settings:', e);
        return '';
    }
}

// Background import process function
async function runImportProcess(req, sessionId, options) {
    const { createIfNotExists, defaultPopulationId, defaultEnabled, generatePasswords } = options;
    
    try {
        // Send initial progress event
        const initialSseRes = importProgressStreams.get(sessionId);
        if (initialSseRes) {
            initialSseRes.write(`event: progress\ndata: ${JSON.stringify({ 
                current: 0, 
                total: 0, 
                message: 'Starting import...',
                counts: { succeeded: 0, failed: 0, skipped: 0 }
            })}\n\n`);
        }

        // Parse CSV data
        const csvContent = req.file.buffer.toString('utf8');
        const lines = csvContent.split('\n').filter(line => line.trim());
        if (lines.length < 2) {
            const csvErrorSseRes = importProgressStreams.get(sessionId);
            if (csvErrorSseRes) {
                csvErrorSseRes.write(`event: error\ndata: ${JSON.stringify({ error: 'Invalid CSV file', message: 'CSV file must have at least a header row and one data row' })}\n\n`);
                csvErrorSseRes.end();
                importProgressStreams.delete(sessionId);
            }
            return;
        }
        
        const headers = lines[0].split(',').map(h => h.trim());
        const users = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            const user = {};
            headers.forEach((header, index) => {
                let value = values[index] || '';
                if (value.startsWith('"') && value.endsWith('"')) {
                    value = value.slice(1, -1);
                }
                user[header] = value;
            });
            if (user.username || user.email) {
                users.push(user);
            }
        }
        
        if (users.length === 0) {
            const noUsersSseRes = importProgressStreams.get(sessionId);
            if (noUsersSseRes) {
                noUsersSseRes.write(`event: error\ndata: ${JSON.stringify({ error: 'No valid users found', message: 'CSV file must contain at least one user with username or email' })}\n\n`);
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
        
        if (!environmentId) {
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
        
        // Check for population conflict: CSV has population data AND UI has selected population
        const hasCsvPopulationData = users.some(user => user.populationId && user.populationId.trim() !== '');
        const hasUiSelectedPopulation = defaultPopulationId && defaultPopulationId.trim() !== '';
        
        let populationConflict = false;
        let populationConflictMessage = '';
        
        if (hasCsvPopulationData && hasUiSelectedPopulation) {
            populationConflict = true;
            populationConflictMessage = `CSV file contains population data AND you selected a population in the UI. Please choose which to use:
            
CSV Population Data: ${users.filter(u => u.populationId && u.populationId.trim() !== '').length} users have population IDs
UI Selected Population: ${defaultPopulationId}

This conflict needs to be resolved before import can proceed.`;
            
            // Check if conflict has been resolved
            const conflictResolution = global.populationConflictResolutions?.get(sessionId);
            if (conflictResolution) {
                // Use the resolution to determine which population to use
                if (conflictResolution.useCsvPopulation) {
                    console.log(`[IMPORT] Using CSV population data as resolved by user`);
                    // Continue with CSV population data (no change needed)
                } else if (conflictResolution.useUiPopulation) {
                    console.log(`[IMPORT] Using UI selected population as resolved by user`);
                    // Override all users to use the UI selected population
                    users.forEach(user => {
                        user.populationId = defaultPopulationId;
                    });
                }
                // Clear the resolution
                global.populationConflictResolutions.delete(sessionId);
            } else {
                // Send conflict event to frontend
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
        
        // Validate populations in CSV data
        const uniquePopulationIds = [...new Set(users.filter(u => u.populationId && u.populationId.trim() !== '').map(u => u.populationId))];
        const invalidPopulations = [];
        
        // Initialize availablePopulationIds at function scope
        let availablePopulationIds = [];
        
        // Always fetch available populations for validation and fallback logic
        try {
            const populationsResponse = await fetch(`http://127.0.0.1:4000/api/pingone/environments/${environmentId}/populations`);
            if (populationsResponse.ok) {
                const populationsData = await populationsResponse.json();
                availablePopulationIds = populationsData._embedded?.populations?.map(p => p.id) || [];
                console.log(`[IMPORT] Fetched ${availablePopulationIds.length} available population IDs`);
            } else {
                console.error('Could not fetch available populations for validation.');
            }
        } catch (e) {
            console.error('Error fetching available populations:', e);
        }
        
        if (!Array.isArray(availablePopulationIds) || availablePopulationIds.length === 0) {
            console.error('Population list is unavailable. Cannot validate population.');
        }
        
        if (uniquePopulationIds.length > 0) {
            console.log(`[IMPORT] Validating ${uniquePopulationIds.length} unique population IDs from CSV`);
            
            // --- PATCH: Assign defaultPopulationId if missing/invalid ---
            users.forEach(user => {
                if (!user.populationId || !isValidUUID(user.populationId) || !availablePopulationIds.includes(user.populationId)) {
                    user.populationId = defaultPopulationId;
                }
            });
            // --- END PATCH ---
            console.log(`[IMPORT] Found ${invalidPopulations.length} invalid populations:`, invalidPopulations);
        }
        
        // Handle invalid populations
        if (invalidPopulations.length > 0) {
            const invalidPopulationMessage = `CSV contains ${invalidPopulations.length} invalid population ID(s): ${invalidPopulations.join(', ')}. Please choose a valid population to use for these users.`;
            
            // Check if invalid population has been resolved
            const invalidPopulationResolution = global.invalidPopulationResolutions?.get(sessionId);
            if (invalidPopulationResolution) {
                console.log(`[IMPORT] Using resolved population for invalid populations: ${invalidPopulationResolution.selectedPopulationId}`);
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
                console.log('[IMPORT] Assigned settings.json default population to all users');
            } else {
                // Try to fetch default from PingOne
                const fallbackPopId = await fetchDefaultPopulationId(environmentId);
                if (fallbackPopId && availablePopulationIds.includes(fallbackPopId)) {
                    users.forEach(u => u.populationId = fallbackPopId);
                    console.log('[IMPORT] Assigned PingOne default population to all users');
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
        
        // Process users through the PingOne API
        const results = {
            total: users.length,
            created: 0,
            failed: 0,
            skipped: 0,
            details: []
        };
        
        const batchSize = 5;
        const delayBetweenBatches = 1000;
        let processed = 0;
        
        for (let i = 0; i < users.length; i += batchSize) {
            const batch = users.slice(i, i + batchSize);
            for (const user of batch) {
                let status = 'unknown';
                try {
                    // Check if user already exists in the selected population
                    let existingUser = null;
                    const populationId = user.populationId || defaultPopulationId || settings.populationId;
                    const username = user.username;
                    const email = user.email;
                    console.log(`[IMPORT] Checking user ${username || email} in population ${populationId}`);

                    // Try to find user by username in selected population
                    if (username) {
                        const lookupResponse = await fetch(`http://127.0.0.1:4000/api/pingone/environments/${environmentId}/users?filter=username eq \"${encodeURIComponent(username)}\" and population.id eq \"${encodeURIComponent(populationId)}\"`);
                        if (lookupResponse.ok) {
                            const lookupData = await lookupResponse.json();
                            if (lookupData._embedded?.users?.length > 0) {
                                existingUser = lookupData._embedded.users[0];
                            }
                        }
                    }

                    // If not found by username, try email in selected population
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
                    console.log(`[IMPORT] Import check: ${username || email} exists = ${existsInPopulation}, status = ${status}`);

                    // If user exists in selected population, skip (no modifications during import)
                    if (existingUser) {
                        console.log(`[IMPORT] User ${username || email} exists in population ${populationId}, skipping`);
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
                        // Defensive: ensure populationId is valid and allowed
                        let finalPopulationId = user.populationId;
                        if (!isValidUUID(finalPopulationId) || !availablePopulationIds.includes(finalPopulationId)) {
                            console.error(`[IMPORT] Skipping user ${user.username || user.email}: invalid populationId '${finalPopulationId}'`);
                            results.failed++;
                            status = 'failed';
                            results.details.push({ user, status, error: `Invalid populationId: ${finalPopulationId}` });
                            continue;
                        }
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
                        // Add password if generatePasswords is enabled
                        if (generatePasswords === 'true') {
                            userData.password = {
                                value: Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8)
                            };
                        }
                        console.log(`[IMPORT] Creating user: ${user.username || user.email} in population ${finalPopulationId}`);
                        console.log(`[IMPORT] User data:`, userData);
                        
                        const createResponse = await fetch(`http://127.0.0.1:4000/api/pingone/environments/${environmentId}/users`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(userData)
                        });
                        
                        console.log(`[IMPORT] Create response status: ${createResponse.status}`);
                        
                        if (createResponse.ok) {
                            const createdUser = await createResponse.json();
                            console.log(`[IMPORT] User created successfully: ${createdUser.id}`);
                            results.created++;
                            status = 'created';
                            results.details.push({ user, status, pingOneId: createdUser.id });
                        } else {
                            const errorData = await createResponse.json().catch(() => ({}));
                            console.error(`[IMPORT] Failed to create user: ${createResponse.status} - ${JSON.stringify(errorData)}`);
                            results.failed++;
                            status = 'failed';
                            results.details.push({ user, status, error: errorData.message || 'Failed to create user', statusCode: createResponse.status });
                        }
                    }
                    
                } catch (error) {
                    results.failed++;
                    status = 'failed';
                    results.details.push({ user, status, error: error.message });
                }
                
                processed++;
                
                // Send progress event for each user
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
                    console.log(`[IMPORT] Sending progress event:`, progressData);
                    progressSseRes.write(`event: progress\ndata: ${JSON.stringify(progressData)}\n\n`);
                } else {
                    console.warn(`[IMPORT] No SSE stream found for session ${sessionId}`);
                }
            }
            
            // Add delay between batches
            if (i + batchSize < users.length && delayBetweenBatches > 0) {
                await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
            }
        }
        
        // Send final event
        const finalSseRes = importProgressStreams.get(sessionId);
        if (finalSseRes) {
            finalSseRes.write(`event: done\ndata: ${JSON.stringify({ success: true, ...results })}\n\n`);
            finalSseRes.end();
            importProgressStreams.delete(sessionId);
        }
    } catch (error) {
        // If error, send to SSE
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

// Dedicated endpoint to return populations as an array
router.get('/pingone/populations', async (req, res, next) => {
    try {
        console.log('[DEBUG] /api/pingone/populations called from routes/api/index.js');
        
        // Get settings from the correct server
        const settingsResponse = await fetch('http://localhost:4000/api/settings');
        if (!settingsResponse.ok) {
            console.error('[DEBUG] Failed to fetch settings:', settingsResponse.status);
            return res.status(500).json({ 
                error: 'Failed to load settings',
                message: 'Could not load settings from server'
            });
        }
        
        const settingsData = await settingsResponse.json();
        
        // Handle both formats: direct settings object or {success, data} format
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

// Dedicated endpoint to get access token for frontend
router.post('/pingone/get-token', async (req, res, next) => {
    try {
        console.log('[DEBUG] /api/pingone/get-token called from routes/api/index.js');
        
        // Get token manager from app
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
        
        // Get access token
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
        
        // Get token expiry information
        const tokenInfo = tokenManager.getTokenInfo();
        
        console.log('[DEBUG] Token retrieved successfully, token info:', {
            hasToken: !!token,
            tokenLength: token ? token.length : 0,
            expiresIn: tokenInfo ? tokenInfo.expiresIn : 'unknown',
            isValid: tokenInfo ? tokenInfo.isValid : false
        });
        
        // Return token in the format expected by PingOneClient
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

export default router;
