import { Router } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Configure multer for file uploads
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Settings file path
const SETTINGS_PATH = path.join(__dirname, '../../data/settings.json');

// Ensure settings directory exists
async function ensureSettingsDir() {
    const dir = path.dirname(SETTINGS_PATH);
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
    }
}

// Get current settings
router.get('/settings', async (req, res, next) => {
    try {
        await ensureSettingsDir();
        const data = await fs.readFile(SETTINGS_PATH, 'utf8').catch(() => '{}');
        res.json(JSON.parse(data));
    } catch (error) {
        next(error);
    }
});

// Update settings
router.put('/settings', async (req, res, next) => {
    try {
        await ensureSettingsDir();
        await fs.writeFile(SETTINGS_PATH, JSON.stringify(req.body, null, 2));
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

// POST endpoint for settings (same as PUT for compatibility)
router.post('/settings', async (req, res, next) => {
    try {
        await ensureSettingsDir();
        await fs.writeFile(SETTINGS_PATH, JSON.stringify(req.body, null, 2));
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

// Note: Health endpoint is handled by the main server at /api/health
// This provides comprehensive server status including PingOne connection state

/**
 * Generate a sequential filename for exports
 * @param {string} baseName - Base filename without extension
 * @param {string} extension - File extension (e.g., 'csv', 'json')
 * @returns {string} Filename with sequential number
 */
function generateSequentialFilename(baseName, extension) {
    // For server-side, we'll use a simple counter based on current time
    // In a production environment, you might want to use a database or file-based counter
    const timestamp = Date.now();
    const date = new Date().toISOString().split('T')[0];
    const counter = Math.floor((timestamp % 1000000) / 1000); // Simple counter based on timestamp
    return `${baseName}-${date}-${counter.toString().padStart(3, '0')}.${extension}`;
}

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

        console.log('Export request:', {
            populationId,
            fields,
            format,
            ignoreDisabledUsers: shouldIgnoreDisabledUsers,
            pingOneUrl
        });

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
                details: errorData
            });
        }

        const usersData = await pingOneResponse.json();
        let users = usersData._embedded?.users || [];
        
        // Log the first user to debug population information
        if (users.length > 0) {
            console.log('First user population info:', {
                userId: users[0].id,
                population: users[0].population,
                hasPopulationName: !!users[0].population?.name
            });
        }
        
        // Track ignored disabled users
        let ignoredCount = 0;
        let ignoredUsers = [];
        
        // Filter out disabled users if ignoreDisabledUsers is true
        if (shouldIgnoreDisabledUsers) {
            const originalCount = users.length;
            ignoredUsers = users.filter(user => user.enabled === false);
            users = users.filter(user => user.enabled !== false);
            ignoredCount = originalCount - users.length;
            // Log each ignored user to disk
            if (ignoredUsers.length > 0) {
                const logPath = path.join(__dirname, '../../data/export-ignored-users.log');
                const logLines = ignoredUsers.map(u =>
                    `[${new Date().toISOString()}] Ignored disabled user: username=${u.username || ''}, email=${u.email || ''}, id=${u.id || ''}`
                ).join('\n') + '\n';
                await fs.appendFile(logPath, logLines);
                // Server-side log
                console.log(`[Export] Ignored ${ignoredUsers.length} disabled user(s):`, ignoredUsers.map(u => ({ username: u.username, email: u.email, id: u.id })));
                // Persistent server log
                const serverLogPath = path.join(__dirname, '../../data/server-export.log');
                const serverLogEntry = `[${new Date().toISOString()}] [INFO] Export ignored ${ignoredUsers.length} disabled user(s): ${JSON.stringify(ignoredUsers.map(u => ({ username: u.username, email: u.email, id: u.id })))}\n`;
                await fs.appendFile(serverLogPath, serverLogEntry);
            }
        }

        // Check if population information is available in user objects
        const hasPopulationInfo = users.length > 0 && users[0].population && typeof users[0].population === 'object';
        
        // If population info is not available, try to fetch it separately
        if (!hasPopulationInfo && populationId && populationId.trim() !== '') {
            try {
                console.log('Population info not available in user objects, fetching separately...');
                const populationResponse = await fetch(`http://127.0.0.1:4000/api/pingone/populations/${populationId.trim()}`);
                if (populationResponse.ok) {
                    const populationData = await populationResponse.json();
                    const populationName = populationData.name || '';
                    console.log('Fetched population name:', populationName);
                    
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
                console.warn('Failed to fetch population information separately:', error.message);
            }
        }
        
        // Process users based on fields selection
        let processedUsers = users;
        
        if (fields === 'basic') {
            // Basic fields only
            processedUsers = users.map(user => ({
                id: user.id,
                username: user.username,
                email: user.email,
                givenName: user.name?.given || '',
                familyName: user.name?.family || '',
                enabled: user.enabled,
                populationId: user.population?.id || '',
                populationName: user.population?.name || '',
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            }));
        } else if (fields === 'custom') {
            // For custom fields, include all non-standard fields
            processedUsers = users.map(user => {
                const customFields = {};
                Object.keys(user).forEach(key => {
                    // Skip standard fields and _links
                    if (!['id', 'username', 'email', 'name', 'enabled', 'population', 'createdAt', 'updatedAt', 'password', '_links'].includes(key)) {
                        const value = user[key];
                        // Handle nested objects by extracting meaningful values
                        if (typeof value === 'object' && value !== null) {
                            // For specific known objects, extract useful properties
                            if (key === 'environment' && value.id) {
                                customFields.environmentId = value.id;
                            } else if (key === 'account' && value.id) {
                                customFields.accountId = value.id;
                            } else if (key === 'identityProvider' && value.type) {
                                customFields.identityProviderType = value.type;
                            } else if (key === 'lifecycle' && value.status) {
                                customFields.lifecycleStatus = value.status;
                            } else if (key === 'address') {
                                customFields.streetAddress = value.streetAddress || '';
                                customFields.locality = value.locality || '';
                                customFields.region = value.region || '';
                                customFields.postalCode = value.postalCode || '';
                                customFields.countryCode = value.countryCode || '';
                            } else {
                                // For other objects, skip them to avoid [object Object]
                                console.warn(`Skipping complex object field: ${key}`);
                            }
                        } else {
                            customFields[key] = value;
                        }
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
                            console.warn(`Skipping unknown complex object field: ${key}`);
                        }
                    } else {
                        // For primitive values, include as-is
                        processedUser[key] = value;
                    }
                });
                
                return processedUser;
            });
        }

        // Format response based on requested format
        if (format === 'json') {
            res.json({
                success: true,
                total: processedUsers.length,
                ignored: ignoredCount,
                users: processedUsers
            });
        } else {
            // CSV format
            if (processedUsers.length === 0) {
                return res.status(404).json({
                    error: 'No users found',
                    message: 'No users found for the specified criteria'
                });
            }

            // Generate CSV headers
            const headers = Object.keys(processedUsers[0]);
            const csvContent = [
                headers.join(','),
                ...processedUsers.map(user => 
                    headers.map(header => {
                        const value = user[header];
                        // Ensure we don't have any objects in the final CSV
                        if (typeof value === 'object' && value !== null) {
                            console.warn(`Found object in CSV data for field ${header}, converting to empty string`);
                            return '';
                        }
                        // Escape CSV values
                        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                            return `"${value.replace(/"/g, '""')}"`;
                        }
                        return value === null || value === undefined ? '' : value;
                    }).join(',')
                )
            ].join('\n');

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('X-Ignored-Count', ignoredCount.toString());
            const fileName = generateSequentialFilename('pingone-users-export', 'csv');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.send(csvContent);
        }

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
        const settingsData = await fs.readFile(SETTINGS_PATH, 'utf8').catch(() => '{}');
        const settings = JSON.parse(settingsData);
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

// Dedicated endpoint to return populations as an array
router.get('/pingone/populations', async (req, res, next) => {
    try {
        // Read environmentId from settings.json
        const settingsData = await fs.readFile(SETTINGS_PATH, 'utf8').catch(() => '{}');
        const settings = JSON.parse(settingsData);
        const environmentId = settings.environmentId;
        if (!environmentId) {
            return res.status(400).json({ error: 'Missing environment ID in settings' });
        }
        // Fetch from the proxy (which handles auth)
        const response = await fetch('http://127.0.0.1:4000/api/pingone/environments/' + environmentId + '/populations', {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) {
            return res.status(response.status).json({ error: 'Failed to fetch populations', status: response.status });
        }
        const data = await response.json();
        const populations = data._embedded && Array.isArray(data._embedded.populations) ? data._embedded.populations : [];
        res.json(populations);
    } catch (error) {
        next(error);
    }
});

export default router;
