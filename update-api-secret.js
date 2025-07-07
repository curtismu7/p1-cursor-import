#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 API Secret Update Helper');
console.log('============================');

// Read current settings
const settingsPath = path.join(__dirname, 'data/settings.json');
let settings = {};

try {
    const settingsData = fs.readFileSync(settingsPath, 'utf8');
    settings = JSON.parse(settingsData);
    console.log('✅ Current settings loaded');
} catch (error) {
    console.error('❌ Error reading settings:', error.message);
    process.exit(1);
}

// Check if API secret is encrypted
if (!settings.apiSecret || !settings.apiSecret.startsWith('enc:')) {
    console.log('✅ API secret is already unencrypted');
    console.log('Current API secret:', settings.apiSecret ? '***' + settings.apiSecret.slice(-4) : 'not set');
    process.exit(0);
}

console.log('⚠️  API secret is currently encrypted');
console.log('Current encrypted secret:', settings.apiSecret ? '***' + settings.apiSecret.slice(-4) : 'not set');

console.log('\n📝 To fix the 403 errors, you need to update the API secret to the unencrypted value.');
console.log('\n🔍 Steps to get your unencrypted API secret:');
console.log('1. Go to your PingOne Admin Console');
console.log('2. Navigate to Applications > Your App > Credentials');
console.log('3. Copy the Client Secret (not the encrypted one)');
console.log('4. Update the settings with the unencrypted value');

console.log('\n💡 You can update the API secret in two ways:');
console.log('1. Through the web interface at http://127.0.0.1:4000/settings');
console.log('2. By editing the data/settings.json file directly');

console.log('\n🔧 To edit the settings file directly:');
console.log(`1. Open: ${settingsPath}`);
console.log('2. Replace the "apiSecret" value with your unencrypted secret');
console.log('3. Save the file');
console.log('4. Restart the server');

console.log('\n⚠️  IMPORTANT: The unencrypted secret should NOT start with "enc:"');
console.log('   It should be a plain text string from your PingOne console.');

console.log('\n🔄 After updating, restart the server with:');
console.log('   npm start');

console.log('\n📊 Current settings summary:');
console.log(`   Environment ID: ${settings.environmentId ? '***' + settings.environmentId.slice(-4) : 'not set'}`);
console.log(`   Client ID: ${settings.apiClientId ? '***' + settings.apiClientId.slice(-4) : 'not set'}`);
console.log(`   Region: ${settings.region || 'not set'}`);
console.log(`   Population ID: ${settings.populationId || 'not set'}`);
console.log(`   Rate Limit: ${settings.rateLimit || 'not set'}`);

console.log('\n✅ Script completed. Please update your API secret and restart the server.'); 