import 'dotenv/config';
import { promises as fs, createReadStream } from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration from environment variables
const CONFIG = {
    region: process.env.PINGONE_REGION?.toLowerCase() || 'northamerica',
    environmentId: process.env.PINGONE_ENVIRONMENT_ID,
    clientId: process.env.PINGONE_CLIENT_ID,
    clientSecret: process.env.PINGONE_CLIENT_SECRET,
    populationId: process.env.PINGONE_POPULATION_ID
};

// Map common region names to PingOne domain parts
const REGION_MAP = {
    'northamerica': 'us',
    'europe': 'eu',
    'asia': 'asia',
    'canada': 'ca'
};

class PingOneCSVImporter {
    constructor(config) {
        this.config = config;
        this.accessToken = null;
        
        // Set up API client with correct domain format for Management API v1
        const regionDomain = REGION_MAP[config.region] || config.region;
        this.apiBaseUrl = `https://api.pingone.com/v1/environments/${config.environmentId}`;
        this.authBaseUrl = `https://auth.pingone.com/${config.environmentId}`;
        
        this.apiClient = axios.create({
            baseURL: this.apiBaseUrl,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
    }

    // Get access token from PingOne using Basic Auth
    async getAccessToken() {
        console.log('🔑 Getting access token...');
        const tokenUrl = `https://auth.pingone.com/${this.config.environmentId}/as/token`;
        
        // Create Basic Auth header
        const authHeader = 'Basic ' + Buffer.from(
            `${this.config.clientId}:${this.config.clientSecret}`
        ).toString('base64');
        
        const params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');
        params.append('scope', 'user:create user:import');
        
        try {
            console.log(`🌐 Authenticating with: ${tokenUrl}`);
            const response = await axios.post(tokenUrl, params, {
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                }
            });
            
            if (!response.data.access_token) {
                throw new Error('No access token received in response');
            }
            
            this.accessToken = response.data.access_token;
            this.apiClient.defaults.headers.common['Authorization'] = `Bearer ${this.accessToken}`;
            console.log('✅ Successfully obtained access token');
            return this.accessToken;
        } catch (error) {
            console.error('❌ Error getting access token:', {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status,
                url: tokenUrl
            });
            throw error;
        }
    }

    // Import users from CSV file
    async importUsersFromCSV(filePath) {
        try {
            // Read and parse the file content
            const fileContent = await fs.readFile(filePath, 'utf8');
            
            // Parse CSV to validate it
            const users = parse(fileContent, {
                columns: true,
                skip_empty_lines: true,
                trim: true
            });

            console.log(`✅ Found ${users.length} users in CSV`);
            
            // Get access token if we don't have one
            if (!this.accessToken) {
                await this.getAccessToken();
            }
            
            console.log('🚀 Starting user creation process...');
            
            // Process each user individually
            const results = [];
            const errors = [];
            
            for (const [index, user] of users.entries()) {
                try {
                    console.log(`\n👤 Processing user ${index + 1}/${users.length}: ${user.email}`);
                    
                    // Prepare user data for the API
                    const userData = {
                        name: {
                            given: user.firstName || '',
                            family: user.lastName || ''
                        },
                        username: user.username || user.email,
                        email: user.email,
                        password: {
                            value: user.password || 'Temporary123!',
                            forceChange: true
                        },
                        active: user.active !== undefined ? user.active === 'true' : true
                    };
                    
                    // Add population ID if provided
                    if (this.config.populationId) {
                        userData.population = {
                            id: this.config.populationId
                        };
                    }
                    
                    console.log('📤 Sending user data:', JSON.stringify(userData, null, 2));
                    
                    // Create user
                    const response = await axios({
                        method: 'POST',
                        url: `${this.apiBaseUrl}/users`,
                        headers: {
                            'Authorization': `Bearer ${this.accessToken}`,
                            'Content-Type': 'application/vnd.pingidentity.user.import+json',
                            'Accept': 'application/json'
                        },
                        data: userData,
                        validateStatus: (status) => status < 500
                    });
                    
                    const success = response.status >= 200 && response.status < 300;
                    console.log(`${success ? '✅' : '⚠️'} User creation ${success ? 'succeeded' : 'returned status ' + response.status}`);
                    console.log('Response data:', JSON.stringify(response.data, null, 2));
                    
                    results.push({
                        user: user.email,
                        status: success ? 'success' : 'warning',
                        statusCode: response.status,
                        data: response.data
                    });
                    
                } catch (error) {
                    console.error(`❌ Error creating user ${user.email}:`, error.message);
                    if (error.response) {
                        console.error('Error details:', JSON.stringify({
                            status: error.response.status,
                            data: error.response.data,
                            headers: error.response.headers
                        }, null, 2));
                        
                        errors.push({
                            user: user.email,
                            status: 'error',
                            error: error.response.data || error.message
                        });
                    } else {
                        errors.push({
                            user: user.email,
                            status: 'error',
                            error: error.message
                        });
                    }
                }
                
                // Add a small delay between requests to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // Log summary
            const successful = results.filter(r => r.status === 'success');
            const warnings = results.filter(r => r.status === 'warning');
            
            console.log('\n📊 Import Summary:');
            console.log(`✅ Successfully created: ${successful.length} users`);
            
            if (warnings.length > 0) {
                console.log(`⚠️  Partially processed: ${warnings.length} users (may already exist)`);
            }
            
            if (errors.length > 0) {
                console.log(`❌ Failed to create: ${errors.length} users`);
                console.log('\n❌ Errors:');
                errors.forEach((err, idx) => {
                    console.log(`${idx + 1}. ${err.user}: ${err.error.message || JSON.stringify(err.error)}`);
                });
            }
            
            // Show warning details
            if (warnings.length > 0) {
                console.log('\n⚠️  Warnings:');
                warnings.forEach((warn, idx) => {
                    const reason = warn.error?.code === 'UNIQUENESS_VIOLATION' ? 'User already exists' : 'See details';
                    console.log(`${idx + 1}. ${warn.user}: ${reason}`);
                });
            }
            
            return {
                success: errors.length === 0,
                created: results.length,
                failed: errors.length,
                results,
                errors: errors.length > 0 ? errors : undefined
            };
            
        } catch (error) {
            console.error('❌ Error during import:', {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
            });
            throw error;
        }
    }
}

// Main function
async function main() {
    try {
        const args = process.argv.slice(2);
        const csvPath = args[0] || 'test-users.csv';
        
        console.log('🚀 Starting PingOne CSV Import');
        console.log('=============================');
        
        // Validate required configuration
        const requiredVars = ['PINGONE_ENVIRONMENT_ID', 'PINGONE_CLIENT_ID', 'PINGONE_CLIENT_SECRET'];
        const missingVars = requiredVars.filter(varName => !process.env[varName]);
        
        if (missingVars.length > 0) {
            console.error('❌ Missing required environment variables:');
            missingVars.forEach(varName => console.error(`   - ${varName}`));
            process.exit(1);
        }
        
        const importer = new PingOneCSVImporter(CONFIG);
        await importer.importUsersFromCSV(csvPath);
        
        console.log('✅ Import process completed');
        
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        process.exit(1);
    }
}

// Run the import
main();
