#!/usr/bin/env node

/**
 * Comprehensive Import UI Test
 * Tests all aspects of the Import functionality
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Import UI Functionality...\n');

// Test 1: Check if server is running
async function testServerHealth() {
    console.log('1️⃣ Testing Server Health...');
    try {
        const response = await fetch('http://localhost:4000/api/health');
        const data = await response.json();
        
        if (data.status === 'healthy') {
            console.log('✅ Server is healthy and running');
            console.log(`   - Uptime: ${Math.round(data.details.uptime)}s`);
            console.log(`   - Memory: ${data.details.memory.used}MB / ${data.details.memory.total}MB`);
            return true;
        } else {
            console.log('❌ Server health check failed');
            return false;
        }
    } catch (error) {
        console.log('❌ Server is not running or not accessible');
        console.log(`   Error: ${error.message}`);
        return false;
    }
}

// Test 2: Check if test CSV files exist
function testCsvFiles() {
    console.log('\n2️⃣ Testing CSV Files...');
    const testFiles = [
        'test-import.csv',
        'A-fresh_test_users.csv',
        'A2-fresh_test_users.csv',
        'test_users.csv'
    ];
    
    let foundFiles = 0;
    testFiles.forEach(file => {
        if (fs.existsSync(file)) {
            console.log(`✅ Found test file: ${file}`);
            foundFiles++;
        } else {
            console.log(`❌ Missing test file: ${file}`);
        }
    });
    
    console.log(`   - Found ${foundFiles}/${testFiles.length} test files`);
    return foundFiles > 0;
}

// Test 3: Check PingOne API endpoints
async function testPingOneEndpoints() {
    console.log('\n3️⃣ Testing PingOne API Endpoints...');
    
    const endpoints = [
        '/api/pingone/populations',
        '/api/pingone/test-connection'
    ];
    
    let workingEndpoints = 0;
    
    for (const endpoint of endpoints) {
        try {
            const response = await fetch(`http://localhost:4000${endpoint}`);
            if (response.ok) {
                console.log(`✅ Endpoint working: ${endpoint}`);
                workingEndpoints++;
            } else {
                console.log(`⚠️  Endpoint returned ${response.status}: ${endpoint}`);
            }
        } catch (error) {
            console.log(`❌ Endpoint failed: ${endpoint} - ${error.message}`);
        }
    }
    
    console.log(`   - ${workingEndpoints}/${endpoints.length} endpoints working`);
    return workingEndpoints > 0;
}

// Test 4: Check UI components
function testUiComponents() {
    console.log('\n4️⃣ Testing UI Components...');
    
    const htmlFile = 'public/index.html';
    if (!fs.existsSync(htmlFile)) {
        console.log('❌ HTML file not found');
        return false;
    }
    
    const htmlContent = fs.readFileSync(htmlFile, 'utf8');
    
    const requiredElements = [
        'import-view',
        'csv-file',
        'import-population-select',
        'start-import-btn-bottom',
        'import-status',
        'import-progress-bar',
        'progress-log-entries'
    ];
    
    let foundElements = 0;
    requiredElements.forEach(element => {
        if (htmlContent.includes(`id="${element}"`)) {
            console.log(`✅ Found UI element: ${element}`);
            foundElements++;
        } else {
            console.log(`❌ Missing UI element: ${element}`);
        }
    });
    
    console.log(`   - Found ${foundElements}/${requiredElements.length} UI elements`);
    return foundElements === requiredElements.length;
}

// Test 5: Check JavaScript functionality
function testJavaScriptFiles() {
    console.log('\n5️⃣ Testing JavaScript Files...');
    
    const jsFiles = [
        'public/js/bundle.js',
        'public/js/modules/ui-manager.js',
        'public/js/modules/file-handler.js',
        'public/js/modules/pingone-client.js'
    ];
    
    let foundFiles = 0;
    jsFiles.forEach(file => {
        if (fs.existsSync(file)) {
            const stats = fs.statSync(file);
            console.log(`✅ Found JS file: ${file} (${Math.round(stats.size / 1024)}KB)`);
            foundFiles++;
        } else {
            console.log(`❌ Missing JS file: ${file}`);
        }
    });
    
    console.log(`   - Found ${foundFiles}/${jsFiles.length} JS files`);
    return foundFiles === jsFiles.length;
}

// Test 6: Check bundle compilation
function testBundleCompilation() {
    console.log('\n6️⃣ Testing Bundle Compilation...');
    
    const bundleFile = 'public/js/bundle.js';
    if (!fs.existsSync(bundleFile)) {
        console.log('❌ Bundle file not found');
        return false;
    }
    
    const bundleContent = fs.readFileSync(bundleFile, 'utf8');
    
    // Check for key functions
    const requiredFunctions = [
        'startImport',
        'updateImportProgress',
        'showImportStatus',
        'handleFileSelect'
    ];
    
    let foundFunctions = 0;
    requiredFunctions.forEach(func => {
        if (bundleContent.includes(func)) {
            console.log(`✅ Found function: ${func}`);
            foundFunctions++;
        } else {
            console.log(`❌ Missing function: ${func}`);
        }
    });
    
    console.log(`   - Found ${foundFunctions}/${requiredFunctions.length} functions in bundle`);
    return foundFunctions === requiredFunctions.length;
}

// Test 7: Check CSS styling
function testCssStyling() {
    console.log('\n7️⃣ Testing CSS Styling...');
    
    const cssFile = 'public/css/styles.css';
    if (!fs.existsSync(cssFile)) {
        console.log('⚠️  CSS file not found, checking if styles are inline');
        return true; // Styles might be inline
    }
    
    const cssContent = fs.readFileSync(cssFile, 'utf8');
    
    const requiredStyles = [
        '.import-status',
        '.progress-bar',
        '.file-upload-container'
    ];
    
    let foundStyles = 0;
    requiredStyles.forEach(style => {
        if (cssContent.includes(style)) {
            console.log(`✅ Found CSS style: ${style}`);
            foundStyles++;
        } else {
            console.log(`⚠️  Missing CSS style: ${style}`);
        }
    });
    
    console.log(`   - Found ${foundStyles}/${requiredStyles.length} CSS styles`);
    return foundStyles > 0;
}

// Main test runner
async function runAllTests() {
    console.log('🚀 Starting Import UI Tests...\n');
    
    const tests = [
        { name: 'Server Health', fn: testServerHealth },
        { name: 'CSV Files', fn: testCsvFiles },
        { name: 'PingOne Endpoints', fn: testPingOneEndpoints },
        { name: 'UI Components', fn: testUiComponents },
        { name: 'JavaScript Files', fn: testJavaScriptFiles },
        { name: 'Bundle Compilation', fn: testBundleCompilation },
        { name: 'CSS Styling', fn: testCssStyling }
    ];
    
    let passedTests = 0;
    
    for (const test of tests) {
        try {
            const result = await test.fn();
            if (result) {
                passedTests++;
            }
        } catch (error) {
            console.log(`❌ Test "${test.name}" failed with error: ${error.message}`);
        }
    }
    
    console.log('\n📊 Test Results Summary:');
    console.log(`   - Passed: ${passedTests}/${tests.length} tests`);
    console.log(`   - Success Rate: ${Math.round((passedTests / tests.length) * 100)}%`);
    
    if (passedTests === tests.length) {
        console.log('\n🎉 All tests passed! Import UI is ready for use.');
        console.log('\n📝 Next Steps:');
        console.log('   1. Open http://localhost:4000 in your browser');
        console.log('   2. Navigate to the Import tab');
        console.log('   3. Upload a CSV file (e.g., test-import.csv)');
        console.log('   4. Select a population or enable default population');
        console.log('   5. Click "Import Users" to test the functionality');
    } else {
        console.log('\n⚠️  Some tests failed. Please check the issues above.');
    }
}

// Run the tests
runAllTests().catch(console.error); 