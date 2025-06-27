const fs = require('fs').promises;
const path = require('path');
const { PingOneAPI } = require('./public/js/modules/pingone-api');
const { Logger } = require('./public/js/modules/logger');
const { SettingsManager } = require('./public/js/modules/settings-manager');

// Create a simple console logger
class ConsoleLogger {
    log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    }
    
    error(message, error) {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] [ERROR] ${message}`, error || '');
    }
}

async function runTest() {
    const logger = new ConsoleLogger();
    const settingsManager = new SettingsManager(logger);
    
    try {
        // Load settings
        await settingsManager.loadSettings();
        
        // Initialize PingOne API
        const pingOneAPI = new PingOneAPI(logger, settingsManager);
        
        // Test user data
        const testUser = {
            email: `testuser.${Date.now()}@example.com`,
            firstName: 'Test',
            lastName: 'User',
            username: `testuser.${Date.now()}`,
            password: 'P@ssw0rd!',
            enabled: true
        };
        
        logger.log('Starting test import...');
        
        // Step 1: Check if user exists (should not exist)
        logger.log(`Checking if user exists: ${testUser.email}`);
        const userExists = await pingOneAPI.userExists(testUser.email);
        logger.log(`User exists: ${userExists}`);
        
        if (userExists) {
            logger.log('Test user already exists, skipping test');
            return;
        }
        
        // Step 2: Import the test user
        logger.log('Importing test user...');
        const importResult = await pingOneAPI.importUsers([testUser]);
        logger.log('Import result:', JSON.stringify(importResult, null, 2));
        
        // Step 3: Verify the user was imported
        logger.log('Verifying user was imported...');
        const userStillExists = await pingOneAPI.userExists(testUser.email);
        logger.log(`User exists after import: ${userStillExists}`);
        
        if (userStillExists) {
            logger.log('✅ Test passed: User was successfully imported');
        } else {
            logger.log('❌ Test failed: User was not imported');
        }
        
    } catch (error) {
        logger.error('Test failed with error:', error);
        process.exit(1);
    }
}

// Run the test
runTest().catch(console.error);
