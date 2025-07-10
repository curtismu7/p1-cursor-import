import { Router } from 'express';
import multer from 'multer';
import { isFeatureEnabled, setFeatureFlag, getAllFeatureFlags, resetFeatureFlags } from '../../server/feature-flags.js';

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

// Import users endpoint
router.post('/import', upload.single('file'), async (req, res, next) => {
    try {
        const { createIfNotExists = 'true', defaultPopulationId, defaultEnabled = 'true', generatePasswords = 'false' } = req.body;
        
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
            created: 0,
            failed: 0,
            skipped: 0,
            details: []
        };
        
        // Process users in batches to avoid overwhelming the API
        const batchSize = 5;
        const delayBetweenBatches = 1000;
        
        for (let i = 0; i < users.length; i += batchSize) {
            const batch = users.slice(i, i + batchSize);
            
            for (const user of batch) {
                try {
                    // Check if user already exists
                    let existingUser = null;
                    
                    // Try to find user by username first
                    if (user.username) {
                        const lookupResponse = await fetch(`http://127.0.0.1:4000/api/pingone/environments/${environmentId}/users?filter=username eq "${encodeURIComponent(user.username)}"`);
                        
                        if (lookupResponse.ok) {
                            const lookupData = await lookupResponse.json();
                            if (lookupData._embedded?.users?.length > 0) {
                                existingUser = lookupData._embedded.users[0];
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
                            }
                        }
                    }
                    
                    // If user exists and createIfNotExists is disabled, skip
                    if (existingUser && createIfNotExists !== 'true') {
                        results.skipped++;
                        results.details.push({
                            user,
                            status: 'skipped',
                            reason: 'User already exists and createIfNotExists is disabled'
                        });
                        continue;
                    }
                    
                    // If user exists and createIfNotExists is enabled, skip (don't create duplicates)
                    if (existingUser) {
                        results.skipped++;
                        results.details.push({
                            user,
                            status: 'skipped',
                            reason: 'User already exists'
                        });
                        continue;
                    }
                    
                    // Create new user
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
                            reason: 'User created successfully'
                        });
                    } else {
                        results.failed++;
                        const errorData = await createResponse.json().catch(() => ({}));
                        results.details.push({
                            user,
                            status: 'failed',
                            error: errorData.message || 'Failed to create user',
                            statusCode: createResponse.status
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
            ...results,
            succeeded: results.created // Add succeeded as an alias for created
        });
        
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

export default router;
