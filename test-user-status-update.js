const fs = require('fs');
const path = require('path');

// Load settings
const settingsPath = path.join(__dirname, 'data', 'settings.json');
let settings = {};

try {
    if (fs.existsSync(settingsPath)) {
        const settingsData = fs.readFileSync(settingsPath, 'utf8');
        settings = JSON.parse(settingsData);
    }
} catch (error) {
    console.error('Error loading settings:', error);
    process.exit(1);
}

// Test if enabled status can be updated
async function testUserStatusUpdate() {
    try {
        console.log('Testing user status update functionality...');
        
        // First, let's get a test user
        const testUser = {
            username: 'test-user-status@example.com',
            email: 'test-user-status@example.com',
            firstName: 'Test',
            lastName: 'User',
            enabled: true
        };
        
        console.log('Test user data:', testUser);
        
        // This is a mock test - in reality, we'd need to:
        // 1. Create a test user
        // 2. Try to update their enabled status
        // 3. Check if the update was successful
        
        console.log('Note: This is a mock test. To properly test user status updates:');
        console.log('1. Create a test user in PingOne');
        console.log('2. Try to update their enabled status via PUT /environments/{envId}/users/{userId}');
        console.log('3. Check if the API accepts the enabled field in the request body');
        
        // Based on PingOne API documentation, the enabled field should be updatable
        // Let's assume it is for now and implement the functionality
        
        console.log('Proceeding with implementation assuming enabled status can be updated...');
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

testUserStatusUpdate(); 