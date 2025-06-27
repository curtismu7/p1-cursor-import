#!/bin/bash

# Configuration
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK_INTERVAL=60  # Check every minute
MAX_RETRIES=3
RETRY_DELAY=10
LOG_FILE="$APP_DIR/logs/monitor.log"

# Create logs directory if it doesn't exist
mkdir -p "$APP_DIR/logs"

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Check if server is running
is_server_running() {
    if [ -f "$APP_DIR/server.pid" ]; then
        local pid=$(cat "$APP_DIR/server.pid")
        if ps -p $pid > /dev/null 2>&1; then
            # Check if the process is actually our server
            if ps -p $pid -o cmd= | grep -q 'node server.js'; then
                return 0
            fi
        fi
    fi
    return 1
}

# Start the server
start_server() {
    log "Starting server..."
    cd "$APP_DIR"
    nohup node server.js >> "$APP_DIR/logs/server.log" 2>&1 & echo $! > "$APP_DIR/server.pid"
    local pid=$(cat "$APP_DIR/server.pid")
    log "Server started with PID $pid"
}

# Main monitoring loop
log "Starting server monitor..."

while true; do
    if ! is_server_running; then
        log "Server is not running. Attempting to restart..."
        
        # Try to start the server multiple times if needed
        local retry=0
        while [ $retry -lt $MAX_RETRIES ]; do
            start_server
            
            # Give it a moment to start
            sleep 5
            
            if is_server_running; then
                log "Server restarted successfully."
                break
            else
                retry=$((retry + 1))
                log "Failed to start server (attempt $retry/$MAX_RETRIES)"
                if [ $retry -lt $MAX_RETRIES ]; then
                    sleep $RETRY_DELAY
                fi
            fi
        done
        
        if [ $retry -eq $MAX_RETRIES ]; then
            log "Failed to restart server after $MAX_RETRIES attempts. Giving up."
            # You might want to send an alert here
        fi
    fi
    
    sleep $CHECK_INTERVAL
done
