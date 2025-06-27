class FileHandler {
    constructor(logger, uiManager) {
        this.logger = logger;
        this.uiManager = uiManager;
        this.requiredFields = ['email'];
        this.validationResults = {
            total: 0,
            valid: 0,
            errors: 0,
            warnings: 0
        };
        
        // Store UI elements
        this.fileInput = document.getElementById('csv-file');
        this.fileInfo = document.getElementById('file-info');
        this.previewContainer = document.getElementById('preview-container');
        
        // Load last file info from localStorage
        this.lastFileInfo = this.loadLastFileInfo();
        
        // Initialize file input change handler
        this.initializeFileInput();
    }
    
    /**
     * Load last file info from localStorage
     * @returns {Object|null} Last file info or null if not found
     */
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
     * Save file info to localStorage
     * @param {Object} fileInfo - File info to save
     */
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
    
    /**
     * Clear saved file info
     */
    clearFileInfo() {
        try {
            localStorage.removeItem('lastSelectedFile');
            this.lastFileInfo = null;
        } catch (error) {
            this.logger.error('Error clearing file info:', error);
        }
    }
    
    /**
     * Generate a secure temporary password
     * @returns {string} A randomly generated password
     */
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
        
        // Shuffle the password to make it more random
        return password.split('').sort(() => Math.random() - 0.5).join('');
    }
    
    /**
     * Initialize file input change handler
     */
    initializeFileInput() {
        if (this.fileInput) {
            // Remove any existing event listeners to prevent duplicates
            const newFileInput = this.fileInput.cloneNode(true);
            this.fileInput.parentNode.replaceChild(newFileInput, this.fileInput);
            this.fileInput = newFileInput;
            
            // Add change event listener
            this.fileInput.addEventListener('change', (e) => {
                this.logger.debug('File input changed');
                this.handleFileSelect(e);
            });
            
            this.logger.debug('File input initialized');
        } else {
            this.logger.warn('File input element not found');
        }
    }
    
    /**
     * Handle file selection event
     * @param {Event} event - The file input change event
     */
    handleFileSelect(event) {
        this.logger.debug('Handling file selection');
        
        const fileInput = event.target;
        if (!fileInput.files || fileInput.files.length === 0) {
            this.logger.debug('No file selected');
            this.updateFileInfo(null);
            return;
        }
        
        const file = fileInput.files[0];
        this.logger.debug(`Selected file: ${file.name} (${file.size} bytes)`);
        
        // Save file info and update UI
        this.saveFileInfo(file);
        this.updateFileInfo(file);
        
        // Read the file content
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const content = e.target.result;
                this.logger.debug('File content loaded, first 100 chars:', content.substring(0, 100) + '...');
                
                // Update preview if preview container exists
                if (this.previewContainer) {
                    this.previewContainer.innerHTML = `
                        <div class="preview-header">
                            <h3>File Preview (first 100 characters)</h3>
                        </div>
                        <div class="preview-content">
                            <pre>${content.substring(0, 100)}</pre>
                        </div>
                    `;
                }
                
                // Trigger the file selected event on the window
                const fileSelectedEvent = new CustomEvent('fileSelected', { 
                    detail: { file, content } 
                });
                window.dispatchEvent(fileSelectedEvent);
                
            } catch (error) {
                this.logger.error('Error processing file content:', error);
                this.uiManager.showError('Error processing file: ' + error.message);
            }
        };
        
        reader.onerror = (error) => {
            this.logger.error('Error reading file:', error);
            this.uiManager.showError('Error reading file: ' + error.message);
            this.updateFileInfo(null);
        };
        
        // Read the file as text
        reader.readAsText(file);
    }
    
    /**
     * Check if file matches the last saved file info
     * @param {File} file - File to check
     * @returns {boolean} True if file matches last saved info
     */
    isSameFile(file) {
        if (!this.lastFileInfo) return false;
        return (
            file.name === this.lastFileInfo.name &&
            file.size === this.lastFileInfo.size &&
            file.lastModified === this.lastFileInfo.lastModified &&
            file.type === this.lastFileInfo.type
        );
    }

    /**
     * Format file size in human-readable format
     * @param {number} bytes - File size in bytes
     * @returns {string} Formatted file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Format date in a readable format
     * @param {number} timestamp - Timestamp in milliseconds
     * @returns {string} Formatted date string
     */
    formatDate(timestamp) {
        return new Date(timestamp).toLocaleString();
    }

    /**
     * Update file information in the UI
     * @param {File} file - The selected file
     */
    updateFileInfo(file) {
        this.logger.debug('Updating file info for:', file ? file.name : 'no file');
        
        if (!file) {
            if (this.fileInfo) {
                this.fileInfo.innerHTML = '';
            }
            return;
        }
        
        if (!this.fileInfo) {
            this.logger.warn('File info element not found');
            return;
        }
        
        const fileInfoHtml = `
            <div class="file-details">
                <div class="file-name"><i class="fas fa-file"></i> ${file.name}</div>
                <div class="file-meta">
                    <span><i class="fas fa-database"></i> ${this.formatFileSize(file.size)}</span>
                    <span><i class="far fa-clock"></i> ${this.formatDate(file.lastModified)}</span>
                    <span><i class="fas fa-table"></i> ${file.type || 'text/csv'}</span>
                </div>
            </div>
        `;
        
        this.fileInfo.innerHTML = fileInfoHtml;
        this.logger.debug('File info updated in UI');
    }

    /**
     * Show preview of the CSV data
     * @param {Array} data - Parsed CSV data
     */
    showPreview(data) {
        if (!this.uiManager.previewContainer) return;
        
        if (!data || data.length === 0) {
            this.uiManager.previewContainer.innerHTML = '<div class="no-data">No data to display</div>';
            return;
        }

        // Limit to first 10 rows for preview
        const previewData = data.slice(0, 10);
        const headers = Object.keys(previewData[0] || {});
        
        let tableHtml = `
            <div class="table-container">
                <table class="preview-table">
                    <thead>
                        <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
                    </thead>
                    <tbody>
                        ${previewData.map(row => `
                            <tr>${headers.map(h => `<td>${row[h] || ''}</td>`).join('')}</tr>
                        `).join('')}
                    </tbody>
                </table>
                ${data.length > 10 ? 
                    `<div class="preview-footer">Showing 10 of ${data.length} rows</div>` : 
                    `<div class="preview-footer">${data.length} rows</div>`
                }
            </div>
        `;
        
        this.uiManager.previewContainer.innerHTML = tableHtml;
    }

    /**
     * Process a CSV file and return headers and rows
     * @param {File} file - The CSV file to process
     * @returns {Promise<{headers: Array<string>, rows: Array<Object>}>} - Processed data
     */
    /**
     * Process a CSV file and return headers and rows
     * @param {File} file - The CSV file to process
     * @returns {Promise<{headers: Array<string>, rows: Array<Object>}>} - Processed data
     */
    async processCSV(file) {
        this.logger.log(`Processing file: ${file.name}`, 'info');
        
        // Save file info for persistence
        this.saveFileInfo(file);
        
        // Update UI with file info
        this.updateFileInfo(file);
        
        // Show loading state for preview
        if (this.uiManager.previewContainer) {
            this.uiManager.previewContainer.innerHTML = `
                <div class="loading">
                    <div class="spinner"></div>
                    <div>Processing file...</div>
                </div>`;
        }
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (event) => {
                try {
                    const text = event.target.result;
                    const lines = text.split('\n').filter(line => line.trim() !== '');
                    
                    if (lines.length < 2) {
                        throw new Error('CSV file must contain at least one data row');
                    }
                    
                    // Parse headers and normalize them
                    const headers = this.parseCSVLine(lines[0]).map(h => h.trim());
                    
                    // Define required fields and their aliases
                    const fieldMapping = {
                        'username': 'username',
                        'email': 'email',
                        'firstname': 'firstName',
                        'first name': 'firstName',
                        'first_name': 'firstName',
                        'lastname': 'lastName',
                        'last name': 'lastName',
                        'last_name': 'lastName',
                        'password': 'password',
                        'active': 'active',
                        'enabled': 'active'
                    };
                    
                    // Normalize headers
                    const normalizedHeaders = headers.map(header => {
                        const lowerHeader = header.toLowerCase();
                        return fieldMapping[lowerHeader] || header;
                    });
                    
                    // Check if email column exists
                    if (!normalizedHeaders.includes('email')) {
                        throw new Error('CSV must contain an "email" column');
                    }
                    
                    // Parse data rows
                    const rows = [];
                    let lineNumber = 1; // Start from 1 to account for header row
                    let validRows = 0;
                    
                    for (let i = 1; i < lines.length; i++) {
                        try {
                            const values = this.parseCSVLine(lines[i]);
                            if (values.length !== headers.length) {
                                this.logger.warn(`Skipping row ${lineNumber}: Column count doesn't match headers`);
                                lineNumber++;
                                continue;
                            }
                            
                            const row = {};
                            
                            // Map values to normalized headers
                            normalizedHeaders.forEach((header, index) => {
                                if (values[index] !== undefined) {
                                    let value = values[index] ? values[index].trim() : '';
                                    
                                    // Convert string 'true'/'false' to boolean for active field
                                    if (header === 'active') {
                                        value = value.toLowerCase() === 'true';
                                    }
                                    
                                    row[header] = value;
                                }
                            });
                            
                            // Skip rows without email (required field)
                            if (!row.email || row.email.trim() === '') {
                                this.logger.warn(`Skipping row ${lineNumber}: Missing email address`);
                                lineNumber++;
                                continue;
                            }
                            
                            // Validate required fields for PingOne
                            const requiredFields = ['email', 'username'];
                            const missingFields = requiredFields.filter(field => !row[field]);
                            
                            if (missingFields.length > 0) {
                                this.logger.warn(`Skipping row ${lineNumber}: Missing required fields - ${missingFields.join(', ')}`);
                                lineNumber++;
                                continue;
                            }
                            
                            // Set default password if not provided (PingOne requires a password)
                            if (!row.password) {
                                row.password = this.generateTemporaryPassword();
                                this.logger.log(`Generated temporary password for user: ${row.username || row.email}`, 'info');
                            }
                            
                            // Set default active status if not provided
                            if (row.active === undefined) {
                                row.active = true;
                            }
                            
                            // Format user data for PingOne API
                            const userData = {
                                username: row.username,
                                email: row.email,
                                name: {
                                    given: row.firstName || '',
                                    family: row.lastName || ''
                                },
                                password: row.password,
                                enabled: row.active !== false // Default to true if not specified
                            };
                            
                            // Add to valid rows
                            rows.push(userData);
                            validRows++;
                        } catch (error) {
                            this.logger.warn(`Error parsing line ${lineNumber}: ${error.message}`);
                        } finally {
                            lineNumber++;
                        }
                    }
                    
                    if (validRows === 0) {
                        throw new Error('No valid user records found in the file');
                    }
                    
                    this.logger.log(`Successfully processed ${validRows} valid users from ${file.name}`, 'success');
                    
                    resolve({
                        headers,
                        rows
                    });
                } catch (error) {
                    // Clear saved file info on error
                    this.clearFileInfo();
                    reject(error);
                }
            };
            
            reader.onerror = (error) => {
                // Clear saved file info on error
                this.clearFileInfo();
                reject(new Error(`Error reading file: ${error.message}`));
            };
            
            reader.readAsText(file);
        });
    }
    
    /**
     * Parse a single CSV line, handling quoted values and different delimiters
     * @param {string} line - CSV line to parse
     * @param {string} [delimiter=','] - Field delimiter (defaults to comma)
     * @returns {Array<string>} Array of values
     */
    parseCSVLine(line, delimiter = ',') {
        const values = [];
        let inQuotes = false;
        let currentValue = '';
        let i = 0;
        
        // Skip empty lines
        if (!line || line.trim() === '') {
            return [];
        }
        
        // Check if the line might be tab-delimited (if no delimiter specified)
        if (delimiter === ',' && line.includes('\t') && !line.includes(',')) {
            delimiter = '\t';
        }
        
        while (i < line.length) {
            const char = line[i];
            
            if (char === '"') {
                // Handle quoted values
                if (inQuotes && line[i + 1] === '"') {
                    // Escaped quote inside quoted value
                    currentValue += '"';
                    i += 2;
                } else {
                    inQuotes = !inQuotes;
                    i++;
                }
            } else if (char === delimiter && !inQuotes) {
                // End of field
                values.push(currentValue);
                currentValue = '';
                i++;
            } else {
                currentValue += char;
                i++;
            }
        }
        
        // Add the last value
        values.push(currentValue);
        
        // Clean up values (remove quotes and trim)
        return values.map(value => {
            // Remove surrounding quotes if they exist
            let cleaned = value.trim();
            if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || 
                (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
                cleaned = cleaned.substring(1, cleaned.length - 1);
            }
            // Replace escaped quotes
            return cleaned.replace(/""/g, '"');
        });
    }
    
    /**
     * Validate a user object against required fields and data formats
     * @param {Object} user - The user object to validate
     * @param {Array} headers - The CSV headers
     * @returns {Object} Validation result with validity and errors
     */
    validateUser(user, headers) {
        const errors = [];
        const warnings = [];
        
        // Skip validation if email is missing (handled in processCSV)
        if (!user.email || user.email.trim() === '') {
            return { valid: false, errors: ['Email is required'], warnings: [] };
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(user.email)) {
            errors.push(`Invalid email format: ${user.email}`);
        }
        
        // Check for duplicate fields
        const fieldCounts = {};
        headers.forEach(header => {
            if (!fieldCounts[header]) {
                fieldCounts[header] = 0;
            }
            fieldCounts[header]++;
        });
        
        Object.entries(fieldCounts).forEach(([header, count]) => {
            if (count > 1) {
                warnings.push(`Duplicate column '${header}' found in CSV`);
            }
        });
        
        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
    
    /**
     * Process a CSV file with validation and detailed reporting
     * @param {File} file - The CSV file to process
     * @returns {Promise<{headers: Array<string>, rows: Array<Object>, validation: Object}>} - Processed and validated data
     */
    async processCSV(file) {
        this.validationResults = {
            total: 0,
            valid: 0,
            errors: 0,
            warnings: 0,
            details: []
        };
        
        if (!file) {
            throw new Error('No file provided');
        }

        this.logger.log(`Processing file: ${file.name} (${this.formatFileSize(file.size)})`, 'info');
        this.uiManager.showLoading(true, 'Reading file...');

        try {
            // Read the file as text
            const text = await this.readFileAsText(file);
            
            // Parse CSV text to JSON
            const { headers, rows } = this.parseCSV(text);
            this.validationResults.total = rows.length;
            
            this.logger.log(`Successfully parsed ${rows.length} rows with ${headers.length} columns`, 'success');
            
            // Validate each row
            rows.forEach((row, index) => {
                const validation = this.validateUser(row, headers);
                const rowNum = index + 2; // +2 because of 1-based index and header row
                
                if (validation.valid) {
                    this.validationResults.valid++;
                    this.logger.log(`✓ Row ${rowNum}: Valid user data`, 'success');
                } else {
                    this.validationResults.errors++;
                    this.logger.error(`✗ Row ${rowNum}: ${validation.errors.join('; ')}`);
                }
                
                if (validation.warnings.length > 0) {
                    this.validationResults.warnings += validation.warnings.length;
                    validation.warnings.forEach(warning => {
                        this.logger.warn(`! Row ${rowNum}: ${warning}`);
                    });
                }
                
                // Store validation details
                this.validationResults.details.push({
                    row: rowNum,
                    valid: validation.valid,
                    errors: validation.errors,
                    warnings: validation.warnings,
                    data: row
                });
            });
            
            // Log summary
            this.logger.log('\n=== Validation Complete ===', 'info');
            this.logger.log(`Total rows: ${this.validationResults.total}`, 'info');
            this.logger.log(`Valid rows: ${this.validationResults.valid}`, this.validationResults.valid === this.validationResults.total ? 'success' : 'info');
            
            if (this.validationResults.errors > 0) {
                this.logger.error(`Rows with errors: ${this.validationResults.errors}`);
            }
            
            if (this.validationResults.warnings > 0) {
                this.logger.warn(`Total warnings: ${this.validationResults.warnings}`);
            }
            
            return { 
                headers, 
                rows,
                validation: this.validationResults
            };
            
        } catch (error) {
            this.logger.error(`Error processing CSV: ${error.message}`);
            throw error;
        } finally {
            this.uiManager.showLoading(false);
        }
    }

    /**
     * Read a file as text
     * @param {File} file - The file to read
     * @returns {Promise<string>} - The file contents as text
     */
    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (event) => {
                resolve(event.target.result);
            };
            
            reader.onerror = (error) => {
                reject(new Error(`Error reading file: ${error.message}`));
            };
            
            reader.readAsText(file);
        });
    }

    /**
     * Parse CSV text into headers and rows
     * @param {string} csvText - The CSV text to parse
     * @returns {{headers: Array<string>, rows: Array<Object>}} - Parsed data
     */
    parseCSV(csvText) {
        // Split into lines and filter out empty lines
        const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
        
        if (lines.length === 0) {
            throw new Error('CSV file is empty');
        }

        // Parse headers (first line)
        const headers = this.parseCSVLine(lines[0]);
        
        // Parse data rows
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            const row = {};
            
            // Map values to headers
            headers.forEach((header, index) => {
                row[header] = values[index] || '';
            });
            
            rows.push(row);
        }
        
        return { headers, rows };
    }

    /**
     * Parse a single CSV line, handling quoted values and commas within quotes
     * @param {string} line - The CSV line to parse
     * @returns {Array<string>} - Array of values
     */
    parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;
        let escapeNext = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (escapeNext) {
                current += char;
                escapeNext = false;
                continue;
            }
            
            if (char === '\\') {
                escapeNext = true;
                continue;
            }
            
            if (char === '"') {
                if (i + 1 < line.length && line[i + 1] === '"' && inQuotes) {
                    // Handle escaped quote inside quoted field
                    current += '"';
                    i++; // Skip the next quote
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        // Add the last value
        values.push(current);
        
        // Trim whitespace from non-quoted values
        return values.map((val, index) => {
            // Only trim if the value wasn't quoted (doesn't start with a quote)
            if (val.length > 0 && val[0] !== '"') {
                return val.trim();
            }
            return val;
        });
    }

    /**
     * Format file size in human-readable format
     * @param {number} bytes - File size in bytes
     * @returns {string} - Formatted file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Validate CSV structure before import
     * @param {Array<string>} headers - CSV headers
     * @param {Array<Object>} rows - CSV rows
     * @returns {{valid: boolean, errors: Array<string>}} - Validation result
     */
    validateCSV(headers, rows) {
        const errors = [];
        
        // Check for required columns (customize based on your requirements)
        const requiredColumns = ['email', 'givenName', 'surname'];
        const missingColumns = requiredColumns.filter(col => !headers.includes(col));
        
        if (missingColumns.length > 0) {
            errors.push(`Missing required columns: ${missingColumns.join(', ')}`);
        }
        
        // Validate each row
        rows.forEach((row, index) => {
            // Check for required fields
            requiredColumns.forEach(col => {
                if (!row[col] || row[col].trim() === '') {
                    errors.push(`Row ${index + 2}: Missing required value for '${col}'`);
                }
            });
            
            // Validate email format if email column exists
            if (row.email && !this.isValidEmail(row.email)) {
                errors.push(`Row ${index + 2}: Invalid email format '${row.email}'`);
            }
        });
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
    
    /**
     * Simple email validation
     * @param {string} email - Email to validate
     * @returns {boolean} - True if email is valid
     */
    isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(String(email).toLowerCase());
    }
    
    /**
     * Get file extension from filename
     * @param {string} filename - The filename to get extension from
     * @returns {string} The file extension (without dot) or empty string if no extension
     */
    /**
     * Get the file extension from a filename
     * @param {string} filename - The filename to get the extension from
     * @returns {string} The file extension (without dot) or empty string if no extension
     */
    getFileExtension(filename) {
        if (!filename || typeof filename !== 'string') return '';
        const parts = filename.split('.');
        return parts.length > 1 ? parts.pop().toLowerCase() : '';
    }
}

// Export the FileHandler class
module.exports = { FileHandler };
