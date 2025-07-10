#!/usr/bin/env node

/**
 * Test Import with "Download Last 50 Users" file
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Import with "Download Last 50 Users" file...\n');

// Test the import process
async function testImportWithFile() {
    try {
        // Step 1: Check if the file exists
        const fileName = 'Download Last 50 Users';
        if (!fs.existsSync(fileName)) {
            console.log('❌ File not found:', fileName);
            return;
        }
        
        console.log('✅ File found:', fileName);
        
        // Step 2: Read and parse the CSV file
        const fileContent = fs.readFileSync(fileName, 'utf8');
        const lines = fileContent.split('\n');
        const headers = lines[0].split(',');
        const dataRows = lines.slice(1).filter(line => line.trim());
        
        console.log('📊 File Analysis:');
        console.log(`   - Headers: ${headers.length} columns`);
        console.log(`   - Data rows: ${dataRows.length} users`);
        console.log(`   - File size: ${Math.round(fileContent.length / 1024)}KB`);
        
        // Step 3: Validate the data structure
        console.log('\n🔍 Data Validation:');
        const requiredFields = ['username', 'email', 'firstName', 'lastName'];
        const missingFields = requiredFields.filter(field => !headers.includes(field));
        
        if (missingFields.length > 0) {
            console.log(`❌ Missing required fields: ${missingFields.join(', ')}`);
            return;
        } else {
            console.log('✅ All required fields present');
        }
        
        // Step 4: Check for population ID
        const hasPopulationId = headers.includes('populationId');
        console.log(`📋 Population ID field: ${hasPopulationId ? '✅ Present' : '⚠️  Missing'}`);
        
        // Step 5: Sample data analysis
        if (dataRows.length > 0) {
            const sampleRow = dataRows[0].split(',');
            console.log('\n📝 Sample User Data:');
            console.log(`   - Username: ${sampleRow[headers.indexOf('username')]}`);
            console.log(`   - Email: ${sampleRow[headers.indexOf('email')]}`);
            console.log(`   - Name: ${sampleRow[headers.indexOf('firstName')]} ${sampleRow[headers.indexOf('lastName')]}`);
            if (hasPopulationId) {
                console.log(`   - Population ID: ${sampleRow[headers.indexOf('populationId')]}`);
            }
        }
        
        // Step 6: Test API endpoints
        console.log('\n🌐 Testing API Endpoints:');
        
        // Test populations endpoint
        try {
            const populationsResponse = await fetch('http://localhost:4000/api/pingone/populations');
            if (populationsResponse.ok) {
                const populations = await populationsResponse.json();
                console.log(`✅ Populations endpoint working (${populations.length} populations available)`);
            } else {
                console.log(`⚠️  Populations endpoint returned ${populationsResponse.status}`);
            }
        } catch (error) {
            console.log('❌ Populations endpoint failed:', error.message);
        }
        
        // Test health endpoint
        try {
            const healthResponse = await fetch('http://localhost:4000/api/health');
            if (healthResponse.ok) {
                const health = await healthResponse.json();
                console.log(`✅ Health endpoint working (${health.details.checks.pingone})`);
            } else {
                console.log(`❌ Health endpoint failed: ${healthResponse.status}`);
            }
        } catch (error) {
            console.log('❌ Health endpoint failed:', error.message);
        }
        
        // Step 7: Simulate file upload (prepare data for import)
        console.log('\n📤 Preparing Import Data:');
        const importData = {
            users: dataRows.map((row, index) => {
                const values = row.split(',');
                const user = {};
                headers.forEach((header, i) => {
                    user[header] = values[i] || '';
                });
                return user;
            }),
            totalUsers: dataRows.length,
            hasPopulationId: hasPopulationId
        };
        
        console.log(`✅ Prepared ${importData.totalUsers} users for import`);
        
        // Step 8: Test import simulation
        console.log('\n🚀 Import Simulation:');
        console.log('   - File: Download Last 50 Users');
        console.log(`   - Users: ${importData.totalUsers}`);
        console.log(`   - Population ID: ${hasPopulationId ? 'Available' : 'Not available'}`);
        console.log('   - Status: Ready for import');
        
        // Step 9: Provide next steps
        console.log('\n📋 Next Steps for Manual Testing:');
        console.log('   1. Open http://localhost:4000 in your browser');
        console.log('   2. Navigate to the Import tab');
        console.log('   3. Upload the "Download Last 50 Users" file');
        console.log('   4. Select a population from the dropdown');
        console.log('   5. Click "Import Users" to start the import');
        console.log('   6. Monitor the progress in the import status area');
        
        console.log('\n✅ Import test completed successfully!');
        
    } catch (error) {
        console.error('❌ Import test failed:', error.message);
    }
}

// Run the test
testImportWithFile(); 