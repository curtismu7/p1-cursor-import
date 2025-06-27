/**
 * FileLogger - Handles writing logs to localStorage with file download capability
 */
class FileLogger {
    /**
     * Create a new FileLogger instance
     * @param {string} logKey - Key to use for localStorage
     */
    constructor(logKey = 'pingone-import-logs') {
        this.logKey = logKey;
        this.maxLogSize = 100000; // ~100KB max log size
        this.logs = this._loadLogs();
        this._initializeLogs();
    }

    /**
     * Initialize logs with a header if empty
     * @private
     */
    _initializeLogs() {
        if (this.logs.length === 0) {
            const header = [
                '/***********************************************************************',
                ' * PINGONE IMPORT LOG',
                ' *',
                ` * Started: ${new Date().toISOString()}`,
                ' *',
                ' * FORMAT:',
                ' * [TIMESTAMP] [LEVEL] MESSAGE',
                ' *   - Data: { ... }',
                ' *   - Context: { ... }',
                ' *',
                ' * LEVELS: DEBUG, INFO, WARN, ERROR',
                ' *',
                ' * SENSITIVE DATA (tokens, secrets, etc.) ARE AUTOMATICALLY REDACTED',
                ' **********************************************************************/\n\n'
            ].join('\n');
            this._appendToLogs(header);
        }
    }

    /**
     * Load logs from localStorage
     * @private
     */
    _loadLogs() {
        try {
            const logs = localStorage.getItem(this.logKey);
            return logs ? logs : '';
        } catch (error) {
            console.error('Failed to load logs from localStorage:', error);
            return '';
        }
    }

    /**
     * Save logs to localStorage
     * @private
     */
    _saveLogs(logs) {
        try {
            localStorage.setItem(this.logKey, logs);
            return true;
        } catch (error) {
            console.error('Failed to save logs to localStorage:', error);
            return false;
        }
    }

    /**
     * Append text to logs, handling size limits
     * @private
     */
    _appendToLogs(text) {
        // If adding this text would exceed max size, trim from the beginning
        if (this.logs.length + text.length > this.maxLogSize) {
            // Remove oldest log entries until we have enough space
            const excess = (this.logs.length + text.length) - this.maxLogSize;
            const headerEnd = this.logs.indexOf('\n\n') + 2;
            const header = this.logs.substring(0, headerEnd);
            let content = this.logs.substring(headerEnd);
            
            // Remove oldest log entries (after the header)
            while (content.length > 0 && content.length > excess) {
                const firstNewline = content.indexOf('\n');
                if (firstNewline === -1) break;
                content = content.substring(firstNewline + 1);
            }
            
            this.logs = header + content;
        }
        
        this.logs += text;
        this._saveLogs(this.logs);
    }

    /**
     * Log a message
     * @param {string} level - Log level (info, debug, error, etc.)
     * @param {string} message - The message to log
     * @param {Object} [data] - Additional data to log
     */
    async log(level, message, data = {}) {
        const timestamp = new Date().toISOString();
        const levelStr = level.toUpperCase().padEnd(5);
        let logEntry = `[${timestamp}] [${levelStr}] ${message}`;
        
        // Add data if provided
        if (Object.keys(data).length > 0) {
            try {
                // Redact sensitive information
                const safeData = JSON.parse(JSON.stringify(data, (key, value) => {
                    // Redact tokens and secrets
                    if (typeof value === 'string' && 
                        (key.toLowerCase().includes('token') || 
                         key.toLowerCase().includes('secret') ||
                         key.toLowerCase().includes('password') ||
                         key.toLowerCase().includes('api_key') ||
                         key.toLowerCase().includes('apikey'))) {
                        return '***REDACTED***';
                    }
                    return value;
                }));
                
                // Format the data with proper indentation
                const formattedData = JSON.stringify(safeData, null, 2)
                    .split('\n')
                    .map((line, i) => i === 0 ? `  - ${line}` : `    ${line}`)
                    .join('\n');
                
                logEntry += `\n${formattedData}`;
            } catch (e) {
                logEntry += '\n  - [Error stringifying data]';
                logEntry += `\n  - Error: ${e.message}`;
            }
        }
        
        logEntry += '\n';
        this._appendToLogs(logEntry);
    }

    /**
     * Get all logs as a string
     * @returns {string} The complete log content
     */
    getLogs() {
        return this.logs;
    }
    
    /**
     * Clear all logs
     */
    clear() {
        this.logs = '';
        this._saveLogs('');
        this._initializeLogs();
    }
    
    /**
     * Download logs as a file
     */
    download() {
        try {
            const blob = new Blob([this.logs], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pingone-import-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to download logs:', error);
        }
    }
}

module.exports = FileLogger;
