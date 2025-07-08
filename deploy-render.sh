#!/bin/bash

# PingOne Import Tool - Render Deployment Script
# This script helps prepare and deploy the application to Render

set -e

echo "🚀 PingOne Import Tool - Render Deployment Script"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if required files exist
check_files() {
    print_info "Checking required files..."
    
    local missing_files=()
    
    if [[ ! -f "server.js" ]]; then
        missing_files+=("server.js")
    fi
    
    if [[ ! -f "package.json" ]]; then
        missing_files+=("package.json")
    fi
    
    if [[ ! -f "render.yaml" ]]; then
        missing_files+=("render.yaml")
    fi
    
    if [[ ! -f "env.example" ]]; then
        missing_files+=("env.example")
    fi
    
    if [[ ${#missing_files[@]} -gt 0 ]]; then
        print_error "Missing required files: ${missing_files[*]}"
        exit 1
    fi
    
    print_status "All required files found"
}

# Check Node.js version
check_node_version() {
    print_info "Checking Node.js version..."
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        exit 1
    fi
    
    local node_version=$(node --version | cut -d'v' -f2)
    local major_version=$(echo $node_version | cut -d'.' -f1)
    
    if [[ $major_version -lt 14 ]]; then
        print_error "Node.js version 14 or higher is required. Current version: $node_version"
        exit 1
    fi
    
    print_status "Node.js version $node_version is compatible"
}

# Check if npm dependencies are installed
check_dependencies() {
    print_info "Checking npm dependencies..."
    
    if [[ ! -d "node_modules" ]]; then
        print_warning "node_modules not found. Installing dependencies..."
        npm install
    fi
    
    print_status "Dependencies are ready"
}

# Build the application
build_app() {
    print_info "Building application..."
    
    if npm run build:bundle; then
        print_status "Application built successfully"
    else
        print_error "Build failed"
        exit 1
    fi
}

# Test the application locally
test_app() {
    print_info "Testing application locally..."
    
    # Start server in background
    timeout 10s npm start &
    local server_pid=$!
    
    # Wait a moment for server to start
    sleep 3
    
    # Test health endpoint
    if curl -s http://localhost:4000/api/health > /dev/null; then
        print_status "Local test passed"
    else
        print_warning "Local test failed - server may not be fully started"
    fi
    
    # Kill the server
    kill $server_pid 2>/dev/null || true
}

# Generate deployment checklist
generate_checklist() {
    print_info "Generating deployment checklist..."
    
    cat > DEPLOYMENT_CHECKLIST.md << 'EOF'
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
EOF

    print_status "Deployment checklist generated: DEPLOYMENT_CHECKLIST.md"
}

# Generate environment variables template
generate_env_template() {
    print_info "Generating environment variables template..."
    
    cat > .env.render << 'EOF'
# Render Environment Variables Template
# Copy these to your Render dashboard environment variables

# Required Variables
NODE_ENV=production
PORT=10000
RATE_LIMIT=50
LOG_LEVEL=info

# Security Variables (CHANGE THESE!)
SESSION_SECRET=your-super-secret-session-key-change-this
JWT_SECRET=your-jwt-secret-key-change-this

# Optional Variables
LOG_FILE_PATH=logs
MAX_FILE_SIZE=10mb
CORS_ORIGIN=https://your-app-name.onrender.com

# PingOne Settings (configure through UI)
# ENVIRONMENT_ID=your-environment-id
# API_CLIENT_ID=your-api-client-id
# API_SECRET=your-api-secret
# REGION=NorthAmerica
EOF

    print_status "Environment template generated: .env.render"
}

# Main execution
main() {
    echo ""
    print_info "Starting deployment preparation..."
    
    check_files
    check_node_version
    check_dependencies
    build_app
    test_app
    generate_checklist
    generate_env_template
    
    echo ""
    print_status "Deployment preparation complete!"
    echo ""
    print_info "Next steps:"
    echo "1. Review DEPLOYMENT_CHECKLIST.md"
    echo "2. Copy environment variables from .env.render to Render dashboard"
    echo "3. Deploy to Render using the checklist"
    echo "4. Configure PingOne settings after deployment"
    echo ""
    print_info "For detailed instructions, see DEPLOYMENT.md"
}

# Run main function
main "$@" 