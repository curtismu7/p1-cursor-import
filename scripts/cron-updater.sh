#!/bin/bash

# Automated NPM Package Updater Cron Job
# This script can be added to crontab for automated package updates

# Configuration
PROJECT_DIR="/Users/cmuir/cmuir/P1Sample/PingONe-cursor-import"
LOG_FILE="$PROJECT_DIR/update-cron.log"
LOCK_FILE="$PROJECT_DIR/update-cron.lock"
NODE_PATH="/usr/local/bin/node"
NPM_PATH="/usr/local/bin/npm"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Error handling
set -e

# Check if already running
if [ -f "$LOCK_FILE" ]; then
    PID=$(cat "$LOCK_FILE")
    if ps -p $PID > /dev/null 2>&1; then
        log "${YELLOW}Update already running (PID: $PID)${NC}"
        exit 1
    else
        log "${YELLOW}Removing stale lock file${NC}"
        rm -f "$LOCK_FILE"
    fi
fi

# Create lock file
echo $$ > "$LOCK_FILE"

# Function to cleanup on exit
cleanup() {
    log "${BLUE}Cleaning up...${NC}"
    rm -f "$LOCK_FILE"
}

# Set trap for cleanup
trap cleanup EXIT

# Main update process
main() {
    log "${BLUE}Starting automated package update${NC}"
    
    # Change to project directory
    cd "$PROJECT_DIR" || {
        log "${RED}Failed to change to project directory${NC}"
        exit 1
    }
    
    # Check if Node.js and npm are available
    if ! command -v "$NODE_PATH" &> /dev/null; then
        log "${RED}Node.js not found at $NODE_PATH${NC}"
        exit 1
    fi
    
    if ! command -v "$NPM_PATH" &> /dev/null; then
        log "${RED}npm not found at $NPM_PATH${NC}"
        exit 1
    fi
    
    # Check for package.json
    if [ ! -f "package.json" ]; then
        log "${RED}package.json not found${NC}"
        exit 1
    fi
    
    # Run conflict check first
    log "${BLUE}Running conflict check...${NC}"
    if "$NODE_PATH" scripts/conflict-checker.cjs; then
        log "${GREEN}Conflict check completed${NC}"
    else
        log "${YELLOW}Conflict check found issues - proceeding with caution${NC}"
    fi
    
    # Run auto-update
    log "${BLUE}Running auto-update...${NC}"
    if "$NODE_PATH" scripts/auto-update.cjs; then
        log "${GREEN}Auto-update completed successfully${NC}"
        
        # Run tests if available
        if [ -f "package.json" ] && grep -q '"test"' package.json; then
            log "${BLUE}Running tests after update...${NC}"
            if npm test > /dev/null 2>&1; then
                log "${GREEN}Tests passed${NC}"
            else
                log "${YELLOW}Tests failed - manual review needed${NC}"
            fi
        fi
        
        # Rebuild if needed
        if [ -f "package.json" ] && grep -q '"build"' package.json; then
            log "${BLUE}Rebuilding project...${NC}"
            if npm run build > /dev/null 2>&1; then
                log "${GREEN}Build completed successfully${NC}"
            else
                log "${YELLOW}Build failed - manual review needed${NC}"
            fi
        fi
        
    else
        log "${RED}Auto-update failed${NC}"
        exit 1
    fi
    
    log "${GREEN}Automated update process completed${NC}"
}

# Run main function
main "$@" 