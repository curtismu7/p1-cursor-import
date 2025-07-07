import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Test the new modify status update functionality
async function testModifyStatusUpdate() {
    try {
        console.log('Testing Modify User Status Update functionality...');
        console.log('===============================================');
        
        // Test data with enabled status
        const testUsers = [
            {
                username: 'test-user-1@example.com',
                email: 'test-user-1@example.com',
                firstName: 'Test',
                lastName: 'User1',
                enabled: true
            },
            {
                username: 'test-user-2@example.com',
                email: 'test-user-2@example.com',
                firstName: 'Test',
                lastName: 'User2',
                enabled: false
            },
            {
                username: 'test-user-3@example.com',
                email: 'test-user-3@example.com',
                firstName: 'Test',
                lastName: 'User3',
                enabled: 'true'  // String value
            },
            {
                username: 'test-user-4@example.com',
                email: 'test-user-4@example.com',
                firstName: 'Test',
                lastName: 'User4',
                enabled: 'false'  // String value
            }
        ];
        
        console.log('Test users with enabled status:');
        testUsers.forEach((user, index) => {
            console.log(`  ${index + 1}. ${user.username} - enabled: ${user.enabled} (${typeof user.enabled})`);
        });
        
        console.log('\nModify options that would be used:');
        console.log('  - updateUserStatus: true');
        console.log('  - createIfNotExists: false');
        console.log('  - batchSize: 10');
        console.log('  - delayBetweenBatches: 1000');
        
        console.log('\nExpected behavior:');
        console.log('  1. Users with enabled: true should be enabled in PingOne');
        console.log('  2. Users with enabled: false should be disabled in PingOne');
        console.log('  3. String values "true"/"false" should be converted to boolean');
        console.log('  4. Only enabled status should be updated when updateUserStatus is true');
        console.log('  5. Other fields should be updated normally');
        
        console.log('\nCSV format for testing:');
        console.log('username,email,firstName,lastName,enabled');
        testUsers.forEach(user => {
            console.log(`${user.username},${user.email},${user.firstName},${user.lastName},${user.enabled}`);
        });
        
        console.log('\nTo test this functionality:');
        console.log('1. Create a CSV file with the above data');
        console.log('2. Go to the Modify Users section in the web app');
        console.log('3. Check the "Update user status (enabled/disabled)" option');
        console.log('4. Upload the CSV file and run the modify operation');
        console.log('5. Check the results to see if user status was updated');
        
        console.log('\nNote: This test assumes the PingOne API supports updating the enabled field.');
        console.log('If the API returns an error about immutable fields, the functionality may need adjustment.');
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

testModifyStatusUpdate(); 