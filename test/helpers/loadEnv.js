import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function loadEnv() {
  const envPath = resolve(__dirname, '../../.env');
  
  if (existsSync(envPath)) {
    const envFile = readFileSync(envPath, 'utf-8');
    const envVars = envFile.split('\n').reduce((acc, line) => {
      // Skip comments and empty lines
      if (line.startsWith('#') || !line.trim()) {
        return acc;
      }
      
      const [key, ...value] = line.split('=');
      if (key && value) {
        // Remove surrounding quotes if present
        const cleanValue = value.join('=').trim().replace(/^['"]|['"]$/g, '');
        acc[key] = cleanValue;
      }
      return acc;
    }, {});
    
    // Set environment variables if they don't already exist
    Object.entries(envVars).forEach(([key, value]) => {
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    });
  }
  
  // Verify required environment variables
  const requiredVars = [
    'PINGONE_ENVIRONMENT_ID',
    'PINGONE_CLIENT_ID',
    'PINGONE_CLIENT_SECRET'
  ];
  
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
}

module.exports = { loadEnv };
