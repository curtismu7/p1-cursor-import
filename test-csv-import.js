import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate required environment variables
const requiredEnvVars = [
    'PINGONE_CLIENT_ID',
    'PINGONE_CLIENT_SECRET',
    'PINGONE_ENVIRONMENT_ID',
    'PINGONE_REGION',
    'PINGONE_POPULATION_ID'
];

// Check for missing environment variables
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(varName => console.error(`   - ${varName}`));
    console.error('\nPlease check your .env file and ensure all required variables are set.');
    process.exit(1);
}

// Configuration from environment variables
const CONFIG = {
    region: process.env.PINGONE_REGION.toLowerCase(),  // Convert to lowercase
    environmentId: process.env.PINGONE_ENVIRONMENT_ID,
    clientId: process.env.PINGONE_CLIENT_ID,
    clientSecret: process.env.PINGONE_CLIENT_SECRET,
    populationId: process.env.PINGONE_POPULATION_ID,
    userImportJobId: process.env.PINGONE_USER_IMPORT_JOB_ID  // Optional
};

// Map common region names to PingOne domain parts
const REGION_MAP = {
    'northamerica': 'us',
    'europe': 'eu',
    'asia': 'asia',
    'canada': 'ca'
};

// Sample CSV data
const SAMPLE_CSV = `givenName,familyName,email,username,active
John,Doe,john.doe.${Date.now()}@example.com,johndoe${Date.now()},true
Jane,Smith,jane.smith.${Date.now()}@example.com,janesmith${Date.now()},true
Bob,Johnson,bob.johnson.${Date.now()}@example.com,bobj${Date.now()},true
Alice,Williams,alice.williams.${Date.now()}@example.com,alicew${Date.now()},true
Mike,Brown,mike.brown.${Date.now()}@example.com,mikeb${Date.now()},true`;

class PingOneCSVImporter {
    constructor(config) {
        this.config = config;
        
        // Map full region names to domain parts and construct the base URLs
        const regionDomain = REGION_MAP[config.region.toLowerCase()] || config.region.toLowerCase();
        this.baseUrl = `https://auth.pingone.com`;  // For authentication
        this.apiBaseUrl = `https://api.pingone.com/v1/environments/${this.config.environmentId}`;  // For API calls
        
        // Create separate axios instances for auth and API
        this.authAxios = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            // Ensure requests don't follow redirects to localhost
            maxRedirects: 0,
            validateStatus: status => status < 400
        });
        
        this.apiAxios = axios.create({
            baseURL: this.apiBaseUrl,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Skip-Request-Interceptor': 'true'  // Add this header to skip any request interceptors
            },
            // Ensure requests don't follow redirects to localhost
            maxRedirects: 0,
            validateStatus: status => status < 400
        });
        
        // Add request interceptor to log API requests
        this.apiAxios.interceptors.request.use(config => {
            console.log(`🌐 API Request: ${config.method.toUpperCase()} ${config.baseURL}${config.url}`);
            return config;
        });
        
        this.accessToken = null;
        this.axios = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        console.log(`ℹ️  Using PingOne API endpoint: ${this.baseUrl}`);
    }

    /**
     * Get access token using client credentials
     */
    async getAccessToken() {
        try {
            const authUrl = `/${this.config.environmentId}/as/token`;
            const params = new URLSearchParams();
            params.append('grant_type', 'client_credentials');
            params.append('scope', 'p1:read:user p1:create:user p1:update:user p1:read:population');

            console.log('🔒 Requesting access token...');
            const credentials = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
            
            const response = await this.authAxios.post(authUrl, params, {
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                }
            });

            if (!response.data || !response.data.access_token) {
                throw new Error('No access token received in response');
            }

            this.accessToken = response.data.access_token;
            // Set the token for API requests
            this.apiAxios.defaults.headers.common['Authorization'] = `Bearer ${this.accessToken}`;
            
            console.log('✅ Successfully obtained access token');
            return this.accessToken;
        } catch (error) {
            console.error('❌ Error getting access token:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Create a temporary CSV file with sample data
     */
    async createTempCSV() {
        try {
            const tempDir = path.join(__dirname, 'temp');
            await fs.mkdir(tempDir, { recursive: true });
            
            const filePath = path.join(tempDir, `users-${Date.now()}.csv`);
            await fs.writeFile(filePath, SAMPLE_CSV);
            
            console.log(`📄 Created temporary CSV file: ${filePath}`);
            return filePath;
        } catch (error) {
            console.error('❌ Error creating temp CSV:', error.message);
            throw error;
        }
    }

    /**
     * Check if a user exists by email
     * @param {string} email - Email to check
     * @returns {Promise<boolean>} - True if user exists
     */
    async userExists(email) {
        try {
            const searchUrl = `/users`;
            const response = await this.apiAxios.get(searchUrl, {
                params: {
                    filter: `email eq "${email}"`
                }
            });
            
            return response.data._embedded && response.data._embedded.users && response.data._embedded.users.length > 0;
        } catch (error) {
            console.error(`❌ Error checking if user exists (${email}):`, error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Process CSV and filter out existing users
     * @param {string} csvContent - CSV content as string
     * @returns {Promise<{csvContent: string, stats: {total: number, skipped: number, toImport: number}}>}
     */
    async processCSV(csvContent) {
        try {
            const records = parse(csvContent, {
                columns: true,
                skip_empty_lines: true,
                trim: true
            });

            const result = {
                users: [],
                stats: {
                    total: records.length,
                    skipped: 0,
                    toImport: 0
                }
            };

            // Process each record to check for existing users
            for (const record of records) {
                const email = record.email;
                if (await this.userExists(email)) {
                    console.log(`⏩ User already exists, skipping: ${email}`);
                    result.stats.skipped++;
                } else {
                    result.users.push(record);
                    result.stats.toImport++;
                }
            }

            // Convert filtered users back to CSV
            if (result.users.length > 0) {
                const headers = Object.keys(result.users[0]);
                const csvRows = [
                    headers.join(','),
                    ...result.users.map(user => 
                        headers.map(header => `"${String(user[header] || '').replace(/"/g, '""')}"`).join(',')
                    )
                ];
                result.csvContent = csvRows.join('\n');
            } else {
                result.csvContent = '';
            }

            return result;
        } catch (error) {
            console.error('❌ Error processing CSV:', error);
            throw error;
        }
    }

    /**
     * Import users from CSV
     * @param {string} csvFilePath - Path to the CSV file
     */
    async importUsersFromCSV(csvFilePath) {
        try {
            if (!this.accessToken) {
                throw new Error('No access token available. Call getAccessToken() first.');
            }

            // Read and process the CSV file
            const csvContent = await fs.readFile(csvFilePath, 'utf8');
            const { csvContent: filteredCsv, stats } = await this.processCSV(csvContent);

            console.log(`\n📊 Import Statistics:`);
            console.log(`   Total users in CSV: ${stats.total}`);
            console.log(`   Users to skip (already exist): ${stats.skipped}`);
            console.log(`   Users to import: ${stats.toImport}\n`);

            if (stats.toImport === 0) {
                console.log('✅ No new users to import');
                return { status: 'completed', stats };
            }

            // Create a temporary file with filtered content
            const tempFilePath = path.join(path.dirname(csvFilePath), `filtered-${path.basename(csvFilePath)}`);
            await fs.writeFile(tempFilePath, filteredCsv);

            try {
                // Get population ID (use from config or fetch default)
                let populationId = this.config.populationId;
                if (!populationId) {
        } catch (error) {
            console.error('❌ Error importing users:', error.response?.data || error.message);
            throw error;
        }
     */
    async getDefaultPopulationId() {
        try {
            console.log('🔍 Fetching default population...');
            const response = await this.apiAxios.get('/populations');
            
            if (!response.data || !response.data._embedded || !response.data._embedded.populations || response.data._embedded.populations.length === 0) {
                throw new Error('No populations found in the environment');
            }
            
            // Return the first population ID
            const populationId = response.data._embedded.populations[0].id;
            console.log(`✅ Using population ID: ${populationId}`);
            return populationId;
        } catch (error) {
            console.error('❌ Error fetching populations:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Clean up temporary files
     * @param {string} filePath - Path to the file to delete
     */
    async cleanup(filePath) {
        try {
            if (filePath && await fs.access(filePath).then(() => true).catch(() => false)) {
                await fs.unlink(filePath);
                console.log(`🧹 Deleted temporary file: ${filePath}`);
            }
        } catch (error) {
            console.warn('⚠️ Warning: Could not delete temp file:', error.message);
        }
    }
}

/**
 * Main function to run the test
 */
async function main() {
    console.log('🚀 Starting CSV import test...');
    
    const importer = new PingOneCSVImporter(CONFIG);
    let tempCsvPath = null;
    
    try {
        // Step 1: Get access token
        await importer.getAccessToken();
        
        // Step 2: Create a temporary CSV file with test data
        tempCsvPath = await importer.createTempCSV();
        
        console.log('🔍 Checking for existing users...');
        
        // Step 3: Import users from CSV (will skip existing users)
        const result = await importer.importUsersFromCSV(tempCsvPath);
        
        if (result.stats) {
            console.log('\n📊 Final Import Summary:');
            console.log(`   Total users in CSV: ${result.stats.total}`);
            console.log(`   Users skipped (already exist): ${result.stats.skipped}`);
            console.log(`   Users imported: ${result.stats.toImport}`);
            
            if (result.stats.skipped > 0) {
                console.log('\nℹ️  Note: Some users were skipped because they already exist in PingOne.');
            }
        }
        
        console.log('\n✅ Import process completed successfully!');
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    } finally {
        // Clean up temporary files
        if (tempCsvPath) {
            await importer.cleanup(tempCsvPath);
        }
    }
}

// Run the test
main().catch(console.error);
