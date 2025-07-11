// File: logger.js
// Description: Centralized logging system for PingOne user import tool
// 
// This module provides comprehensive logging functionality including:
// - Console logging with different levels (debug, info, warn, error)
// - File logging with automatic rotation and cleanup
// - UI logging with real-time updates
// - Offline log queuing and synchronization
// - Server-side log integration
// 
// Supports both browser and server environments with appropriate fallbacks.

import { FileLogger } from './file-logger.js';

/**
 * Logger Class
 * 
 * Provides centralized logging functionality with support for multiple outputs:
 * console, file, UI, and server. Handles log levels, formatting, and
 * offline/online state management.
 * 
 * @param {Object|HTMLElement} optionsOrLogContainer - Options object or log container element
 */
export class Logger {
    constructor(optionsOrLogContainer = {}) {
        // Handle both old signature (logContainer) and new signature (options object)
        // This maintains backward compatibility while supporting new features
        let options = {};
        let logContainer = null;
        
        // Determine if using new options format or old logContainer format
        // New format has maxLogs or fileLogger properties
        if (optionsOrLogContainer && typeof optionsOrLogContainer === 'object' && 
            (optionsOrLogContainer.maxLogs !== undefined || optionsOrLogContainer.fileLogger !== undefined)) {
            // New options format with configuration object
            options = optionsOrLogContainer;
            logContainer = options.logContainer || null;
        } else {
            // Old logContainer format for backward compatibility
            logContainer = optionsOrLogContainer;
            options = {};
        }
        
        this.logs = [];
        this.maxLogs = options.maxLogs || 1000;
        this.offlineLogs = [];
        this.fileLogger = options.fileLogger || null;
        this.initialized = false;
        this.isOnline = typeof window !== 'undefined' ? window.navigator.onLine : true;
        this.logContainer = null;
        
        // Flag to prevent server logging feedback loops
        this.serverLoggingEnabled = true;
        this.isLoadingLogs = false;
        
        // Initialize log container
        this._initLogContainer(logContainer);
        
        // Create a safe file logger that won't throw errors
        if (!this.fileLogger) {
            this.fileLogger = this._createSafeFileLogger();
        }
        
        // Mark as initialized
        this.initialized = true;
    }

    /**
     * Temporarily disable server logging to prevent feedback loops
     */
    disableServerLogging() {
        this.serverLoggingEnabled = false;
    }

    /**
     * Re-enable server logging
     */
    enableServerLogging() {
        this.serverLoggingEnabled = true;
    }

    /**
     * Set flag to indicate we're loading logs (prevents server logging)
     */
    setLoadingLogs(isLoading) {
        this.isLoadingLogs = isLoading;
    }
    
    /**
     * Create a safe file logger that handles initialization and errors
     * @private
     */
    _createSafeFileLogger() {
        const logger = {
            _initialized: false,
            _logger: null,
            _queue: [],
            _initializing: false,
            
            // Public logging methods that match console API
            log: function(...args) {
                const [message, data, context] = this._processArgs(...args);
                this._log('info', message, data, context);
            },
            debug: function(...args) {
                const [message, data, context] = this._processArgs(...args);
                this._log('debug', message, data, context);
            },
            info: function(...args) {
                const [message, data, context] = this._processArgs(...args);
                this._log('info', message, data, context);
            },
            warn: function(...args) {
                const [message, data, context] = this._processArgs(...args);
                this._log('warn', message, data, context);
            },
            error: function(...args) {
                const [message, data, context] = this._processArgs(...args);
                this._log('error', message, data, context);
            },
            
            // Helper method to process log arguments
            _processArgs: function(...args) {
                let message = '';
                let data = null;
                let context = null;

                if (args.length > 0) {
                    if (typeof args[0] === 'string') {
                        message = args[0];
                        if (args.length > 1 && typeof args[1] === 'object') {
                            data = args[1];
                            if (args.length > 2 && typeof args[2] === 'object') {
                                context = args[2];
                            }
                        }
                    } else if (typeof args[0] === 'object') {
                        data = args[0];
                        message = 'Log data';
                        if (args.length > 1 && typeof args[1] === 'object') {
                            context = args[1];
                        }
                    }
                }

                return [message, data, context];
            },
            
            // Internal log method that handles queuing and initialization
            _log: async function(level, message, data, context) {
                // Always log to console for debugging
                const consoleLevel = level === 'log' ? 'info' : level;
                if (console[consoleLevel]) {
                    console[consoleLevel](`[${level.toUpperCase()}]`, message, data || '', context || '');
                } else {
                    console.log(`[${level.toUpperCase()}]`, message, data || '', context || '');
                }
                
                // If we're not in a browser environment, don't try to use FileLogger
                if (typeof window === 'undefined') {
                    return;
                }
                
                // Use arrow function to maintain 'this' context
                const logToFile = async () => {
                    // If not initialized, queue the message
                    if (!this._initialized) {
                        this._queue.push({ level, message, data, context });
                        // Start initialization if not already in progress
                        if (!this._initializing) {
                            await this._initialize();
                        }
                        return;
                    }
                    
                    // If we have a logger, use it
                    if (this._logger) {
                        try {
                            await this._logger[level](message, data, context);
                        } catch (error) {
                            console.error('Error writing to log file:', error);
                        }
                    }
                };
                
                // Don't wait for the file logging to complete
                logToFile().catch(console.error);
            },
            
            // Initialize the file logger
            _initialize: async function() {
                if (this._initializing || this._initialized) return;
                this._initializing = true;
                
                try {
                    // Only initialize in a secure context with the File System Access API
                    if (window.isSecureContext && window.showSaveFilePicker) {
                        this._logger = new FileLogger('client.log');
                        await this._logger.info('Logger initialized');
                        
                        // Process any queued messages
                        const queue = [...this._queue];
                        this._queue = [];
                        
                        for (const { level, message, data, context } of queue) {
                            try {
                                await this._logger[level](message, data, context);
                            } catch (err) {
                                console.error('Error processing queued log:', err);
                            }
                        }
                    }
                } catch (error) {
                    console.error('Failed to initialize file logger:', error);
                } finally {
                    this._initialized = true;
                    this._initializing = false;
                }
            },
            
            // Close the file logger
            close: async function() {
                try {
                    if (this._logger && typeof this._logger.close === 'function') {
                        await this._logger.close();
                    }
                } catch (error) {
                    console.error('Error closing file logger:', error);
                }
            }
        };
        
        // Initialize on first user interaction if in browser
        if (typeof window !== 'undefined') {
            const initOnInteraction = () => {
                window.removeEventListener('click', initOnInteraction);
                window.removeEventListener('keydown', initOnInteraction);
                logger._initialize().catch(console.error);
            };
            
            window.addEventListener('click', initOnInteraction);
            window.addEventListener('keydown', initOnInteraction);
        }
        
        return logger;
    }
    
    // Public logging methods that match console API
    log(message, data, context) {
        this._addToLogs('info', message, data, context);
        this.fileLogger.log(message, data, context);
    }
    
    debug(message, data, context) {
        this._addToLogs('debug', message, data, context);
        this.fileLogger.debug(message, data, context);
    }
    
    info(message, data, context) {
        this._addToLogs('info', message, data, context);
        this.fileLogger.info(message, data, context);
    }
    
    warn(message, data, context) {
        this._addToLogs('warn', message, data, context);
        this.fileLogger.warn(message, data, context);
    }
    
    error(message, data, context) {
        this._addToLogs('error', message, data, context);
        this.fileLogger.error(message, data, context);
    }
    
    // Internal method to add logs to the in-memory array and UI
    _addToLogs(level, message, data, context) {
        const timestamp = new Date().toISOString();
        const logEntry = { timestamp, level, message, data, context };
        
        // Add to logs array
        this.logs.push(logEntry);
        
        // Keep only the most recent logs
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }
        
        // Update UI if log container exists
        this._updateLogUI(logEntry);
    }
    
    /**
     * Update the UI with a new log entry
     * @private
     * @param {Object} logEntry - The log entry to display
     */
    _updateLogUI(logEntry) {
        if (!this.logContainer || !(this.logContainer instanceof HTMLElement)) {
            return;
        }
        
        try {
            const logElement = document.createElement('div');
            logElement.className = `log-entry log-${logEntry.level}`;
            
            const timeStr = new Date(logEntry.timestamp).toLocaleTimeString();
            
            // Create a more structured log entry with expand/collapse functionality
            const timeElement = document.createElement('span');
            timeElement.className = 'log-time';
            timeElement.textContent = timeStr;
            
            const levelElement = document.createElement('span');
            levelElement.className = `log-level ${logEntry.level}`;
            levelElement.textContent = logEntry.level.toUpperCase();
            
            const messageElement = document.createElement('div');
            messageElement.className = 'log-message';
            messageElement.textContent = logEntry.message;
            
            // Create expand icon for entries with additional data
            const hasDetails = logEntry.data || logEntry.context;
            let expandIcon = null;
            if (hasDetails) {
                expandIcon = document.createElement('span');
                expandIcon.className = 'log-expand-icon';
                expandIcon.innerHTML = '▶'; // Right-pointing triangle for collapsed state
                expandIcon.style.cursor = 'pointer';
            }
            
            // Create a container for the log header (time, level, message, expand icon)
            const headerElement = document.createElement('div');
            headerElement.className = 'log-header';
            headerElement.style.display = 'flex';
            headerElement.style.alignItems = 'center';
            headerElement.style.gap = '8px';
            headerElement.appendChild(timeElement);
            headerElement.appendChild(levelElement);
            headerElement.appendChild(messageElement);
            if (expandIcon) {
                headerElement.appendChild(expandIcon);
            }
            
            logElement.appendChild(headerElement);
            
            // Create details container for expandable content
            if (hasDetails) {
                const detailsElement = document.createElement('div');
                detailsElement.className = 'log-details';
                detailsElement.style.display = 'none'; // Initially hidden
                
                // Add data if it exists
                if (logEntry.data) {
                    const dataSection = document.createElement('div');
                    dataSection.className = 'log-detail-section';
                    const dataTitle = document.createElement('h4');
                    dataTitle.textContent = 'Data';
                    dataSection.appendChild(dataTitle);
                    const dataContent = document.createElement('pre');
                    dataContent.className = 'log-detail-json';
                    dataContent.textContent = JSON.stringify(logEntry.data, null, 2);
                    dataSection.appendChild(dataContent);
                    detailsElement.appendChild(dataSection);
                }

                // Add context if it exists
                if (logEntry.context) {
                    const contextSection = document.createElement('div');
                    contextSection.className = 'log-detail-section';
                    const contextTitle = document.createElement('h4');
                    contextTitle.textContent = 'Context';
                    contextSection.appendChild(contextTitle);
                    const contextContent = document.createElement('pre');
                    contextContent.className = 'log-detail-json';
                    contextContent.textContent = JSON.stringify(logEntry.context, null, 2);
                    contextSection.appendChild(contextContent);
                    detailsElement.appendChild(contextSection);
                }

                // Add details if it exists (as a string)
                if (logEntry.details) {
                    const detailsSection = document.createElement('div');
                    detailsSection.className = 'log-detail-section';
                    const detailsTitle = document.createElement('h4');
                    detailsTitle.textContent = 'Details';
                    detailsSection.appendChild(detailsTitle);
                    const detailsContent = document.createElement('pre');
                    detailsContent.className = 'log-detail-json';
                    detailsContent.textContent = logEntry.details;
                    detailsSection.appendChild(detailsContent);
                    detailsElement.appendChild(detailsSection);
                }
                logElement.appendChild(detailsElement);
            }

            // === LOG ENTRY INSERTION: NEWEST FIRST ===
            // Logs are reversed so newest entries show first (top of the list)
            // Makes recent events immediately visible without scrolling
            // Maintain this ordering for all future log-related features
            if (this.logContainer.firstChild) {
                this.logContainer.insertBefore(logElement, this.logContainer.firstChild);
            } else {
                this.logContainer.appendChild(logElement);
            }

            // Auto-scroll to top since newest entries are at the top
            this.logContainer.scrollTop = 0;

            // Limit the number of log entries in the UI
            const maxUILogs = 100;
            while (this.logContainer.children.length > maxUILogs) {
                this.logContainer.removeChild(this.logContainer.lastChild);
            }
        } catch (error) {
            console.error('Error updating log UI:', error);
        }
    }
    
    _initLogContainer(logContainer) {
        try {
            if (logContainer && typeof logContainer === 'string') {
                this.logContainer = document.querySelector(logContainer);
            } else if (logContainer instanceof HTMLElement) {
                this.logContainer = logContainer;
            } else {
                this.logContainer = document.getElementById('log-entries') || document.createElement('div');
            }
        } catch (error) {
            console.error('Error initializing log container:', error);
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
        
        // Save to file logger if available
        if (this.fileLogger) {
            try {
                // Use the appropriate log level method on fileLogger
                const logMethod = this.fileLogger[level] || this.fileLogger.info;
                if (typeof logMethod === 'function') {
                    await logMethod.call(this.fileLogger, message, data);
                } else {
                    console.warn(`Log method '${level}' not available on fileLogger`);
                }
            } catch (error) {
                console.error('Error saving log to file:', error);
            }
        }
        
        // Send log to server only if server logging is enabled and we're not loading logs
        if (this.serverLoggingEnabled && !this.isLoadingLogs) {
            try {
                // Additional check: if we're currently fetching logs, skip server logging entirely
                if (window.location && window.location.href && window.location.href.includes('/api/logs')) {
                    return logEntry; // Skip server logging if we're on a logs-related page
                }
                
                // Check if we're in a logging operation by looking at the call stack
                const stack = new Error().stack;
                if (stack && (stack.includes('loadAndDisplayLogs') || stack.includes('/api/logs'))) {
                    return logEntry; // Skip server logging if called from log loading functions
                }
                
                await fetch('/api/logs/ui', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ level, message, data })
                });
            } catch (error) {
                console.error('Error sending log to server:', error);
                this.offlineLogs.push(logEntry);
            }
        } else {
            // Log why we're skipping server logging
            if (!this.serverLoggingEnabled) {
                console.debug('Skipping server logging: disabled');
            }
            if (this.isLoadingLogs) {
                console.debug('Skipping server logging: loading logs');
            }
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
        return this.log('debug', message, data);
    }
    
    info(message, data = {}) {
        return this.log('info', message, data);
    }
    
    success(message, data = {}) {
        return this.log('success', message, data);
    }
    
    warn(message, data = {}) {
        return this.log('warn', message, data);
    }
    
    error(message, data = {}) {
        return this.log('error', message, data);
    }
}
