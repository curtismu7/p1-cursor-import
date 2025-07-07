# PingOne Import Application - Setup Guide

## 📋 Overview

The PingOne Import Application is a modern web-based tool for importing users into PingOne environments using the PingOne Admin API. This application provides a user-friendly interface for bulk user management, including import, export, modification, and deletion capabilities.

## 🚀 Quick Start

### Prerequisites

- **Node.js** (v18 or higher) - [Download here](https://nodejs.org/)
- **Git** - [Download here](https://git-scm.com/)
- **PingOne Account** with API access
- **Modern web browser** (Chrome, Firefox, Safari, Edge)

### Installation Steps

1. **Clone the Repository**
   ```bash
   git clone https://github.com/your-username/pingone-import.git
   cd pingone-import
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment**
   - Copy the example settings file:
     ```bash
     cp data/settings.json.example data/settings.json
     ```
   - Edit `data/settings.json` with your PingOne credentials

4. **Start the Application**
   ```bash
   npm start
   ```

5. **Access the Application**
   - Open your browser and navigate to: `http://localhost:4000`
   - The application will be available at this address

## ⚙️ Configuration

### PingOne API Setup

1. **Get Your PingOne Credentials**
   - Log into your PingOne Admin Console
   - Navigate to **Applications** → **Your Application**
   - Note your **Environment ID**, **Client ID**, and **Client Secret**

2. **Configure Settings**
   Edit `data/settings.json` with your credentials:
   ```json
   {
     "environmentId": "your-environment-id",
     "apiClientId": "your-client-id",
     "apiSecret": "your-client-secret",
     "region": "NorthAmerica",
     "populationId": "",
     "rateLimit": 50,
     "autoSave": true,
     "theme": "light"
   }
   ```

### Environment Variables (Optional)

You can also set environment variables for enhanced security:

```bash
export PINGONE_CLIENT_ID="your-client-id"
export PINGONE_CLIENT_SECRET="your-client-secret"
export PINGONE_ENVIRONMENT_ID="your-environment-id"
export PINGONE_REGION="NorthAmerica"
```

## 🎯 Features

### Import Users
- **CSV Import**: Upload CSV files with user data
- **Bulk Operations**: Import hundreds of users simultaneously
- **Progress Tracking**: Real-time import progress with detailed logging
- **Error Handling**: Comprehensive error reporting and retry mechanisms

### Export Users
- **Population Export**: Export all users from a specific population
- **Environment Export**: Export all users from the entire environment
- **CSV Format**: Download user data in CSV format

### User Management
- **Modify Users**: Update existing user information
- **Delete Users**: Remove users from populations or environments
- **Population Management**: Work with specific user populations

### Advanced Features
- **Rate Limiting**: Configurable API rate limits to prevent throttling
- **Logging**: Comprehensive logging system for debugging
- **Settings Management**: Web-based configuration interface
- **Theme Support**: Light and dark theme options

## 📖 Usage Guide

### 1. Initial Setup
1. Start the application: `npm start`
2. Open browser to `http://localhost:4000`
3. Configure your PingOne settings in the Settings page
4. Test your connection using the "Test Connection" button

### 2. Importing Users
1. **Prepare CSV File**
   - Create a CSV file with user data
   - Required columns: `username`, `email`, `givenName`, `familyName`
   - Optional columns: `password`, `enabled`, `populationId`

2. **Import Process**
   - Navigate to the Import page
   - Select your CSV file
   - Choose target population (optional)
   - Click "Start Import"
   - Monitor progress in real-time

### 3. Exporting Users
1. Navigate to the Export page
2. Select target (Population or Environment)
3. Choose population (if applicable)
4. Click "Export Users"
5. Download the generated CSV file

### 4. Modifying Users
1. Navigate to the Modify page
2. Upload CSV with user updates
3. Map fields appropriately
4. Execute modifications

### 5. Deleting Users
1. Navigate to the Delete page
2. Select deletion scope (CSV, Population, or Environment)
3. Choose population (if applicable)
4. Confirm deletion with safety checks

## 🔧 Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Find process using port 4000
lsof -i :4000 | grep LISTEN

# Kill the process
kill -9 <PID>

# Or use a different port
PORT=4001 npm start
```

#### API Connection Issues
- Verify your PingOne credentials
- Check your internet connection
- Ensure your PingOne account has API access
- Verify the region setting matches your environment

#### Import Failures
- Check CSV format and required columns
- Verify user data validity
- Review error logs for specific issues
- Ensure target population exists

### Debug Mode
Enable debug logging:
```bash
DEBUG=* npm start
```

### Logs
Application logs are stored in:
- `logs/` directory
- Browser console (F12 → Console)
- Application Logs page

## 🛡️ Security Considerations

### API Credentials
- Store credentials securely
- Use environment variables for production
- Rotate API keys regularly
- Never commit credentials to version control

### Network Security
- Use HTTPS in production
- Configure firewall rules appropriately
- Monitor API usage and rate limits

### Data Privacy
- Handle user data according to privacy regulations
- Implement appropriate data retention policies
- Secure CSV file handling

## 📦 Production Deployment

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 4000
CMD ["npm", "start"]
```

### Environment Variables
```bash
NODE_ENV=production
PORT=4000
PINGONE_CLIENT_ID=your-client-id
PINGONE_CLIENT_SECRET=your-client-secret
PINGONE_ENVIRONMENT_ID=your-environment-id
PINGONE_REGION=NorthAmerica
```

### Reverse Proxy (Nginx)
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 🔄 Updates and Maintenance

### Updating the Application
```bash
git pull origin master
npm install
npm run build:bundle
npm start
```

### Backup Settings
```bash
cp data/settings.json data/settings.json.backup
```

### Monitoring
- Check application health: `http://localhost:4000/api/health`
- Monitor logs: `http://localhost:4000/logs`
- Review API usage in PingOne console

## 📞 Support

### Getting Help
1. Check the logs for error messages
2. Review this setup guide
3. Check the GitHub issues page
4. Contact your PingOne administrator

### Useful Commands
```bash
# Check application status
curl http://localhost:4000/api/health

# View logs
tail -f logs/app.log

# Test PingOne connection
curl -X POST http://localhost:4000/api/pingone/test-connection

# Get application version
curl http://localhost:4000/api/health | jq '.info.appVersion'
```

## 📝 License

This application is provided as-is for educational and development purposes. Please ensure compliance with PingOne's terms of service and applicable data protection regulations.

---

**Version**: 4.3.0  
**Last Updated**: July 2025  
**Compatibility**: Node.js 18+, PingOne API v1 