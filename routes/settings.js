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

// Helper function to update .env file
async function updateEnvFile(settings) {
    try {
        let envContent = '';
        
        // Read existing .env file if it exists
        try {
            envContent = await fs.readFile(ENV_FILE_PATH, 'utf8');
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
            // File doesn't exist, start with empty content
        }
        
        // Parse existing content
        const envLines = envContent.split('\n');
        const envMap = new Map();
        
        // Parse existing environment variables
        for (const line of envLines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const equalIndex = trimmed.indexOf('=');
                if (equalIndex > 0) {
                    const key = trimmed.substring(0, equalIndex);
                    const value = trimmed.substring(equalIndex + 1);
                    envMap.set(key, value);
                }
            }
        }
        
        // Update with new settings
        if (settings.environmentId) {
            envMap.set('PINGONE_ENVIRONMENT_ID', settings.environmentId);
        }
        if (settings.apiClientId) {
            envMap.set('PINGONE_CLIENT_ID', settings.apiClientId);
        }
        if (settings.apiSecret) {
            // For .env file, we want to store the original unencrypted value
            // The frontend sends encrypted values, but we should store the original
            // Check if this is a new API secret (not encrypted) or if we need to handle it differently
            if (settings.apiSecret.startsWith('enc:')) {
                // This is an encrypted value from the frontend
                // We can't decrypt it without the encryption key, so we'll skip updating the .env file
                // The .env file will keep its current value
                logger.info('Skipping encrypted API secret for .env file (keeping existing value)');
            } else {
                // This is an unencrypted value, store it directly
                envMap.set('PINGONE_CLIENT_SECRET', settings.apiSecret);
                logger.info('Stored unencrypted API secret in .env file');
            }
        }
        if (settings.populationId) {
            envMap.set('PINGONE_POPULATION_ID', settings.populationId);
        }
        if (settings.region) {
            envMap.set('PINGONE_REGION', settings.region);
        }
        if (settings.rateLimit) {
            envMap.set('RATE_LIMIT', settings.rateLimit.toString());
        }
        
        // Write back to .env file
        const newEnvContent = Array.from(envMap.entries())
            .map(([key, value]) => `${key}=${value}`)
            .join('\n') + '\n';
        
        await fs.writeFile(ENV_FILE_PATH, newEnvContent, 'utf8');
        logger.info('Updated .env file with new settings');
        
    } catch (error) {
        logger.warn('Failed to update .env file', { error: error.message });
        // Don't fail the entire operation if .env update fails
    }
}

// Helper function to fetch default population from PingOne
async function fetchDefaultPopulation(environmentId, clientId, clientSecret) {
    try {
        const https = await import('https');
        const { URLSearchParams } = await import('url');
        
        // Get access token
        const tokenUrl = `https://auth.pingone.com/${environmentId}/as/token`;
        const postData = new URLSearchParams({
            'grant_type': 'client_credentials'
        }).toString();
        
        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        
        const token = await new Promise((resolve, reject) => {
            const options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${credentials}`,
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = https.request(tokenUrl, options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (response.access_token) {
                            resolve(response.access_token);
                        } else {
                            reject(new Error(`Token request failed: ${data}`));
                        }
                    } catch (error) {
                        reject(new Error(`Invalid JSON response: ${data}`));
                    }
                });
            });

            req.on('error', reject);
            req.write(postData);
            req.end();
        });

        // Get populations
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

// Helper function to read settings
async function readSettings() {
    // First, check environment variables
    const envSettings = {
        environmentId: process.env.PINGONE_ENVIRONMENT_ID || "",
        apiClientId: process.env.PINGONE_CLIENT_ID || "",
        apiSecret: process.env.PINGONE_CLIENT_SECRET ? `enc:${Buffer.from(process.env.PINGONE_CLIENT_SECRET).toString('base64')}` : "",
        populationId: process.env.PINGONE_POPULATION_ID || "not set",
        region: process.env.PINGONE_REGION || "NorthAmerica",
        rateLimit: parseInt(process.env.RATE_LIMIT) || 50
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
        if (error.code === "ENOENT") {
            // Return environment-based settings if file doesn't exist
            return envSettings;
        }
        throw error;
    }
}

// Get settings
router.get("/", async (req, res) => {
    try {
        const settings = await readSettings();
        
        // Check if apiSecret is encrypted and clear it if it might cause decryption issues
        if (settings.apiSecret && settings.apiSecret.startsWith('enc:')) {
            // For now, we'll return the encrypted value and let the frontend handle decryption
            // The frontend will clear it if decryption fails
        }
        
        // Log the settings being returned (without sensitive data)
        const logSettings = { ...settings };
        if (logSettings.apiSecret) {
            logSettings.apiSecret = '***';
        }
        logger.info('Settings requested and returned', {
            environmentId: logSettings.environmentId ? '***' + logSettings.environmentId.slice(-4) : 'not set',
            region: logSettings.region,
            apiClientId: logSettings.apiClientId ? '***' + logSettings.apiClientId.slice(-4) : 'not set',
            populationId: logSettings.populationId ? '***' + logSettings.populationId.slice(-4) : 'not set'
        });
        
        // Return all settings including apiSecret (it's already encrypted)
        res.json({
            success: true,
            data: settings
        });
    } catch (error) {
        logger.error("Error reading settings", { error: error.message });
        res.status(500).json({
            success: false,
            error: "Failed to load settings"
        });
    }
});

// Update settings
router.post("/", express.json(), async (req, res) => {
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
        
        // Validate required fields
        if (!newSettings.environmentId || !newSettings.apiClientId) {
            return res.status(400).json({
                success: false,
                error: "Missing required fields: Environment ID and API Client ID are required"
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
            // If apiSecret exists in existing settings but not in the update, preserve it
            if (existingSettings.apiSecret && !newSettings.apiSecret) {
                newSettings.apiSecret = existingSettings.apiSecret;
            }
        } catch (error) {
            // If we can't read existing settings, continue with the new settings as-is
            logger.warn("Could not read existing settings", { error: error.message });
        }

        // Ensure directory exists
        const settingsDir = dirname(SETTINGS_PATH);
        await fs.mkdir(settingsDir, { recursive: true });
        
        // Save settings to file
        await fs.writeFile(SETTINGS_PATH, JSON.stringify(newSettings, null, 2), "utf8");
        
        // Update environment variables (but skip encrypted API secret)
        await updateEnvironmentVariables(newSettings);

        // Update .env file
        await updateEnvFile(newSettings);
        
        // Update rate limiter if rate limit changed
        if (newSettings.rateLimit) {
            // Get the app instance to call updateRateLimiter
            const app = req.app;
            if (app && typeof app.get === 'function') {
                const updateRateLimiter = app.get('updateRateLimiter');
                if (updateRateLimiter && typeof updateRateLimiter === 'function') {
                    updateRateLimiter(newSettings.rateLimit);
                }
            }
        }
        
        // Log successful settings save
        logger.info('Settings saved successfully', {
            environmentId: newSettings.environmentId ? '***' + newSettings.environmentId.slice(-4) : 'not set',
            region: newSettings.region,
            apiClientId: newSettings.apiClientId ? '***' + newSettings.apiClientId.slice(-4) : 'not set',
            populationId: newSettings.populationId ? '***' + newSettings.populationId.slice(-4) : 'not set',
            hasApiSecret: !!newSettings.apiSecret,
            apiSecretEncrypted: newSettings.apiSecret ? newSettings.apiSecret.startsWith('enc:') : false
        });
        
        // Don't send the API secret back in the response
        const { apiSecret, ...responseSettings } = newSettings;
        
        res.json({
            success: true,
            message: "Settings saved successfully",
            data: responseSettings
        });
    } catch (error) {
        logger.error("Error saving settings", { error: error.message });
        res.status(500).json({
            success: false,
            error: "Failed to save settings",
            details: error.message
        });
    }
});

export default router;
