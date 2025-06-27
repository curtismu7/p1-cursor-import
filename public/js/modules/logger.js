const FileLogger = require('./file-logger.js');

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
            log: (level, message, data) => {
                const logFn = console[level] || console.log;
                logFn(`[${level.toUpperCase()}] ${message}`, data);
                return Promise.resolve();
            },
            download: () => {
                console.warn('File logger not initialized - cannot download logs');
                return Promise.resolve();
            }
        };
        
        // Try to initialize the actual file logger
        try {
            const fileLogger = new FileLogger('pingone-import-logs');
            this.fileLogger = fileLogger;
            this.initialized = true;
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
    
    async log(message, level = 'info', data = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = { message, level, data, timestamp };
        
        this.logs.push(logEntry);
        
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }
        
        const consoleMethod = console[level] || console.log;
        if (typeof message === 'string') {
            consoleMethod(`[${level.toUpperCase()}] ${message}`, data);
        } else {
            consoleMethod(message, data);
        }
        
        if (this.fileLogger) {
            try {
                await this.fileLogger.log(level, message, data);
            } catch (error) {
                console.error('Error logging to file:', error);
                if (!this.isOnline) {
                    this.offlineLogs.push({ level, message, data });
                }
            }
        }
        
        if (this.logContainer) {
            this.renderLogs();
        }
        
        return logEntry;
    }
    
    renderLogs() {
        if (!this.logContainer) return;
        
        this.logContainer.innerHTML = '';
        
        this.logs.forEach(entry => {
            const logElement = document.createElement('div');
            logElement.className = `log-entry log-${entry.level}`;
            logElement.innerHTML = `
                <span class="log-timestamp">${new Date(entry.timestamp).toLocaleString()}</span>
                <span class="log-level ${entry.level}">${entry.level.toUpperCase()}</span>
                <span class="log-message">${entry.message}</span>
            `;
            
            if (entry.data && Object.keys(entry.data).length > 0) {
                const dataElement = document.createElement('pre');
                dataElement.className = 'log-data';
                dataElement.textContent = JSON.stringify(entry.data, null, 2);
                logElement.appendChild(dataElement);
            }
            
            this.logContainer.appendChild(logElement);
        });
        
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

module.exports = { Logger };
