#!/usr/bin/env node

/**
 * Test Actual Import with "Download Last 50 Users" file
 */

const fs = require('fs');

console.log('🚀 Testing Actual Import with "Download Last 50 Users" file...\n');

async function testActualImport() {
    try {
        // Step 1: Read the file
        const fileName = 'Download Last 50 Users';
        const fileContent = fs.readFileSync(fileName, 'utf8');
        const lines = fileContent.split('\n');
        const headers = lines[0].split(',');
        const dataRows = lines.slice(1).filter(line => line.trim());
        
        console.log(`📁 File: ${fileName}`);
        console.log(`👥 Users: ${dataRows.length}`);
        console.log(`📋 Headers: ${headers.length} columns`);
        
        // Step 2: Prepare users for import
        const users = dataRows.map((row, index) => {
            const values = row.split(',');
            const user = {};
            headers.forEach((header, i) => {
                user[header] = values[i] || '';
            });
            return user;
        });
        
        // Step 3: Get import options
        const importOptions = {
            populationId: '1dd684e3-82ee-4e68-9d25-00401bc62e7a', // From the CSV
            useCsvPopulationId: true,
            useDefaultPopulation: false
        };
        
        console.log('\n⚙️  Import Configuration:');
        console.log(`   - Population ID: ${importOptions.populationId}`);
        console.log(`   - Use CSV Population ID: ${importOptions.useCsvPopulationId}`);
        console.log(`   - Use Default Population: ${importOptions.useDefaultPopulation}`);
        
        // Step 4: Test the import API endpoint
        console.log('\n🌐 Testing Import API...');
        
        try {
            const importResponse = await fetch('http://localhost:4000/api/pingone/import', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    users: users.slice(0, 5), // Test with first 5 users only
                    options: importOptions
                })
            });
            
            if (importResponse.ok) {
                const result = await importResponse.json();
                console.log('✅ Import API test successful!');
                console.log('📊 Results:', result);
            } else {
                const errorText = await importResponse.text();
                console.log(`❌ Import API failed: ${importResponse.status}`);
                console.log('Error details:', errorText);
            }
        } catch (error) {
            console.log('❌ Import API error:', error.message);
        }
        
        // Step 5: Test individual user creation
        console.log('\n👤 Testing Individual User Creation...');
        
        const testUser = users[0];
        console.log('📝 Test User:');
        console.log(`   - Username: ${testUser.username}`);
        console.log(`   - Email: ${testUser.email}`);
        console.log(`   - Name: ${testUser.firstName} ${testUser.lastName}`);
        console.log(`   - Population ID: ${testUser.populationId}`);
        
        try {
            const userResponse = await fetch('http://localhost:4000/api/pingone/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    user: testUser,
                    populationId: testUser.populationId
                })
            });
            
            if (userResponse.ok) {
                const userResult = await userResponse.json();
                console.log('✅ User creation test successful!');
                console.log('📊 User Result:', userResult);
            } else {
                const errorText = await userResponse.text();
                console.log(`❌ User creation failed: ${userResponse.status}`);
                console.log('Error details:', errorText);
            }
        } catch (error) {
            console.log('❌ User creation error:', error.message);
        }
        
        // Step 6: Provide manual testing instructions
        console.log('\n📋 Manual Testing Instructions:');
        console.log('   1. Open http://localhost:4000 in your browser');
        console.log('   2. Go to the Import tab');
        console.log('   3. Upload the "Download Last 50 Users" file');
        console.log('   4. The file should be processed automatically');
        console.log('   5. Select population: 1dd684e3-82ee-4e68-9d25-00401bc62e7a');
        console.log('   6. Click "Import Users" to start the import');
        console.log('   7. Monitor progress in the import status area');
        console.log('   8. Check the logs tab for detailed results');
        
        console.log('\n✅ Import test completed!');
        
    } catch (error) {
        console.error('❌ Import test failed:', error.message);
    }
}

// Run the test
testActualImport(); 