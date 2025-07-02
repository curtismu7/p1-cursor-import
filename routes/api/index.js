import { Router } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

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

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
