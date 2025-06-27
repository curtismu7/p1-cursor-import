#!/bin/bash

# Configuration
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" 
LOG_FILE="$APP_DIR/logs/server.log"
PID_FILE="$APP_DIR/server.pid"
MAX_RESTARTS=5
RESTART_DELAY=5

# Create logs directory if it doesn't exist
mkdir -p "$APP_DIR/logs"

# Function to start the server
start_server() {
    echo "Starting server..."
    cd "$APP_DIR"
    nohup node server.js >> "$LOG_FILE" 2>&1 & echo $! > "$PID_FILE"
    echo "Server started with PID $(cat $PID_FILE)"
}

# Function to stop the server
stop_server() {
    if [ -f "$PID_FILE" ]; then
        echo "Stopping server with PID $(cat $PID_FILE)..."
        kill -9 $(cat "$PID_FILE") 2>/dev/null
        rm -f "$PID_FILE"
        echo "Server stopped"
    fi
}

# Trap signals for graceful shutdown
trap 'stop_server; exit 0' SIGTERM SIGINT

# Main loop
restart_count=0
while [ $restart_count -lt $MAX_RESTARTS ]; do
    start_server
    
    # Wait for the server to exit
    wait $(cat "$PID_FILE")
    
    # Check exit status
    if [ $? -eq 0 ]; then
        echo "Server stopped gracefully"
        exit 0
    fi
    
    restart_count=$((restart_count + 1))
    echo "Server crashed. Restarting... (Attempt $restart_count/$MAX_RESTARTS)"
    
    if [ $restart_count -lt $MAX_RESTARTS ]; then
        sleep $RESTART_DELAY
    fi
done

echo "Max restart attempts reached. Giving up."
exit 1
