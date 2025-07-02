import { FileLogger } from './file-logger.js';

class Logger {
    constructor(logContainer = null) {
        // Initialize properties
        this.logs = [];
        this.maxLogs = 1000;
        this.initialized = false;
        this.offlineLogs = [];
        this.isOnline = window.navigator.onLine;
        this.logContainer = null;
        
        // Initialize log container
        this._initLogContainer(logContainer);
        
        // Setup file logger with safe defaults
        this.fileLogger = {
            debug: (message, data, context) => {
                console.debug(`[DEBUG] ${message}`, data, context);
                return Promise.resolve();
            },
            info: (message, data, context) => {
                console.info(`[INFO] ${message}`, data, context);
                return Promise.resolve();
            },
            warn: (message, data, context) => {
                console.warn(`[WARN] ${message}`, data, context);
                return Promise.resolve();
            },
            error: (message, data, context) => {
                console.error(`[ERROR] ${message}`, data, context);
                return Promise.resolve();
            },
            close: () => Promise.resolve()
        };
        
        // Try to initialize the actual file logger
        try {
            this.fileLogger = new FileLogger('client.log');
            this.initialized = true;
            this.fileLogger.info('Logger initialized');
        } catch (error) {
            console.warn('Could not initialize file logger, using console fallback', error);
        }
        
        // Set up event listeners
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
    }
    
    _initLogContainer(logContainer) {
        if (logContainer && typeof logContainer === 'object') {
            this.logContainer = logContainer;
        } else {
            this.logContainer = document.getElementById('log-entries') || document.createElement('div');
        }
    }
    
    handleOnline() {
        this.isOnline = true;
        this.log('Internet connection restored', 'info');
        this.processOfflineLogs();
    }
    
    handleOffline() {
        this.isOnline = false;
        this.log('Internet connection lost, logging to memory', 'warn');
    }
    
    async processOfflineLogs() {
        if (this.offlineLogs.length === 0) return;
        
        this.log(`Processing ${this.offlineLogs.length} queued logs...`, 'info');
        
        for (const logEntry of this.offlineLogs) {
            try {
                await this.fileLogger.log(logEntry.level, logEntry.message, logEntry.data);
            } catch (error) {
                console.error('Error processing queued log:', error);
            }
        }
        
        this.offlineLogs = [];
        this.log('Finished processing queued logs', 'info');
    }
    
    async log(level, message, data = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = { level, message, data, timestamp };
        
        // Add to in-memory logs
        this.logs.push(logEntry);
        
        // Keep logs under maxLogs limit
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }
        
        // Log to console
        const logFn = console[level] || console.log;
        logFn(`[${timestamp}] [${level.toUpperCase()}] ${message}`, data);
        
        // Save to file logger
        if (this.fileLogger) {
            try {
                await this.fileLogger.log(level, message, data);
            } catch (error) {
                console.error('Error saving log to file:', error);
            }
        }
        
        // Send log to server
        try {
            await fetch('/api/logs/ui', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    level,
                    message,
                    data
                })
            });
        } catch (error) {
            console.error('Error sending log to server:', error);
            // Store logs for later when offline
            this.offlineLogs.push(logEntry);
        }
        
        // Update UI if log container exists
        this._updateLogUI(logEntry);
        
        return logEntry;
    }
    
    _updateLogUI(logEntry) {
        if (!this.logContainer) return;
        
        const logElement = document.createElement('div');
        logElement.className = `log-entry log-${logEntry.level}`;
        
        const timestamp = new Date(logEntry.timestamp).toLocaleTimeString();
        logElement.innerHTML = `
            <span class="log-timestamp">[${timestamp}]</span>
            <span class="log-level">${logEntry.level.toUpperCase()}</span>
            <span class="log-message">${logEntry.message}</span>
        `;
        
        if (logEntry.data && Object.keys(logEntry.data).length > 0) {
            const dataElement = document.createElement('pre');
            dataElement.className = 'log-data';
            dataElement.textContent = JSON.stringify(logEntry.data, null, 2);
            logElement.appendChild(dataElement);
        }
        
        this.logContainer.appendChild(logElement);
        this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }
    
    renderLogs() {
        if (!this.logContainer) return;
        
        // Clear existing logs
        this.logContainer.innerHTML = '';
        
        // Add all logs to the container
        this.logs.forEach(log => this._updateLogUI(log));
        
        // Scroll to bottom
        this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }
    
    clearLogs() {
        this.logs = [];
        if (this.logContainer) {
            this.logContainer.innerHTML = '';
        }
    }
    
    getLogs() {
        return [...this.logs];
    }
    
    debug(message, data = {}) {
        return this.log(message, 'debug', data);
    }
    
    info(message, data = {}) {
        return this.log(message, 'info', data);
    }
    
    success(message, data = {}) {
        return this.log(message, 'success', data);
    }
    
    warn(message, data = {}) {
        return this.log(message, 'warn', data);
    }
    
    error(message, data = {}) {
        return this.log(message, 'error', data);
    }
}

export { Logger };
