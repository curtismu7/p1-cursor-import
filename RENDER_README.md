# 🚀 Deploy to Render - Quick Start

This guide will get your PingOne Import Tool deployed to Render in minutes.

## Quick Deployment

1. **Run the deployment script:**
   ```bash
   ./deploy-render.sh
   ```

2. **Follow the generated checklist:**
   - Review `DEPLOYMENT_CHECKLIST.md`
   - Use environment variables from `.env.render`

3. **Deploy to Render:**
   - Go to [render.com](https://render.com)
   - Create new Web Service
   - Connect your repository
   - Use settings from `render.yaml`

## Essential Files Created

- ✅ `render.yaml` - Render configuration
- ✅ `env.example` - Environment variables template
- ✅ `DEPLOYMENT.md` - Detailed deployment guide
- ✅ `deploy-render.sh` - Automated deployment script
- ✅ `DEPLOYMENT_CHECKLIST.md` - Step-by-step checklist
- ✅ `.env.render` - Environment variables for Render

## Key Configuration

### Build Settings
- **Build Command:** `npm install && npm run build:bundle`
- **Start Command:** `npm start`
- **Health Check:** `/api/health`

### Environment Variables
```bash
NODE_ENV=production
PORT=10000
RATE_LIMIT=50
LOG_LEVEL=info
SESSION_SECRET=<generate-unique-value>
JWT_SECRET=<generate-unique-value>
```

## After Deployment

1. **Test the app:** `https://your-app-name.onrender.com/api/health`
2. **Configure PingOne:** Use the Settings page in the app
3. **Test import:** Upload a CSV file to verify functionality

## Support

- 📖 Full guide: `DEPLOYMENT.md`
- ✅ Checklist: `DEPLOYMENT_CHECKLIST.md`
- 🔧 Script: `deploy-render.sh`

## Troubleshooting

- **Build fails:** Check Node.js version (14+ required)
- **App won't start:** Verify PORT=10000 in environment variables
- **Health check fails:** Check logs in Render dashboard

---

**Need help?** See `DEPLOYMENT.md` for detailed instructions. 