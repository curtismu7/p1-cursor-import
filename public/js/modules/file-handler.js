// File: file-handler.js
// Description: CSV file processing and validation for PingOne user import
// 
// This module handles all file-related operations including:
// - CSV file reading and parsing
// - User data validation and error checking
// - File preview generation
// - File information display and management
// - Folder path tracking for better UX
// - Validation summary and error reporting
// 
// Provides comprehensive CSV processing with detailed validation feedback.

/**
 * File Handler Class
 * 
 * Manages CSV file processing, validation, and user data preparation
 * for the PingOne import tool. Handles file selection, parsing,
 * validation, and preview generation.
 * 
 * @param {Object} logger - Logger instance for debugging
 * @param {Object} uiManager - UI manager for status updates
 */
class FileHandler {
    constructor(logger, uiManager) {
        this.logger = logger;
        this.uiManager = uiManager;
        
        // Required fields for user validation
        this.requiredFields = ['username'];
        
        // Validation tracking for processed files
        this.validationResults = {
            total: 0,
            valid: 0,
            errors: 0,
            warnings: 0
        };
        
        // File processing state
        this.lastParsedUsers = [];
        this.currentFile = null;
        
        // Initialize UI elements for file handling
        this.fileInput = document.getElementById('csv-file');
        this.fileInfo = document.getElementById('file-info');
        this.previewContainer = document.getElementById('preview-container');
        
        // Load last file info from localStorage for better UX
        this.lastFileInfo = this.loadLastFileInfo();
        
        // Initialize event listeners for file input
        this.initializeFileInput();


    }



    // ======================
    // File Info Management
    // ======================
    
    loadLastFileInfo() {
        try {
            const savedFile = localStorage.getItem('lastSelectedFile');
            return savedFile ? JSON.parse(savedFile) : null;
        } catch (error) {
            this.logger.error('Error loading last file info:', error);
            return null;
        }
    }
    
    /**
     * Get the current file being processed
     * 
     * Returns the File object that is currently loaded and ready for processing.
     * Used by other modules to access the file for upload operations.
     * 
     * @returns {File|null} The current file or null if none is loaded
     */
    getCurrentFile() {
        return this.currentFile;
    }
    
    /**
     * Set a file and process it for import
     * 
     * Validates the file, processes its contents, and prepares it for
     * import operations. Updates UI with file information and validation results.
     * 
     * @param {File} file - The file to set and process
     * @returns {Promise<Object>} Promise that resolves with processing result
     */
    async setFile(file) {
        try {
            this.logger.info('Setting file', { fileName: file.name, fileSize: file.size });
            
            // Store the current file reference for later use
            this.currentFile = file;
            
            // Process the file using the existing internal method
            // This includes validation, parsing, and UI updates
            await this._handleFileInternal(file);
            
            return { success: true, file };
        } catch (error) {
            this.logger.error('Failed to set file', { error: error.message, fileName: file.name });
            throw error;
        }
    }
    
    /**
     * Get the list of parsed users from the current file
     * 
     * Returns the array of user objects that were successfully parsed
     * from the CSV file. Each user object contains validated data.
     * 
     * @returns {Array} Array of user objects with validated data
     */
    getUsers() {
        return this.lastParsedUsers || [];
    }

    /**
     * Get the total number of users parsed from the CSV file
     * 
     * Returns the total count of users found in the processed CSV file.
     * This count includes all rows, regardless of validation status.
     * 
     * @returns {number} Total number of users in the CSV file
     */
    getTotalUsers() {
        const totalUsers = this.validationResults.total || 0;
        console.log('[CSV] getTotalUsers() called, returning:', totalUsers, 'validationResults:', this.validationResults);
        return totalUsers;
    }

    /**
     * Read file as text using FileReader API
     * 
     * Asynchronously reads a file and returns its contents as a string.
     * Used for processing CSV files and other text-based formats.
     * 
     * @param {File} file - The file to read
     * @returns {Promise<string>} Promise that resolves with file content as string
     */
    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    /**
     * Save the last folder path that was used
     * @param {File} file - The selected file
     * @param {string} operationType - The operation type ('import', 'delete', 'modify')
     */
    saveLastFolderPath(file, operationType = 'import') {
        try {
            let folderPath = null;
            
            // Try to extract folder path from different sources
            if (file.webkitRelativePath) {
                // For webkitRelativePath, get the directory part
                const pathParts = file.webkitRelativePath.split('/');
                if (pathParts.length > 1) {
                    folderPath = pathParts.slice(0, -1).join('/');
                }
            } else if (file.name) {
                // For regular files, try to extract from the file name
                // This is a fallback since we can't get the full path due to security restrictions
                const fileName = file.name;
                const lastSlashIndex = fileName.lastIndexOf('/');
                if (lastSlashIndex !== -1) {
                    folderPath = fileName.substring(0, lastSlashIndex);
                }
            }
            
            if (folderPath) {
                // Save with operation-specific key
                const storageKey = `lastFolderPath_${operationType}`;
                localStorage.setItem(storageKey, folderPath);
                this.logger.info(`Saved last folder path for ${operationType}:`, folderPath);
            }
            
            // Also save a general last folder path
            if (folderPath) {
                localStorage.setItem('lastFolderPath', folderPath);
            }
            
        } catch (error) {
            this.logger.warn('Could not save folder path:', error.message);
        }
    }

    /**
     * Get the last folder path that was used
     * @param {string} operationType - The operation type ('import', 'delete', 'modify')
     * @returns {string|null} The last folder path or null if not available
     */
    getLastFolderPath(operationType = 'import') {
        try {
            // First try to get operation-specific folder path
            const operationKey = `lastFolderPath_${operationType}`;
            let folderPath = localStorage.getItem(operationKey);
            
            // Fall back to general last folder path
            if (!folderPath) {
                folderPath = localStorage.getItem('lastFolderPath');
            }
            
            return folderPath;
        } catch (error) {
            this.logger.warn('Could not get last folder path:', error.message);
            return null;
        }
    }

    /**
     * Update the file input label to show last folder path
     * @param {string} operationType - The operation type ('import', 'delete', 'modify')
     */
    updateFileLabel(operationType = 'import') {
        try {
            // Find the appropriate file label based on operation type
            let fileLabel = null;
            let fileInput = null;
            
            switch (operationType) {
                case 'import':
                    fileLabel = document.querySelector('label[for="csv-file"] span');
                    fileInput = document.getElementById('csv-file');
                    break;
                case 'delete':
                    fileLabel = document.querySelector('label[for="delete-csv-file"] span');
                    fileInput = document.getElementById('delete-csv-file');
                    break;
                case 'modify':
                    fileLabel = document.querySelector('label[for="modify-csv-file"] span');
                    fileInput = document.getElementById('modify-csv-file');
                    break;
                default:
                    fileLabel = document.querySelector('.file-label span');
                    break;
            }
            
            if (fileLabel) {
                const lastFolderPath = this.getLastFolderPath(operationType);
                if (lastFolderPath) {
                    // Show a shortened version of the path for better UI
                    const shortPath = this.shortenPath(lastFolderPath);
                    fileLabel.textContent = `Choose CSV File (Last: ${shortPath})`;
                    fileLabel.title = `Last used folder: ${lastFolderPath}`;
                } else {
                    fileLabel.textContent = 'Choose CSV File';
                    fileLabel.title = 'Select a CSV file to process';
                }
            }
        } catch (error) {
            this.logger.warn('Could not update file label:', error.message);
        }
    }
    
    /**
     * Shorten a file path for display in the UI
     * @param {string} path - The full path
     * @returns {string} The shortened path
     */
    shortenPath(path) {
        if (!path) return '';
        
        const maxLength = 30;
        if (path.length <= maxLength) {
            return path;
        }
        
        // Try to keep the most relevant parts
        const parts = path.split('/');
        if (parts.length <= 2) {
            return path.length > maxLength ? '...' + path.slice(-maxLength + 3) : path;
        }
        
        // Keep first and last parts, add ellipsis in middle
        const firstPart = parts[0];
        const lastPart = parts[parts.length - 1];
        const middleParts = parts.slice(1, -1);
        
        let result = firstPart;
        if (middleParts.length > 0) {
            result += '/.../' + lastPart;
        } else {
            result += '/' + lastPart;
        }
        
        return result.length > maxLength ? '...' + result.slice(-maxLength + 3) : result;
    }
    
    saveFileInfo(fileInfo) {
        try {
            const fileData = {
                name: fileInfo.name,
                size: fileInfo.size,
                lastModified: fileInfo.lastModified,
                type: fileInfo.type
            };
            localStorage.setItem('lastSelectedFile', JSON.stringify(fileData));
            this.lastFileInfo = fileData;
        } catch (error) {
            this.logger.error('Error saving file info:', error);
        }
    }
    
    clearFileInfo() {
        try {
            localStorage.removeItem('lastSelectedFile');
            this.lastFileInfo = null;
            if (this.fileInfo) {
                this.fileInfo.innerHTML = 'No file selected';
            }
        } catch (error) {
            this.logger.error('Error clearing file info:', error);
        }
    }

    /**
     * Clear the last folder path
     */
    clearLastFolderPath() {
        try {
            localStorage.removeItem('lastFolderPath');
            this.updateFileLabel();
            this.logger.info('Cleared last folder path');
        } catch (error) {
            this.logger.warn('Could not clear last folder path:', error.message);
        }
    }

    // ======================
    // File Handling
    // ======================
    
    initializeFileInput() {
        if (!this.fileInput) return;
        
        // Remove existing event listeners
        const newFileInput = this.fileInput.cloneNode(true);
        this.fileInput.parentNode.replaceChild(newFileInput, this.fileInput);
        this.fileInput = newFileInput;
        
        // Add new event listener
        this.fileInput.addEventListener('change', (event) => this.handleFileSelect(event));
        
        // Update file label to show last folder path if available
        this.updateFileLabel();
    }
    
    /**
     * Handle a File object directly (not an event)
     * @param {File} file
     */
    async handleFileObject(file) {
        await this._handleFileInternal(file);
    }

    /**
     * Handle file selection from an input event
     * @param {Event} event
     */
    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) {
            this.logger.warn('No file selected');
            return;
        }
        
        // Save the folder path for next time
        this.saveLastFolderPath(file, 'import');
        
        await this._handleFileInternal(file, event);
    }

    /**
     * Shared internal file handling logic
     * @param {File} file
     * @param {Event} [event]
     * @private
     */
    async _handleFileInternal(file, event) {
        console.log('[CSV] _handleFileInternal called with file:', file.name, 'size:', file.size);
        try {
            this.logger.info('Processing file', { fileName: file.name, fileSize: file.size });
            
            // Validate file type - allow files without extensions or with any extension except known bad ones
            const fileName = file.name || '';
            const fileExt = this.getFileExtension(fileName).toLowerCase();
            const knownBadExts = ['exe', 'js', 'png', 'jpg', 'jpeg', 'gif', 'pdf', 'zip', 'tar', 'gz'];
            if (fileExt && knownBadExts.includes(fileExt)) {
                const errorMsg = `Unsupported file type: ${fileExt}. Please upload a CSV or text file.`;
                this.logger.error(errorMsg, { fileName, fileExt });
                throw new Error(errorMsg);
            }
            // Accept all other extensions and blank/unknown types (including files with no extension)
            
            // Validate file size (10MB limit)
            const maxSize = 10 * 1024 * 1024; // 10MB
            if (file.size > maxSize) {
                throw new Error('File too large. Please select a file smaller than 10MB.');
            }
            
            // Read file content
            const content = await this.readFileAsText(file);
            
            console.log('[CSV] _handleFileInternal: About to parse CSV content, length:', content.length);
            // Parse CSV with enhanced validation
            const parseResults = this.parseCSV(content);
            console.log('[CSV] _handleFileInternal: parseCSV completed, parseResults:', parseResults);
            
            // Store parsed users
            this.parsedUsers = parseResults.users;
            this.lastParsedUsers = [...parseResults.users];
            
            // Update validation results for getTotalUsers() method
            this.validationResults = {
                total: parseResults.users.length,
                valid: parseResults.validUsers || parseResults.users.length,
                errors: parseResults.errors.length,
                warnings: parseResults.warnings.length
            };
            
            // Add debug logging
            console.log('[CSV] File parsed successfully:', {
                totalUsers: this.validationResults.total,
                validUsers: this.validationResults.valid,
                errors: this.validationResults.errors,
                warnings: this.validationResults.warnings
            });
            
            // Update UI with results
            const message = `File processed: ${parseResults.validUsers} valid users, ${parseResults.invalidRows} invalid rows`;
            this.uiManager.showNotification(message, parseResults.invalidRows > 0 ? 'warning' : 'success');

            // Update UI with enhanced file info display
            this.updateFileInfoForElement(file, 'file-info');
            
            // Update file label to show last folder path
            this.updateFileLabel('import');

            // Log detailed errors for debugging
            if (parseResults.errors.length > 0) {
                this.logger.warn('CSV parsing errors', {
                    errorCount: parseResults.errors.length,
                    errors: parseResults.errors.slice(0, 10) // Log first 10 errors
                });
            }

            // Update import button state based on population selection
            if (window.app && window.app.updateImportButtonState) {
                window.app.updateImportButtonState();
            }

        } catch (error) {
            this.logger.error('Failed to process CSV file', {
                error: error.message,
                fileName: file.name
            });
            console.error('Error in _handleFileInternal:', error);

            let errorMessage = 'Failed to process CSV file. ';
            if (error.message.includes('Missing required headers')) {
                errorMessage += error.message;
            } else if (error.message.includes('Invalid file type')) {
                errorMessage += 'Please select a valid CSV file.';
            } else if (error.message.includes('File too large')) {
                errorMessage += 'Please select a smaller file (max 10MB).';
            } else {
                errorMessage += error.message;
            }

            this.uiManager.showNotification(errorMessage, 'error');
            
            // Clear file input
            if (event && event.target && event.target.value) {
                event.target.value = '';
            }
        }
    }
    
    /**
     * Process a CSV file for user import
     * 
     * Validates the file format, reads its contents, parses CSV data,
     * and prepares user objects for import. Handles file validation,
     * CSV parsing, and error reporting.
     * 
     * @param {File} file - The CSV file to process
     * @returns {Promise<Object>} Promise that resolves with parsing results
     */
    async processCSV(file) {
        // Log file object for debugging
        this.logger.log('Processing file object:', 'debug', file);
        
        // Validate file exists and is not empty
        if (!file) {
            this.logger.error('No file provided to processCSV');
            throw new Error('No file selected');
        }
        
        if (file.size === 0) {
            this.logger.error('Empty file provided', { fileName: file.name, size: file.size });
            throw new Error('File is empty');
        }
        
        // Only block known bad extensions, allow all others
        const fileName = file.name || '';
        const fileExt = this.getFileExtension(fileName).toLowerCase();
        const knownBadExts = ['exe', 'js', 'png', 'jpg', 'jpeg', 'gif', 'pdf', 'zip', 'tar', 'gz'];
        if (fileExt && knownBadExts.includes(fileExt)) {
            const errorMsg = `Unsupported file type: ${fileExt}. Please upload a CSV or text file.`;
            this.logger.error(errorMsg, { fileName, fileExt });
            throw new Error(errorMsg);
        }
        // Accept all other extensions and blank/unknown types
        // Check file size (max 10MB)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            throw new Error(`File is too large. Maximum size is ${this.formatFileSize(maxSize)}`);
        }
        
        // Update UI
        this.saveFileInfo(file);
        this.updateFileInfo(file);
        
        // Store the current file reference
        this.currentFile = file;
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (event) => {
                try {
                    const text = event.target.result;
                    if (!text || text.trim() === '') {
                        throw new Error('File is empty or contains no text');
                    }
                    
                    console.log('[CSV] About to parse CSV text, length:', text.length);
                    const { headers, rows } = this.parseCSV(text);
                    console.log('[CSV] parseCSV completed, headers:', headers, 'rows count:', rows.length);
                    
                    // Validate required fields
                    const missingHeaders = this.requiredFields.filter(field => !headers.includes(field));
                    if (missingHeaders.length > 0) {
                        throw new Error(`Missing required columns: ${missingHeaders.join(', ')}`);
                    }
                    
                    // Convert rows to user objects and store them
                    this.lastParsedUsers = rows.map(row => {
                        const user = {};
                        headers.forEach((header, index) => {
                            user[header] = row[header] || '';
                        });
                        return user;
                    });
                    
                    // Also store in parsedUsers for compatibility with getParsedUsers
                    this.parsedUsers = this.lastParsedUsers;
                    
                    // Update validation results for getTotalUsers() method
                    this.validationResults = {
                        total: this.lastParsedUsers.length,
                        valid: this.lastParsedUsers.length,
                        errors: 0,
                        warnings: 0
                    };
                    
                    // Add debug logging
                    console.log('[CSV] File parsed successfully (processCSV):', {
                        totalUsers: this.validationResults.total,
                        validUsers: this.validationResults.valid,
                        errors: this.validationResults.errors,
                        warnings: this.validationResults.warnings
                    });
                    
                    resolve({ 
                        success: true, 
                        headers, 
                        rows: this.lastParsedUsers,
                        userCount: this.lastParsedUsers.length
                    });
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = () => {
                reject(new Error('Error reading file'));
            };
            
            reader.readAsText(file);
        });
    }
    
    // ======================
    // CSV Parsing Methods
    // ======================
    
    /**
     * Parse CSV content into headers and data rows
     * 
     * Splits CSV content into lines, extracts headers, and validates
     * required and recommended columns. Handles header mapping for
     * different naming conventions.
     * 
     * @param {string} content - Raw CSV content as string
     * @returns {Object} Object containing headers and parsed rows
     */
    parseCSV(content) {
        // Split content into lines and filter out empty lines
        const lines = content.split('\n').filter(line => line.trim());
        if (lines.length < 2) {
            throw new Error('CSV file must have at least a header row and one data row');
        }

        // Parse headers from first line
        const headers = this.parseCSVLine(lines[0]);
        
        // Define required and recommended headers for validation
        const requiredHeaders = ['username'];
        const recommendedHeaders = ['firstName', 'lastName', 'email'];
        
        // Log all headers for debugging
        console.log('[CSV] All headers:', headers);
        console.log('[CSV] Required headers:', requiredHeaders);
        console.log('[CSV] Recommended headers:', recommendedHeaders);
        
        // Validate headers
        const missingRequired = requiredHeaders.filter(h => {
            const hasHeader = headers.some(header => {
                const headerLower = header.toLowerCase();
                const mappedHeader = this.getHeaderMapping(headerLower);
                const matches = headerLower === h.toLowerCase() || mappedHeader === h;
                console.log(`[CSV] Checking header "${header}" (${headerLower}) -> "${mappedHeader}" for required "${h}": ${matches}`);
                return matches;
            });
            console.log(`[CSV] Required header "${h}" found: ${hasHeader}`);
            return !hasHeader;
        });
        
        const missingRecommended = recommendedHeaders.filter(h => {
            const hasHeader = headers.some(header => {
                const headerLower = header.toLowerCase();
                const mappedHeader = this.getHeaderMapping(headerLower);
                const matches = headerLower === h.toLowerCase() || mappedHeader === h;
                console.log(`[CSV] Checking header "${header}" (${headerLower}) -> "${mappedHeader}" for recommended "${h}": ${matches}`);
                return matches;
            });
            console.log(`[CSV] Recommended header "${h}" found: ${hasHeader}`);
            return !hasHeader;
        });

        if (missingRequired.length > 0) {
            const errorMsg = `Missing required headers: ${missingRequired.join(', ')}. At minimum, you need a 'username' column.`;
            this.logger.error('CSV validation failed - missing required headers', {
                missingRequired,
                availableHeaders: headers,
                errorMsg
            });
            throw new Error(errorMsg);
        }

        if (missingRecommended.length > 0) {
            const warningMsg = `Missing recommended headers: ${missingRecommended.join(', ')}. These are not required but recommended for better user data.`;
            this.logger.warn('CSV validation warning - missing recommended headers', {
                missingRecommended,
                availableHeaders: headers,
                warningMsg
            });
            // Show warning but don't throw error
            if (window.app && window.app.uiManager) {
                window.app.uiManager.showNotification(warningMsg, 'warning');
            }
        }

        const users = [];
        const errors = [];
        const warnings = [];
        let rowNumber = 1; // Start from 1 since 0 is header

        for (let i = 1; i < lines.length; i++) {
            rowNumber = i + 1; // +1 because we start from header row
            const line = lines[i].trim();
            
            if (!line) continue; // Skip empty lines
            
            try {
                const user = this.parseUserRow(line, headers, rowNumber);
                
                // Validate user data
                const validationResult = this.validateUserData(user, rowNumber);
                if (validationResult.isValid) {
                    users.push(user);
                } else {
                    errors.push({
                        row: rowNumber,
                        user: user,
                        errors: validationResult.errors,
                        warnings: validationResult.warnings
                    });
                    
                    // Add warnings to warnings array
                    warnings.push(...validationResult.warnings.map(w => ({ row: rowNumber, ...w })));
                }
            } catch (error) {
                errors.push({
                    row: rowNumber,
                    error: error.message,
                    line: line
                });
            }
        }

        // Log comprehensive validation results
        const validationSummary = {
            totalRows: lines.length - 1,
            validUsers: users.length,
            invalidRows: errors.length,
            warnings: warnings.length,
            missingRequiredHeaders: missingRequired,
            missingRecommendedHeaders: missingRecommended,
            availableHeaders: headers
        };

        this.logger.info('CSV parsing completed', validationSummary);

        if (errors.length > 0) {
            const errorDetails = errors.map(e => ({
                row: e.row,
                errors: e.errors || [e.error],
                warnings: e.warnings || []
            }));
            
            this.logger.warn('CSV validation issues found', {
                totalErrors: errors.length,
                errorDetails: errorDetails.slice(0, 10) // Log first 10 errors
            });
        }

        // Show user-friendly summary
        this.showValidationSummary(validationSummary, errors, warnings);

        return {
            users,
            errors,
            warnings,
            totalRows: lines.length - 1,
            validUsers: users.length,
            invalidRows: errors.length,
            headerCount: headers.length,
            availableHeaders: headers
        };
    }

    /**
     * Parse a single CSV line
     * @param {string} line - CSV line to parse
     * @param {string} delimiter - Delimiter character
     * @returns {Array<string>} Array of field values
     */
    parseCSVLine(line, delimiter = ',') {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];
            
            if (char === '"') {
                if (nextChar === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === delimiter && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current);
        return result.map(field => field.trim());
    }

    /**
     * Parse a user row from CSV
     * @param {string} line - CSV line to parse
     * @param {Array<string>} headers - Header row
     * @param {number} rowNumber - Row number for error reporting
     * @returns {Object} Parsed user object
     */
    parseUserRow(line, headers, rowNumber) {
        const values = this.parseCSVLine(line);
        
        if (values.length !== headers.length) {
            throw new Error(`Row ${rowNumber}: Number of columns (${values.length}) doesn't match headers (${headers.length})`);
        }
        
        const user = {};
        
        for (let i = 0; i < headers.length; i++) {
            const header = headers[i].toLowerCase().trim();
            let value = values[i].trim();
            
            // Handle boolean values
            if (header === 'enabled') {
                const valueLower = value.toLowerCase();
                if (valueLower === 'true' || value === '1') {
                    value = true;
                } else if (valueLower === 'false' || value === '0') {
                    value = false;
                } else if (value === '') {
                    value = true; // Default to enabled
                } else {
                    throw new Error(`Row ${rowNumber}: Invalid enabled value '${value}'. Must be true/false or 1/0`);
                }
            }
            
            // Map common header variations
            const mappedHeader = this.getHeaderMapping(header);
            console.log(`[CSV] Mapping header: "${header}" -> "${mappedHeader}"`);
            user[mappedHeader] = value;
        }
        
        // Set default username if not provided
        if (!user.username && user.email) {
            user.username = user.email;
        }
        
        return user;
    }

    /**
     * Validate user data for a specific row
     * @param {Object} user - User object to validate
     * @param {number} rowNumber - Row number for error reporting
     * @returns {Object} Validation result with isValid, errors, and warnings
     */
    validateUserData(user, rowNumber) {
        const errors = [];
        const warnings = [];

        // Check required fields
        if (!user.username || user.username.trim() === '') {
            errors.push('Username is required and cannot be empty');
        }

        // Check recommended fields
        if (!user.firstName || user.firstName.trim() === '') {
            warnings.push('firstName is recommended for better user data');
        }

        if (!user.lastName || user.lastName.trim() === '') {
            warnings.push('lastName is recommended for better user data');
        }

        if (!user.email || user.email.trim() === '') {
            warnings.push('email is recommended for better user data');
        }

        // Validate email format if provided
        if (user.email && user.email.trim() !== '' && !this.isValidEmail(user.email)) {
            errors.push('Invalid email format');
        }

        // Validate username format if provided
        if (user.username && !this.isValidUsername(user.username)) {
            errors.push('Username contains invalid characters (no spaces or special characters allowed)');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Show validation summary to user
     * @param {Object} summary - Validation summary
     * @param {Array} errors - Array of errors
     * @param {Array} warnings - Array of warnings
     */
    showValidationSummary(summary, errors, warnings) {
        let message = '';
        let type = 'success';

        if (summary.invalidRows > 0) {
            type = 'error';
            message = `File validation failed!\n\n`;
            message += `• Total rows: ${summary.totalRows}\n`;
            message += `• Valid users: ${summary.validUsers}\n`;
            message += `• Invalid rows: ${summary.invalidRows}\n`;
            message += `• Warnings: ${warnings.length}\n\n`;
            
            if (summary.missingRequiredHeaders.length > 0) {
                message += `❌ Missing required headers: ${summary.missingRequiredHeaders.join(', ')}\n`;
            }
            
            if (errors.length > 0) {
                message += `❌ Data errors found in ${errors.length} row(s)\n`;
                // Show first few specific errors
                const firstErrors = errors.slice(0, 3);
                firstErrors.forEach(error => {
                    if (error.errors) {
                        message += `  Row ${error.row}: ${error.errors.join(', ')}\n`;
                    } else if (error.error) {
                        message += `  Row ${error.row}: ${error.error}\n`;
                    }
                });
                if (errors.length > 3) {
                    message += `  ... and ${errors.length - 3} more errors\n`;
                }
            }
        } else if (warnings.length > 0) {
            type = 'warning';
            message = `File loaded with warnings:\n\n`;
            message += `• Total rows: ${summary.totalRows}\n`;
            message += `• Valid users: ${summary.validUsers}\n`;
            message += `• Warnings: ${warnings.length}\n\n`;
            
            if (summary.missingRecommendedHeaders.length > 0) {
                message += `⚠️ Missing recommended headers: ${summary.missingRecommendedHeaders.join(', ')}\n`;
            }
            
            // Show first few warnings
            const firstWarnings = warnings.slice(0, 3);
            firstWarnings.forEach(warning => {
                message += `  Row ${warning.row}: ${warning.message || warning}\n`;
            });
            if (warnings.length > 3) {
                message += `  ... and ${warnings.length - 3} more warnings\n`;
            }
        } else {
            message = `File loaded successfully!\n\n`;
            message += `• Total rows: ${summary.totalRows}\n`;
            message += `• Valid users: ${summary.validUsers}\n`;
            message += `• Headers found: ${summary.availableHeaders.join(', ')}`;
        }

        // Show notification to user
        if (window.app && window.app.uiManager) {
            window.app.uiManager.showNotification(message, type);
        }

        // Log to server
        this.logger.info('CSV validation summary shown to user', {
            summary,
            message,
            type
        });
    }

    /**
     * Get header mapping for common variations
     * @param {string} header - Header to map
     * @returns {string} Mapped header name
     */
    getHeaderMapping(header) {
        const headerMap = {
            'firstname': 'firstName',
            'first_name': 'firstName',
            'givenname': 'firstName',
            'given_name': 'firstName',
            'lastname': 'lastName',
            'last_name': 'lastName',
            'familyname': 'lastName',
            'family_name': 'lastName',
            'surname': 'lastName',
            'emailaddress': 'email',
            'email_address': 'email',
            'userid': 'username',
            'user_id': 'username',
            'login': 'username',
            'user': 'username',
            'populationid': 'populationId',
            'population_id': 'populationId',
            'popid': 'populationId',
            'pop_id': 'populationId'
        };
        
        return headerMap[header] || header;
    }

    /**
     * Check if email is valid
     * @param {string} email - Email to validate
     * @returns {boolean} True if valid
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Check if username is valid
     * @param {string} username - Username to validate
     * @returns {boolean} True if valid
     */
    isValidUsername(username) {
        // Username should not contain spaces or special characters
        const usernameRegex = /^[a-zA-Z0-9._-]+$/;
        return usernameRegex.test(username);
    }
    
    // ======================
    // UI Updates
    // ======================
    
    /**
     * Update file info for any file info container element
     * @param {File} file - The file object
     * @param {string} containerId - The ID of the container element to update
     */
    updateFileInfoForElement(file, containerId) {
        const container = document.getElementById(containerId);
        console.log('updateFileInfoForElement called:', { containerId, container: !!container, file: !!file });
        if (!container || !file) {
            console.warn('updateFileInfoForElement: container or file is null', { containerId, hasContainer: !!container, hasFile: !!file });
            return;
        }
        
        const fileSize = this.formatFileSize(file.size);
        const lastModified = new Date(file.lastModified).toLocaleString();
        const fileType = file.type || this.getFileExtension(file.name);
        const fileExtension = this.getFileExtension(file.name);
        
        // Get file path information (if available)
        let filePath = 'Unknown';
        if (file.webkitRelativePath) {
            filePath = file.webkitRelativePath;
        } else if (file.name) {
            // Try to extract directory from file name if it contains path separators
            const pathParts = file.name.split(/[\/\\]/);
            if (pathParts.length > 1) {
                filePath = pathParts.slice(0, -1).join('/');
            } else {
                filePath = 'Current Directory';
            }
        }
        
        // Calculate additional file properties
        const isCSV = fileExtension === 'csv';
        const isText = fileExtension === 'txt';
        const isValidType = isCSV || isText || fileType === 'text/csv' || fileType === 'text/plain';
        const fileSizeInKB = Math.round(file.size / 1024);
        const fileSizeInMB = Math.round((file.size / 1024 / 1024) * 100) / 100;
        
        // Create comprehensive file info display
        const fileInfoHTML = `
            <div class="file-info-details" style="background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 5px; padding: 15px; margin: 10px 0;">
                <div class="file-info-header" style="margin-bottom: 10px;">
                    <h5 style="margin: 0; color: #495057;">
                        <i class="fas fa-file-csv"></i> File Information
                    </h5>
                </div>
                
                <div class="file-info-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.9em;">
                    <div class="file-info-item">
                        <strong style="color: #495057;">📁 Filename:</strong><br>
                        <span style="color: #6c757d; word-break: break-all;">${file.name}</span>
                    </div>
                    
                    <div class="file-info-item">
                        <strong style="color: #495057;">📊 File Size:</strong><br>
                        <span style="color: #6c757d;">${fileSize} (${fileSizeInKB} KB, ${fileSizeInMB} MB)</span>
                    </div>
                    
                    <div class="file-info-item">
                        <strong style="color: #495057;">📂 Directory:</strong><br>
                        <span style="color: #6c757d;">${filePath}</span>
                    </div>
                    
                    <div class="file-info-item">
                        <strong style="color: #495057;">📅 Last Modified:</strong><br>
                        <span style="color: #6c757d;">${lastModified}</span>
                    </div>
                    
                    <div class="file-info-item">
                        <strong style="color: #495057;">🔤 File Type:</strong><br>
                        <span style="color: #6c757d;">${fileType || 'Unknown'}</span>
                    </div>
                    
                    <div class="file-info-item">
                        <strong style="color: #495057;">📄 Extension:</strong><br>
                        <span style="color: ${isValidType ? '#28a745' : '#dc3545'}; font-weight: bold;">
                            ${fileExtension ? '.' + fileExtension : 'None'}
                        </span>
                    </div>
                </div>
                
                <div class="file-info-status" style="margin-top: 10px; padding: 8px; border-radius: 3px; background: ${isValidType ? '#d4edda' : '#f8d7da'}; border: 1px solid ${isValidType ? '#c3e6cb' : '#f5c6cb'};">
                    <i class="fas ${isValidType ? 'fa-check-circle' : 'fa-exclamation-triangle'}" style="color: ${isValidType ? '#155724' : '#721c24'};"></i>
                    <span style="color: ${isValidType ? '#155724' : '#721c24'}; font-weight: bold;">
                        ${isValidType ? 'File type is supported' : 'Warning: File type may not be optimal'}
                    </span>
                </div>
                
                ${file.size > 5 * 1024 * 1024 ? `
                <div class="file-info-warning" style="margin-top: 10px; padding: 8px; border-radius: 3px; background: #fff3cd; border: 1px solid #ffeaa7;">
                    <i class="fas fa-exclamation-triangle" style="color: #856404;"></i>
                    <span style="color: #856404; font-weight: bold;">Large file detected - processing may take longer</span>
                </div>
                ` : ''}
            </div>
        `;
        
        container.innerHTML = fileInfoHTML;
    }

    updateFileInfo(file) {
        this.updateFileInfoForElement(file, 'file-info');
    }
    
    showPreview(rows) {
        if (!this.previewContainer) return;
        
        if (!rows || rows.length === 0) {
            this.previewContainer.innerHTML = '<div class="alert alert-info">No data to display</div>';
                    // Disable import button if no rows
        const importBtnBottom = document.getElementById('start-import-btn-bottom');
        if (importBtnBottom) {
            importBtnBottom.disabled = true;
        }
            return;
        }
        
        const headers = Object.keys(rows[0]);
        const previewRows = rows.slice(0, 5); // Show first 5 rows
        
        let html = `
            <div class="table-responsive">
                <table class="table table-sm table-striped">
                    <thead>
                        <tr>
                            ${headers.map(h => `<th>${h}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${previewRows.map(row => `
                            <tr>
                                ${headers.map(h => `<td>${row[h] || ''}</td>`).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ${rows.length > 5 ? `<small class="text-muted">Showing 5 of ${rows.length} rows</small>` : ''}
            </div>
        `;
        
        this.previewContainer.innerHTML = html;
        
        // Check if population choice has been made
        const hasPopulationChoice = this.checkPopulationChoice();
        
        // Enable import button after showing preview (only if population choice is made)
        const importBtnBottom = document.getElementById('start-import-btn-bottom');
        if (importBtnBottom) {
            importBtnBottom.disabled = !hasPopulationChoice;
            this.logger.log(`Import button ${hasPopulationChoice ? 'enabled' : 'disabled'}`, 'debug');
        } else {
            this.logger.warn('Could not find import button to enable', 'warn');
        }
    }
    
    /**
     * Check if user has made a population choice
     * @returns {boolean} True if a population choice has been made
     */
    checkPopulationChoice() {
        const selectedPopulationId = document.getElementById('import-population-select')?.value || '';
        const useDefaultPopulation = document.getElementById('use-default-population')?.checked || false;
        const useCsvPopulationId = document.getElementById('use-csv-population-id')?.checked || false;
        
        const hasSelectedPopulation = selectedPopulationId && selectedPopulationId.trim() !== '';
        
        return hasSelectedPopulation || useDefaultPopulation || useCsvPopulationId;
    }
    
    // ======================
    // Utility Methods
    // ======================
    
    getFileExtension(filename) {
        if (!filename || typeof filename !== 'string') return '';
        
        // Handle cases where filename might be a path
        const lastDot = filename.lastIndexOf('.');
        const lastSlash = Math.max(
            filename.lastIndexOf('/'),
            filename.lastIndexOf('\\')
        );
        
        // If there's no dot, or the dot is before the last slash, return empty string
        if (lastDot === -1 || lastSlash > lastDot) return '';
        
        // Extract and return the extension (without the dot)
        return filename.slice(lastDot + 1).toLowerCase().trim();
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    generateTemporaryPassword() {
        const length = 16;
        const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]\\:;?><,./-';
        let password = '';
        
        // Ensure at least one of each character type
        password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
        password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
        password += '0123456789'[Math.floor(Math.random() * 10)];
        password += '!@#$%^&*'[Math.floor(Math.random() * 8)];
        
        // Fill the rest of the password
        for (let i = password.length; i < length; i++) {
            password += charset[Math.floor(Math.random() * charset.length)];
        }
        
        // Shuffle the password
        return password.split('').sort(() => Math.random() - 0.5).join('');
    }

    /**
     * Get parsed users for import
     * @returns {Array<Object>} Array of validated user objects
     */
    getParsedUsers() {
        this.logger.info('getParsedUsers called', {
            hasParsedUsers: !!this.parsedUsers,
            parsedUsersType: typeof this.parsedUsers,
            parsedUsersLength: this.parsedUsers ? this.parsedUsers.length : 0,
            hasLastParsedUsers: !!this.lastParsedUsers,
            lastParsedUsersType: typeof this.lastParsedUsers,
            lastParsedUsersLength: this.lastParsedUsers ? this.lastParsedUsers.length : 0
        });
        
        if (!this.parsedUsers || !Array.isArray(this.parsedUsers)) {
            this.logger.warn('No parsed users available');
            return [];
        }
        
        this.logger.info('Retrieving parsed users for import', {
            userCount: this.parsedUsers.length,
            hasUsers: this.parsedUsers.length > 0
        });
        
        return this.parsedUsers;
    }

    /**
     * Get parsing results for debugging
     * @returns {Object|null} Parsing results or null if not available
     */
    getParseResults() {
        return this.parseResults || null;
    }
}

export { FileHandler };
