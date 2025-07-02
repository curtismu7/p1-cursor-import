/**
 * FileLogger - Handles writing logs to a client.log file using the File System Access API
 */
class FileLogger {
    /**
     * Create a new FileLogger instance
     * @param {string} filename - Name of the log file (default: 'client.log')
     */
    constructor(filename = 'client.log') {
        this.filename = filename;
        this.fileHandle = null;
        this.writableStream = null;
        this.initialized = false;
        this.logQueue = [];
        this.initializationPromise = null;
    }
    
    /**
     * Initialize the file logger
     * @private
     */
    async _initialize() {
        if (this.initialized) return true;
        if (this.initializationPromise) {
            return this.initializationPromise;
        }
        
        this.initializationPromise = (async () => {
            try {
                if (window.showSaveFilePicker) {
                    try {
                        this.fileHandle = await window.showSaveFilePicker({
                            suggestedName: this.filename,
                            types: [{
                                description: 'Log File',
                                accept: { 'text/plain': ['.log'] },
                            }],
                            excludeAcceptAllOption: false
                        });
                        
                        this.writableStream = await this.fileHandle.createWritable({ keepExistingData: true });
                        this.initialized = true;
                        await this._processQueue();
                        return true;
                    } catch (error) {
                        console.warn('File System Access API not available:', error);
                        this.initialized = false;
                        return false;
                    }
                }
                return false;
            } catch (error) {
                console.error('Error initializing file logger:', error);
                this.initialized = false;
                throw error;
            }
        })();
        
        return this.initializationPromise;
    }
    
    /**
     * Process any queued log messages
     * @private
     */
    async _processQueue() {
        if (this.logQueue.length === 0) return;
        
        const queue = [...this.logQueue];
        this.logQueue = [];
        
        for (const { level, message, timestamp } of queue) {
            await this._writeLog(level, message, timestamp);
        }
    }
    
    /**
     * Write a log message to the file
     * @private
     */
    async _writeLog(level, message, timestamp) {
        if (!this.initialized) {
            await this._initialize();
        }
        
        const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
        
        if (this.writableStream) {
            try {
                await this.writableStream.write(logEntry);
            } catch (error) {
                console.error('Error writing to log file:', error);
                this.initialized = false;
                await this._initialize();
                await this.writableStream.write(logEntry);
            }
        } else {
            console[level](`[FileLogger] ${logEntry}`);
        }
    }
    
    /**
     * Log a message
     * @param {string} level - Log level (info, warn, error, debug)
     * @param {string} message - The message to log
     */
    async log(level, message) {
        const timestamp = new Date().toISOString();
        
        if (!this.initialized) {
            this.logQueue.push({ level, message, timestamp });
            await this._initialize();
        } else {
            await this._writeLog(level, message, timestamp);
        }
    }
    
    /**
     * Log an info message
     * @param {string} message - The message to log
     */
    info(message) {
        return this.log('info', message);
    }
    
    /**
     * Log a warning message
     * @param {string} message - The message to log
     */
    warn(message) {
        return this.log('warn', message);
    }
    
    /**
     * Log an error message
     * @param {string} message - The message to log
     */
    error(message) {
        return this.log('error', message);
    }
    
    /**
     * Log a debug message
     * @param {string} message - The message to log
     */
    debug(message) {
        return this.log('debug', message);
    }
    
    /**
     * Close the log file
     */
    async close() {
        if (this.writableStream) {
            try {
                await this.writableStream.close();
            } catch (error) {
                console.error('Error closing log file:', error);
            } finally {
                this.initialized = false;
                this.writableStream = null;
                this.fileHandle = null;
            }
        }
    }
}

export { FileLogger };
