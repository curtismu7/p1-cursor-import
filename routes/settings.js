import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import winston from 'winston';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
        service: 'settings',
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

const router = express.Router();

// Path to settings file
const SETTINGS_PATH = join(__dirname, "../data/settings.json");
const ENV_FILE_PATH = join(__dirname, "../.env");

// Helper function to update environment variables
async function updateEnvironmentVariables(settings) {
    if (settings.environmentId) {
        process.env.PINGONE_ENVIRONMENT_ID = settings.environmentId;
    }
    if (settings.apiClientId) {
        process.env.PINGONE_CLIENT_ID = settings.apiClientId;
    }
    if (settings.apiSecret) {
        // Handle encrypted API secret
        if (settings.apiSecret.startsWith('enc:')) {
            // This is an encrypted value from the frontend
            // We need to decrypt it before setting in environment
            try {
                // Import crypto utils for decryption
                const { CryptoUtils } = await import('../public/js/modules/crypto-utils.js');
                
                // For now, we'll skip setting the environment variable for encrypted values
                // The token manager should handle this by reading from settings file directly
                logger.info('API secret is encrypted, skipping environment variable update');
                logger.info('Token manager will read API secret from settings file');
            } catch (error) {
                logger.warn('Failed to handle encrypted API secret for environment variables', error);
            }
        } else {
            // This is an unencrypted value, use it directly
            process.env.PINGONE_CLIENT_SECRET = settings.apiSecret;
            logger.info('Updated API secret in environment variables');
        }
    }
    if (settings.populationId) {
        process.env.PINGONE_POPULATION_ID = settings.populationId;
    }
    if (settings.region) {
        process.env.PINGONE_REGION = settings.region;
    }
    if (settings.rateLimit) {
        process.env.RATE_LIMIT = settings.rateLimit.toString();
    }
}

// Helper function to read settings
async function readSettings() {
    // First, check environment variables
    const envSettings = {
        environmentId: process.env.PINGONE_ENVIRONMENT_ID || "",
        apiClientId: process.env.PINGONE_CLIENT_ID || "",
        apiSecret: process.env.PINGONE_CLIENT_SECRET ? `enc:${Buffer.from(process.env.PINGONE_CLIENT_SECRET).toString('base64')}` : "",
        populationId: process.env.PINGONE_POPULATION_ID || "not set",
        region: process.env.PINGONE_REGION || "NorthAmerica",
        rateLimit: parseInt(process.env.RATE_LIMIT) || 90
    };

    try {
        // Then try to read from settings file
        const data = await fs.readFile(SETTINGS_PATH, "utf8");
        const fileSettings = JSON.parse(data);
        // File settings take precedence; only use env if file is missing a value
        const settings = { ...envSettings, ...fileSettings };
        
        // Only auto-detect population ID if it's specifically set to "not set" (initial setup)
        // Empty string ("") means intentionally blank, so we respect that choice
        if (settings.populationId === "not set" && settings.environmentId && settings.apiClientId && process.env.PINGONE_CLIENT_SECRET) {
            const defaultPopulationId = await fetchDefaultPopulation(
                settings.environmentId,
                settings.apiClientId,
                process.env.PINGONE_CLIENT_SECRET
            );
            
            if (defaultPopulationId) {
                settings.populationId = defaultPopulationId;
                
                // Update the settings file with the new population ID
                try {
                    await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf8");
                    logger.info('Updated settings file with auto-detected population ID');
                } catch (error) {
                    logger.warn('Failed to update settings file with population ID', { error: error.message });
                }
                
                // Update environment variable
                process.env.PINGONE_POPULATION_ID = defaultPopulationId;
            }
        }
        
        return settings;
    } catch (error) {
        if (error.code === 'ENOENT') {
            // Settings file doesn't exist, return environment settings
            logger.info('Settings file not found, using environment variables only');
            return envSettings;
        }
        logger.error('Error reading settings file', { error: error.message });
        return envSettings;
    }
}

// Helper function to fetch default population
async function fetchDefaultPopulation(environmentId, clientId, clientSecret) {
    try {
        const https = await import('https');
        
        // Get access token first
        const tokenUrl = 'https://auth.pingone.com/as/token.oauth2';
        const tokenData = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret
        });

        const token = await new Promise((resolve, reject) => {
            const req = https.request(tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        resolve(response.access_token);
                    } catch (error) {
                        reject(new Error(`Invalid token response: ${data}`));
                    }
                });
            });

            req.on('error', reject);
            req.write(tokenData.toString());
            req.end();
        });

        // Fetch populations
        const apiUrl = `https://api.pingone.com/v1/environments/${environmentId}/populations`;
        
        const populations = await new Promise((resolve, reject) => {
            const options = {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            };

            const req = https.request(apiUrl, options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        resolve(response);
                    } catch (error) {
                        reject(new Error(`Invalid JSON response: ${data}`));
                    }
                });
            });

            req.on('error', reject);
            req.end();
        });

        if (populations._embedded && populations._embedded.populations && populations._embedded.populations.length > 0) {
            const defaultPopulation = populations._embedded.populations[0];
            logger.info('Auto-detected default population', {
                populationId: '***' + defaultPopulation.id.slice(-4),
                name: defaultPopulation.name,
                userCount: defaultPopulation.userCount || 0
            });
            return defaultPopulation.id;
        }
        
        return null;
    } catch (error) {
        logger.warn('Failed to fetch default population', { error: error.message });
        return null;
    }
}

// Get settings
router.get("/", async (req, res) => {
    try {
        const settings = await readSettings();
        
        // Convert kebab-case to camelCase for frontend compatibility
        const frontendSettings = {
            environmentId: settings['environment-id'] || settings.environmentId || '',
            apiClientId: settings['api-client-id'] || settings.apiClientId || '',
            apiSecret: settings['api-secret'] || settings.apiSecret || '',
            populationId: settings['population-id'] || settings.populationId || '',
            region: settings.region || 'NorthAmerica',
            rateLimit: parseInt(settings['rate-limit'] || settings.rateLimit || '100')
        };
        
        res.json({ success: true, data: frontendSettings });
    } catch (error) {
        logger.error('Error getting settings', { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get settings',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Update settings
router.post("/", express.json(), async (req, res) => {
    try {
        const newSettings = { ...req.body };
        
        // Convert camelCase to kebab-case for file storage
        const fileSettings = {
            'environment-id': newSettings.environmentId || newSettings['environment-id'] || '',
            'api-client-id': newSettings.apiClientId || newSettings['api-client-id'] || '',
            'api-secret': newSettings.apiSecret || newSettings['api-secret'] || '',
            'population-id': newSettings.populationId || newSettings['population-id'] || '',
            region: newSettings.region || 'NorthAmerica',
            'rate-limit': (newSettings.rateLimit || newSettings['rate-limit'] || 100).toString()
        };
        
        // Clean up environment ID - remove any surrounding quotes or backticks
        if (fileSettings['environment-id']) {
            fileSettings['environment-id'] = fileSettings['environment-id']
                .replace(/^[`'"]+/, '')  // Remove leading quotes/backticks
                .replace(/[`'"]+$/, ''); // Remove trailing quotes/backticks
            
            logger.info('Processing environment ID for save', { 
                environmentId: fileSettings['environment-id'] ? '***' + fileSettings['environment-id'].slice(-4) : 'not set' 
            });
        }
        
        // Only validate required fields if they are provided in the request
        // This allows the frontend to save partial settings
        if (fileSettings['environment-id'] !== undefined && !fileSettings['environment-id']) {
            return res.status(400).json({
                success: false,
                error: "Environment ID cannot be empty if provided"
            });
        }
        
        if (fileSettings['api-client-id'] !== undefined && !fileSettings['api-client-id']) {
            return res.status(400).json({
                success: false,
                error: "API Client ID cannot be empty if provided"
            });
        }
        
        // Ensure we're not saving any placeholder values
        if (fileSettings['environment-id'] === 'updated-env') {
            return res.status(400).json({
                success: false,
                error: "Please enter a valid environment ID"
            });
        }

        // Read existing settings to preserve the API secret if not provided in the update
        try {
            const existingSettings = await readSettings();
            // Only update api-secret if a new value is provided and not masked
            if (
              !('api-secret' in fileSettings) ||
              fileSettings['api-secret'] === '' ||
              fileSettings['api-secret'] === '********'
            ) {
              fileSettings['api-secret'] = existingSettings['api-secret'] || existingSettings.apiSecret || '';
              logger.info('Preserved existing API secret (not overwritten)');
            } else {
              logger.info('API secret will be updated with new value');
            }
        } catch (error) {
            logger.warn('Could not read existing settings to preserve API secret', { error: error.message });
        }

        // Ensure settings directory exists
        const settingsDir = dirname(SETTINGS_PATH);
        await fs.mkdir(settingsDir, { recursive: true });

        // Write settings to file
        await fs.writeFile(SETTINGS_PATH, JSON.stringify(fileSettings, null, 2), "utf8");
        
        // Update environment variables
        await updateEnvironmentVariables({
            environmentId: fileSettings['environment-id'],
            apiClientId: fileSettings['api-client-id'],
            apiSecret: fileSettings['api-secret'],
            populationId: fileSettings['population-id'],
            region: fileSettings.region,
            rateLimit: parseInt(fileSettings['rate-limit'])
        });
        
        logger.info('Settings updated successfully', {
            hasEnvironmentId: !!fileSettings['environment-id'],
            hasApiClientId: !!fileSettings['api-client-id'],
            hasApiSecret: !!fileSettings['api-secret'],
            hasPopulationId: !!fileSettings['population-id'],
            region: fileSettings.region
        });
        
        res.json({ 
            success: true, 
            message: 'Settings updated successfully',
            settings: {
                environmentId: fileSettings['environment-id'] ? '***' + fileSettings['environment-id'].slice(-4) : 'not set',
                apiClientId: fileSettings['api-client-id'] ? '***' + fileSettings['api-client-id'].slice(-4) : 'not set',
                apiSecret: fileSettings['api-secret'] ? '***' + fileSettings['api-secret'].slice(-4) : 'not set',
                populationId: fileSettings['population-id'] ? '***' + fileSettings['population-id'].slice(-4) : 'not set',
                region: fileSettings.region
            }
        });
        
    } catch (error) {
        logger.error('Error updating settings', { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: 'Failed to update settings',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// PUT endpoint for settings (same as POST for compatibility)
router.put("/", express.json(), async (req, res) => {
    // Delegate to POST handler by calling the same logic
    try {
        const newSettings = { ...req.body };
        
        // Clean up environment ID - remove any surrounding quotes or backticks
        if (newSettings.environmentId) {
            newSettings.environmentId = newSettings.environmentId
                .replace(/^[`'"]+/, '')  // Remove leading quotes/backticks
                .replace(/[`'"]+$/, ''); // Remove trailing quotes/backticks
            
            logger.info('Processing environment ID for save', { 
                environmentId: newSettings.environmentId ? '***' + newSettings.environmentId.slice(-4) : 'not set' 
            });
        }
        
        // Only validate required fields if they are provided in the request
        // This allows the frontend to save partial settings
        if (newSettings.environmentId !== undefined && !newSettings.environmentId) {
            return res.status(400).json({
                success: false,
                error: "Environment ID cannot be empty if provided"
            });
        }
        
        if (newSettings.apiClientId !== undefined && !newSettings.apiClientId) {
            return res.status(400).json({
                success: false,
                error: "API Client ID cannot be empty if provided"
            });
        }
        
        // Ensure we're not saving any placeholder values
        if (newSettings.environmentId === 'updated-env') {
            return res.status(400).json({
                success: false,
                error: "Please enter a valid environment ID"
            });
        }
        
        // Ensure region has a default value if not provided
        if (!newSettings.region) {
            newSettings.region = "NorthAmerica";
        }

        // Read existing settings to preserve the API secret if not provided in the update
        try {
            const existingSettings = await readSettings();
            // Only update apiSecret if a new value is provided and not masked
            if (
              !('apiSecret' in newSettings) ||
              newSettings.apiSecret === '' ||
              newSettings.apiSecret === '********'
            ) {
              newSettings.apiSecret = existingSettings.apiSecret;
              logger.info('Preserved existing API secret (not overwritten)');
            } else {
              logger.info('API secret will be updated with new value');
            }
        } catch (error) {
            logger.warn('Could not read existing settings to preserve API secret', { error: error.message });
        }

        // Ensure settings directory exists
        const settingsDir = dirname(SETTINGS_PATH);
        await fs.mkdir(settingsDir, { recursive: true });

        // Write settings to file
        await fs.writeFile(SETTINGS_PATH, JSON.stringify(newSettings, null, 2), "utf8");
        
        // Update environment variables
        await updateEnvironmentVariables(newSettings);
        
        logger.info('Settings updated successfully', {
            hasEnvironmentId: !!newSettings.environmentId,
            hasApiClientId: !!newSettings.apiClientId,
            hasApiSecret: !!newSettings.apiSecret,
            hasPopulationId: !!newSettings.populationId,
            region: newSettings.region
        });
        
        res.json({ 
            success: true, 
            message: 'Settings updated successfully',
            settings: {
                environmentId: newSettings.environmentId ? '***' + newSettings.environmentId.slice(-4) : 'not set',
                apiClientId: newSettings.apiClientId ? '***' + newSettings.apiClientId.slice(-4) : 'not set',
                apiSecret: newSettings.apiSecret ? '***' + newSettings.apiSecret.slice(-4) : 'not set',
                populationId: newSettings.populationId ? '***' + newSettings.populationId.slice(-4) : 'not set',
                region: newSettings.region
            }
        });
        
    } catch (error) {
        logger.error('Error updating settings', { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: 'Failed to update settings',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

export default router;
