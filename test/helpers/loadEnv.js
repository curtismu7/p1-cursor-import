const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.resolve(__dirname, '../../.env');
  
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf-8');
    const envVars = envFile.split('\n').reduce((acc, line) => {
      const [key, ...value] = line.split('=');
      if (key && value) {
        acc[key] = value.join('=').trim();
      }
      return acc;
    }, {});
    
    // Set environment variables
    Object.entries(envVars).forEach(([key, value]) => {
      if (!process.env[key]) {
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
