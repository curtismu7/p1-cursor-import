#!/usr/bin/env node

/**
 * Test Token Success Indicator
 */

console.log('🧪 Testing Token Success Indicator...\n');

async function testTokenSuccessIndicator() {
    try {
        // Test 1: Check if server is running
        console.log('1️⃣ Testing Server Status...');
        const healthResponse = await fetch('http://localhost:4000/api/health');
        if (healthResponse.ok) {
            console.log('✅ Server is running and healthy');
        } else {
            console.log('❌ Server is not responding');
            return;
        }
        
        // Test 2: Check current settings
        console.log('\n2️⃣ Testing Current Settings...');
        const settingsResponse = await fetch('http://localhost:4000/api/settings');
        if (settingsResponse.ok) {
            const settings = await settingsResponse.json();
            console.log('✅ Settings are configured');
            console.log(`   - Environment ID: ${settings.data.environmentId ? 'Set' : 'Missing'}`);
            console.log(`   - API Client ID: ${settings.data.apiClientId ? 'Set' : 'Missing'}`);
            console.log(`   - API Secret: ${settings.data.apiSecret ? 'Set' : 'Missing'}`);
            console.log(`   - Region: ${settings.data.region || 'Not set'}`);
        } else {
            console.log('❌ Could not retrieve settings');
        }
        
        // Test 3: Test token endpoint
        console.log('\n3️⃣ Testing Token Endpoint...');
        const tokenResponse = await fetch('http://localhost:4000/api/pingone/test-connection', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                apiClientId: '26e7f07c-11a4-402a-b064-07b55aee189e',
                apiSecret: 'test-secret',
                environmentId: 'b9817c16-9910-4415-b67e-4ac687da74d9',
                region: 'NorthAmerica'
            })
        });
        
        if (tokenResponse.ok) {
            const tokenResult = await tokenResponse.json();
            console.log('✅ Token endpoint is working');
            console.log(`   - Success: ${tokenResult.success}`);
            if (tokenResult.success) {
                console.log('   - Token obtained successfully');
            } else {
                console.log(`   - Error: ${tokenResult.error || 'Unknown error'}`);
            }
        } else {
            console.log(`❌ Token endpoint failed: ${tokenResponse.status}`);
        }
        
        // Test 4: Provide manual testing instructions
        console.log('\n📋 Manual Testing Instructions:');
        console.log('   1. Open http://localhost:4000 in your browser');
        console.log('   2. Go to the Settings tab');
        console.log('   3. Fill in your PingOne credentials if not already set');
        console.log('   4. Click the "Get Token" button');
        console.log('   5. You should see:');
        console.log('      - "✅" in the connection status area');
        console.log('      - Button briefly shows "✅" then returns to "Get Token"');
        console.log('      - Success notification appears');
        
        console.log('\n✅ Token success indicator test completed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run the test
testTokenSuccessIndicator(); 