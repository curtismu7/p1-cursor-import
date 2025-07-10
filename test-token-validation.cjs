#!/usr/bin/env node

/**
 * Test Token Validation for Import
 */

console.log('🧪 Testing Token Validation for Import...\n');

async function testTokenValidation() {
    try {
        // Test 1: Check server health
        console.log('1️⃣ Testing Server Health...');
        const healthResponse = await fetch('http://localhost:4000/api/health');
        if (healthResponse.ok) {
            const health = await healthResponse.json();
            console.log('✅ Server is healthy');
            console.log(`   - PingOne Status: ${health.details.checks.pingone}`);
        } else {
            console.log('❌ Server is not responding');
            return;
        }
        
        // Test 2: Check current token status
        console.log('\n2️⃣ Testing Token Status...');
        const tokenResponse = await fetch('http://localhost:4000/api/pingone/test-connection');
        if (tokenResponse.ok) {
            const tokenResult = await tokenResponse.json();
            console.log('✅ Token endpoint is accessible');
            console.log(`   - Token Valid: ${tokenResult.success ? 'Yes' : 'No'}`);
            if (!tokenResult.success) {
                console.log(`   - Error: ${tokenResult.error || 'Unknown error'}`);
            }
        } else {
            console.log(`❌ Token endpoint failed: ${tokenResponse.status}`);
        }
        
        // Test 3: Test import without token
        console.log('\n3️⃣ Testing Import Without Token...');
        const importResponse = await fetch('http://localhost:4000/api/pingone/import', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                users: [{
                    username: 'testuser',
                    email: 'test@example.com',
                    firstName: 'Test',
                    lastName: 'User'
                }],
                options: {
                    populationId: 'test-population',
                    useCsvPopulationId: false,
                    useDefaultPopulation: false
                }
            })
        });
        
        if (importResponse.ok) {
            const importResult = await importResponse.json();
            console.log('✅ Import endpoint is accessible');
            console.log(`   - Import Success: ${importResult.success ? 'Yes' : 'No'}`);
        } else {
            console.log(`❌ Import endpoint failed: ${importResponse.status}`);
        }
        
        // Test 4: Provide manual testing instructions
        console.log('\n📋 Manual Testing Instructions:');
        console.log('   1. Open http://localhost:4000 in your browser');
        console.log('   2. Go to the Import tab');
        console.log('   3. Upload a CSV file (e.g., test-import.csv)');
        console.log('   4. Select a population');
        console.log('   5. Check the import button:');
        console.log('      - If no token: Button shows "Get Token First" and is disabled');
        console.log('      - If token available: Button shows "Import Users" and is enabled');
        console.log('   6. Try clicking import button:');
        console.log('      - If no token: Should show error in import status area');
        console.log('      - If token available: Should start import process');
        
        console.log('\n🔧 Expected Behavior:');
        console.log('   - Import button should be disabled when no token is available');
        console.log('   - Button text should change to "Get Token First"');
        console.log('   - Error should appear in import status area if import is attempted');
        console.log('   - Clear error message directing user to Settings page');
        
        console.log('\n✅ Token validation test completed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run the test
testTokenValidation(); 