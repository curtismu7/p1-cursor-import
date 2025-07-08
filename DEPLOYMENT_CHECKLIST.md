# Render Deployment Checklist

## Pre-Deployment
- [ ] All required files are present (server.js, package.json, render.yaml, env.example)
- [ ] Node.js version 14+ is installed
- [ ] Dependencies are installed (`npm install`)
- [ ] Application builds successfully (`npm run build:bundle`)
- [ ] Local test passes

## Render Setup
- [ ] Create Render account
- [ ] Connect GitHub/GitLab repository
- [ ] Create new Web Service
- [ ] Configure service settings:
  - [ ] Name: pingone-import
  - [ ] Environment: Node
  - [ ] Region: Oregon (or closest)
  - [ ] Branch: main
  - [ ] Build Command: `npm install && npm run build:bundle`
  - [ ] Start Command: `npm start`

## Environment Variables
- [ ] NODE_ENV=production
- [ ] PORT=10000
- [ ] RATE_LIMIT=50
- [ ] LOG_LEVEL=info
- [ ] SESSION_SECRET=<generate-unique-value>
- [ ] JWT_SECRET=<generate-unique-value>

## Advanced Settings
- [ ] Health Check Path: /api/health
- [ ] Auto-Deploy: Enabled
- [ ] Plan: Free (or paid)

## Post-Deployment
- [ ] Test health endpoint: https://your-app-name.onrender.com/api/health
- [ ] Configure PingOne settings in the app
- [ ] Test CSV import functionality
- [ ] Monitor logs for errors
- [ ] Set up custom domain (optional)

## PingOne Configuration
- [ ] Environment ID configured
- [ ] API Client ID configured
- [ ] API Secret configured
- [ ] Region selected
- [ ] Connection test passes
- [ ] Settings saved

## Security
- [ ] HTTPS is working
- [ ] Rate limiting is active
- [ ] Secrets are not in code
- [ ] CORS is configured (if needed)

## Monitoring
- [ ] Health checks are passing
- [ ] Logs are accessible
- [ ] Error monitoring is set up
- [ ] Performance is acceptable
