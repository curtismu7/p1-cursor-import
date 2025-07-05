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

// Helper function to read settings
async function readSettings() {
    // First, check environment variables
    const envSettings = {
        environmentId: process.env.PINGONE_ENVIRONMENT_ID || "",
        apiClientId: process.env.PINGONE_CLIENT_ID || "",
        apiSecret: process.env.PINGONE_CLIENT_SECRET ? `enc:${Buffer.from(process.env.PINGONE_CLIENT_SECRET).toString('base64')}` : "",
        populationId: process.env.PINGONE_POPULATION_ID || "",
        region: process.env.PINGONE_REGION || "NorthAmerica"
    };

    try {
        // Then try to read from settings file
        const data = await fs.readFile(SETTINGS_PATH, "utf8");
        const fileSettings = JSON.parse(data);
        
        // Merge with environment variables (env vars take precedence)
        return { ...fileSettings, ...envSettings };
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
        
        // Save settings
        await fs.writeFile(SETTINGS_PATH, JSON.stringify(newSettings, null, 2), "utf8");
        
        // Log successful settings save
        logger.info('Settings saved successfully', {
            environmentId: newSettings.environmentId ? '***' + newSettings.environmentId.slice(-4) : 'not set',
            region: newSettings.region,
            apiClientId: newSettings.apiClientId ? '***' + newSettings.apiClientId.slice(-4) : 'not set',
            populationId: newSettings.populationId ? '***' + newSettings.populationId.slice(-4) : 'not set',
            hasApiSecret: !!newSettings.apiSecret
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
