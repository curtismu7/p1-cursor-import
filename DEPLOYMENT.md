# Deploying PingOne Import Tool to Render

This guide will help you deploy the PingOne Import Tool to Render, a cloud platform that makes it easy to deploy web applications.

## Prerequisites

1. A Render account (free tier available)
2. Your PingOne API credentials
3. Git repository with your code

## Step 1: Prepare Your Repository

### 1.1 Ensure Required Files Are Present

Make sure these files are in your repository root:

- `server.js` - Main server file
- `package.json` - Dependencies and scripts
- `render.yaml` - Render configuration
- `env.example` - Environment variables template

### 1.2 Verify Package.json Scripts

Your `package.json` should have these scripts:

```json
{
  "scripts": {
    "start": "node --experimental-modules --experimental-json-modules server.js",
    "build:bundle": "browserify public/js/app.js -t [ babelify --configFile ./babel.config.json --presets [ @babel/preset-env ] --plugins [ @babel/plugin-transform-runtime ] ] -o public/js/bundle.js",
    "postinstall": "npm run build:bundle"
  }
}
```

## Step 2: Deploy to Render

### 2.1 Connect Your Repository

1. Go to [render.com](https://render.com) and sign up/login
2. Click "New +" and select "Web Service"
3. Connect your GitHub/GitLab repository
4. Select the repository containing your PingOne Import Tool

### 2.2 Configure the Service

Use these settings:

- **Name**: `pingone-import` (or your preferred name)
- **Environment**: `Node`
- **Region**: Choose closest to your users (e.g., Oregon)
- **Branch**: `main` (or your default branch)
- **Build Command**: `npm install && npm run build:bundle`
- **Start Command**: `npm start`

### 2.3 Environment Variables

Add these environment variables in the Render dashboard:

#### Required Variables:
```
NODE_ENV=production
PORT=10000
RATE_LIMIT=50
LOG_LEVEL=info
```

#### Security Variables (generate unique values):
```
SESSION_SECRET=your-super-secret-session-key-change-this
JWT_SECRET=your-jwt-secret-key-change-this
```

#### Optional Variables:
```
LOG_FILE_PATH=logs
MAX_FILE_SIZE=10mb
CORS_ORIGIN=https://your-app-name.onrender.com
```

### 2.4 Advanced Settings

- **Health Check Path**: `/api/health`
- **Auto-Deploy**: Enabled
- **Plan**: Free (or paid for more resources)

## Step 3: Configure PingOne Settings

### 3.1 Get Your PingOne Credentials

1. Log into your PingOne Admin Console
2. Go to **Applications** → **Applications**
3. Create a new application or use existing one
4. Note down:
   - Environment ID
   - API Client ID
   - API Secret
   - Region (NorthAmerica, Europe, AsiaPacific)

### 3.2 Configure in the App

1. Once deployed, visit your app URL
2. Go to Settings page
3. Enter your PingOne credentials:
   - Environment ID
   - API Client ID
   - API Secret
   - Region
4. Test the connection
5. Save settings

## Step 4: Test Your Deployment

### 4.1 Health Check

Visit: `https://your-app-name.onrender.com/api/health`

Should return:
```json
{
  "status": "healthy",
  "message": "All services are healthy",
  "details": {
    "server": "ok",
    "timestamp": "2025-01-XX...",
    "uptime": 123.45,
    "memory": {
      "used": 45,
      "total": 67
    },
    "checks": {
      "server": "ok",
      "database": "ok",
      "storage": "ok",
      "pingone": "ok"
    }
  }
}
```

### 4.2 Test Import Functionality

1. Upload a CSV file with test users
2. Verify the import process works
3. Check logs for any errors

## Step 5: Security Considerations

### 5.1 HTTPS

Render automatically provides HTTPS certificates.

### 5.2 Rate Limiting

The app includes built-in rate limiting (50 requests/second by default).

### 5.3 CORS

Configure CORS if needed by setting the `CORS_ORIGIN` environment variable.

### 5.4 Secrets Management

- Never commit API secrets to your repository
- Use Render's environment variables for sensitive data
- Rotate secrets regularly

## Step 6: Monitoring and Logs

### 6.1 View Logs

In Render dashboard:
1. Go to your service
2. Click "Logs" tab
3. Monitor for errors or issues

### 6.2 Health Monitoring

Render will automatically monitor your `/api/health` endpoint.

## Troubleshooting

### Common Issues

1. **Build Fails**
   - Check that all dependencies are in `package.json`
   - Verify Node.js version compatibility

2. **App Won't Start**
   - Check environment variables are set correctly
   - Verify PORT is set to 10000
   - Check logs for specific errors

3. **PingOne Connection Fails**
   - Verify API credentials are correct
   - Check if IP restrictions are in place
   - Ensure environment ID is valid

4. **Rate Limiting Issues**
   - Adjust `RATE_LIMIT` environment variable
   - Monitor usage patterns

### Debug Commands

```bash
# Check if app is running
curl https://your-app-name.onrender.com/api/health

# Test PingOne connection
curl -X POST https://your-app-name.onrender.com/api/pingone/test-connection \
  -H "Content-Type: application/json" \
  -d '{"apiClientId":"your-client-id","apiSecret":"your-secret","environmentId":"your-env-id"}'
```

## Cost Optimization

### Free Tier Limits

- 750 hours/month (about 31 days)
- 512MB RAM
- Shared CPU
- Sleep after 15 minutes of inactivity

### Paid Plans

Consider upgrading if you need:
- More memory for large imports
- Always-on service (no sleep)
- Custom domains
- More bandwidth

## Support

If you encounter issues:

1. Check Render's documentation
2. Review application logs
3. Test locally first
4. Contact Render support if needed

## Next Steps

After successful deployment:

1. Set up custom domain (optional)
2. Configure monitoring alerts
3. Set up backup strategies
4. Document your deployment process 