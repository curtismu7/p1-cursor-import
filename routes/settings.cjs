const express = require('express');
const { join, dirname } = require('path');
const fs = require('fs').promises;

const router = express.Router();

// Path to settings file
const SETTINGS_PATH = join(__dirname, "../data/settings.json");

// Helper function to read settings
async function readSettings() {
    try {
        const data = await fs.readFile(SETTINGS_PATH, "utf8");
        return JSON.parse(data);
    } catch (error) {
        if (error.code === "ENOENT") {
            // Return default settings if file doesn"t exist
            return {
                environmentId: "",
                apiClientId: "",
                populationId: "",
                region: "NorthAmerica"
            };
        }
        throw error;
    }
}

// Get settings
router.get("/", async (req, res) => {
    try {
        const settings = await readSettings();
        // Return all settings including apiSecret (it's already encrypted)
        res.json({
            success: true,
            data: settings
        });
    } catch (error) {
        console.error("Error reading settings:", error);
        res.status(500).json({
            success: false,
            error: "Failed to load settings"
        });
    }
});

// Update settings
router.post("/", express.json(), async (req, res) => {
    try {
        const newSettings = req.body;
        
        // Validate required fields
        if (!newSettings.environmentId || !newSettings.apiClientId) {
            return res.status(400).json({
                success: false,
                error: "Missing required fields: Environment ID and API Client ID are required"
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
            console.warn("Could not read existing settings:", error.message);
        }

        // Ensure directory exists
        const settingsDir = dirname(SETTINGS_PATH);
        await fs.mkdir(settingsDir, { recursive: true });
        
        // Save settings
        await fs.writeFile(SETTINGS_PATH, JSON.stringify(newSettings, null, 2), "utf8");
        
        // Don't send the API secret back in the response
        const { apiSecret, ...responseSettings } = newSettings;
        
        res.json({
            success: true,
            message: "Settings saved successfully",
            data: responseSettings
        });
    } catch (error) {
        console.error("Error saving settings:", error);
        res.status(500).json({
            success: false,
            error: "Failed to save settings",
            details: error.message
        });
    }
});

module.exports = router;
