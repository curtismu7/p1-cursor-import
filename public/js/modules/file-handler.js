class FileHandler {
    constructor(logger, uiManager) {
        this.logger = logger;
        this.uiManager = uiManager;
        this.requiredFields = ['username'];
        this.validationResults = {
            total: 0,
            valid: 0,
            errors: 0,
            warnings: 0
        };
        this.lastParsedUsers = [];
        this.currentFile = null;
        
        // Initialize UI elements
        this.fileInput = document.getElementById('csv-file');
        this.fileInfo = document.getElementById('file-info');
        this.previewContainer = document.getElementById('preview-container');
        
        // Load last file info from localStorage
        this.lastFileInfo = this.loadLastFileInfo();
        
        // Initialize event listeners
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
     * @returns {File|null} The current file or null if none
     */
    getCurrentFile() {
        return this.currentFile;
    }
    
    /**
     * Get the list of parsed users
     * @returns {Array} Array of user objects
     */
    getUsers() {
        return this.lastParsedUsers || [];
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
        await this._handleFileInternal(file, event);
    }

    /**
     * Shared internal file handling logic
     * @param {File} file
     * @param {Event} [event]
     * @private
     */
    async _handleFileInternal(file, event) {
        // Debug: Log the file object structure
        this.logger.debug('File object received:', {
            hasFile: !!file,
            fileType: typeof file,
            hasName: !!file.name,
            hasSize: !!file.size,
            fileName: file.name,
            fileSize: file.size
        });

        // Validate file has required properties
        if (!file.name) {
            this.logger.error('File object missing name property', { file });
            this.uiManager.showNotification('Invalid file object: missing file name', 'error');
            return;
        }

        // Permissive file type validation: only block known bad extensions
        const knownBadExtensions = ['.exe', '.js', '.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.tar', '.gz'];
        const fileNameLower = file.name.toLowerCase();
        const hasBadExtension = knownBadExtensions.some(ext => fileNameLower.endsWith(ext));
        if (hasBadExtension) {
            this.logger.error('Invalid file type. Please select a CSV or text file.');
            this.uiManager.showNotification('Please select a CSV or text file.', 'error');
            return;
        }
        // Warn if not .csv/.txt, but allow
        const allowedExtensions = ['.csv', '.txt', ''];
        const hasAllowedExtension = allowedExtensions.some(ext => fileNameLower.endsWith(ext));
        if (!hasAllowedExtension) {
            this.logger.warn('File does not have a standard CSV or text extension, attempting to process anyway.', { fileName: file.name });
        }

        // Validate file size (max 10MB)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            this.logger.error('File too large. Maximum size is 10MB.');
            this.uiManager.showNotification('File too large. Maximum size is 10MB.', 'error');
            return;
        }

        try {
            this.logger.info('Processing CSV file', {
                fileName: file.name,
                fileSize: file.size,
                lastModified: file.lastModified
            });
            console.log('About to parse CSV file', file);

            // Show loading state
            this.uiManager.showNotification('Processing CSV file...', 'info');

            // Parse CSV file with robust validation
            const parseResults = await this.parseCSVFile(file);
            console.log('CSV parsing completed', parseResults);
            
            this.logger.info('CSV parsing completed', {
                totalRows: parseResults.totalRows,
                validUsers: parseResults.validUsers,
                invalidUsers: parseResults.invalidUsers,
                errorCount: parseResults.errors.length,
                headers: parseResults.headers
            });

            // Store the parsed results
            this.currentFile = file;
            this.parsedUsers = parseResults.users;
            this.lastParsedUsers = parseResults.users; // Also store in lastParsedUsers for compatibility
            this.parseResults = parseResults;

            // Show results to user
            let message = `CSV file processed successfully! Found ${parseResults.validUsers} valid users.`;
            
            if (parseResults.invalidUsers > 0) {
                message += ` ${parseResults.invalidUsers} users had validation errors and will be skipped.`;
            }
            
            if (parseResults.errors.length > 0) {
                message += ` ${parseResults.errors.length} rows had parsing errors.`;
            }

            this.uiManager.showNotification(message, parseResults.invalidUsers > 0 ? 'warning' : 'success');

            // Update UI with file info
            this.uiManager.updateFileInfo({
                fileName: file.name,
                totalRows: parseResults.totalRows,
                validUsers: parseResults.validUsers,
                invalidUsers: parseResults.invalidUsers,
                errorCount: parseResults.errors.length,
                sample: parseResults.sample
            });

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
    
    async processCSV(file) {
        // Log file object for debugging
        this.logger.log('Processing file object:', 'debug', file);
        
        // Validate file
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
                    
                    const { headers, rows } = this.parseCSV(text);
                    
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
    // CSV Parsing
    // ======================
    
    parseCSV(text) {
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length < 2) {
            throw new Error('CSV must contain at least a header row and one data row');
        }
        
        const headers = this.parseCSVLine(lines[0]);
        const rows = [];
        
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            const row = {};
            
            headers.forEach((header, index) => {
                row[header] = values[index] || '';
            });
            
            rows.push(row);
        }
        
        return { headers, rows };
    }
    
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
     * Parse CSV file and extract users
     * @param {File} file - CSV file to parse
     * @returns {Promise<Object>} Parsed users with validation results
     */
    async parseCSVFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (event) => {
                try {
                    const csvContent = event.target.result;
                    const lines = csvContent.split('\n').filter(line => line.trim());
                    
                    if (lines.length < 2) {
                        reject(new Error('CSV file must contain at least a header row and one data row'));
                        return;
                    }
                    
                    // Parse header row
                    const headers = this.parseCSVRow(lines[0]);
                    const requiredHeaders = ['username'];
                    const missingHeaders = requiredHeaders.filter(header => 
                        !headers.some(h => h.toLowerCase() === header.toLowerCase())
                    );
                    
                    if (missingHeaders.length > 0) {
                        reject(new Error(`Missing required headers: ${missingHeaders.join(', ')}. Required headers are: ${requiredHeaders.join(', ')}`));
                        return;
                    }
                    
                    // Parse data rows
                    const users = [];
                    const errors = [];
                    
                    for (let i = 1; i < lines.length; i++) {
                        try {
                            const user = this.parseUserRow(lines[i], headers, i + 1);
                            if (user) {
                                users.push(user);
                            }
                        } catch (error) {
                            errors.push({
                                row: i + 1,
                                error: error.message,
                                line: lines[i]
                            });
                        }
                    }
                    
                    // Validate parsed users
                    const validationResults = this.validateParsedUsers(users);
                    
                    resolve({
                        users: validationResults.validUsers,
                        totalRows: lines.length - 1,
                        validUsers: validationResults.validUsers.length,
                        invalidUsers: validationResults.invalidUsers.length,
                        errors: [...errors, ...validationResults.errors],
                        headers: headers,
                        sample: users.slice(0, 5) // First 5 users for preview
                    });
                    
                } catch (error) {
                    reject(new Error(`Failed to parse CSV file: ${error.message}`));
                }
            };
            
            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };
            
            reader.readAsText(file);
        });
    }

    /**
     * Parse a single CSV row
     * @param {string} line - CSV line to parse
     * @returns {Array<string>} Array of header values
     * @private
     */
    parseCSVRow(line) {
        // Handle quoted fields and commas within quotes
        const headers = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                headers.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        // Add the last field
        headers.push(current.trim());
        
        return headers;
    }

    /**
     * Parse a user row from CSV
     * @param {string} line - CSV line to parse
     * @param {Array<string>} headers - Header row
     * @param {number} rowNumber - Row number for error reporting
     * @returns {Object|null} Parsed user object or null if invalid
     * @private
     */
    parseUserRow(line, headers, rowNumber) {
        if (!line.trim()) {
            return null; // Skip empty lines
        }
        
        const values = this.parseCSVRow(line);
        
        if (values.length !== headers.length) {
            throw new Error(`Row ${rowNumber}: Number of columns (${values.length}) doesn't match headers (${headers.length})`);
        }
        
        const user = {};
        
        for (let i = 0; i < headers.length; i++) {
            const header = headers[i].toLowerCase().trim();
            let value = values[i].trim();
            
            // Handle boolean values
            if (header === 'enabled') {
                if (value === 'true' || value === '1') {
                    value = true;
                } else if (value === 'false' || value === '0') {
                    value = false;
                } else if (value === '') {
                    value = true; // Default to enabled
                } else {
                    throw new Error(`Row ${rowNumber}: Invalid enabled value '${value}'. Must be true/false or 1/0`);
                }
            }
            
            // Map common header variations
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
            
            const mappedHeader = headerMap[header] || header;
            user[mappedHeader] = value;
        }
        
        // Validate required fields
        if (!user.username) {
            throw new Error(`Row ${rowNumber}: User must have a username`);
        }
        
        // Set default username if not provided
        if (!user.username && user.email) {
            user.username = user.email;
        }
        
        return user;
    }

    /**
     * Validate parsed users
     * @param {Array<Object>} users - Users to validate
     * @returns {Object} Validation results
     * @private
     */
    validateParsedUsers(users) {
        const validUsers = [];
        const invalidUsers = [];
        const errors = [];
        const seenEmails = new Set();
        const seenUsernames = new Set();
        
        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            const rowNumber = i + 1;
            let isValid = true;
            let errorMessage = '';
            
            // Check for duplicate emails
            if (user.email) {
                if (seenEmails.has(user.email.toLowerCase())) {
                    errorMessage = `Duplicate email '${user.email}' found in row ${rowNumber}`;
                    isValid = false;
                } else {
                    seenEmails.add(user.email.toLowerCase());
                }
                
                // Validate email format
                if (!this.isValidEmail(user.email)) {
                    errorMessage = `Invalid email format '${user.email}' in row ${rowNumber}`;
                    isValid = false;
                }
            }
            
            // Check for duplicate usernames
            if (user.username) {
                if (seenUsernames.has(user.username.toLowerCase())) {
                    errorMessage = `Duplicate username '${user.username}' found in row ${rowNumber}`;
                    isValid = false;
                } else {
                    seenUsernames.add(user.username.toLowerCase());
                }
                
                // Validate username format
                if (!this.isValidUsername(user.username)) {
                    errorMessage = `Invalid username format '${user.username}' in row ${rowNumber} (no spaces or special characters)`;
                    isValid = false;
                }
            }
            
            if (isValid) {
                validUsers.push(user);
            } else {
                invalidUsers.push(user);
                errors.push({
                    row: rowNumber,
                    user: user.email || user.username || `Row ${rowNumber}`,
                    error: errorMessage
                });
            }
        }
        
        return {
            validUsers,
            invalidUsers,
            errors
        };
    }

    /**
     * Check if email is valid
     * @param {string} email - Email to validate
     * @returns {boolean} True if valid
     * @private
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Check if username is valid
     * @param {string} username - Username to validate
     * @returns {boolean} True if valid
     * @private
     */
    isValidUsername(username) {
        // Username should not contain spaces or special characters
        const usernameRegex = /^[a-zA-Z0-9._-]+$/;
        return usernameRegex.test(username);
    }
    
    // ======================
    // UI Updates
    // ======================
    
    updateFileInfo(file) {
        if (!this.fileInfo) return;
        
        const fileSize = this.formatFileSize(file.size);
        const lastModified = new Date(file.lastModified).toLocaleString();
        
        this.fileInfo.innerHTML = `
            <strong>${file.name}</strong><br>
            <small>Size: ${fileSize} | Modified: ${lastModified}</small>
        `;
    }
    
    showPreview(rows) {
        if (!this.previewContainer) return;
        
        if (!rows || rows.length === 0) {
            this.previewContainer.innerHTML = '<div class="alert alert-info">No data to display</div>';
            // Disable import buttons if no rows
            const importBtn = document.getElementById('start-import-btn');
            const importBtnBottom = document.getElementById('start-import-btn-bottom');
            if (importBtn) {
                importBtn.disabled = true;
            }
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
        
        // Enable import buttons after showing preview (only if population choice is made)
        const importBtn = document.getElementById('start-import-btn');
        const importBtnBottom = document.getElementById('start-import-btn-bottom');
        if (importBtn) {
            importBtn.disabled = !hasPopulationChoice;
            this.logger.log(`Import button ${hasPopulationChoice ? 'enabled' : 'disabled'}`, 'debug');
        } else {
            this.logger.warn('Could not find import button to enable', 'warn');
        }
        if (importBtnBottom) {
            importBtnBottom.disabled = !hasPopulationChoice;
            this.logger.log(`Bottom import button ${hasPopulationChoice ? 'enabled' : 'disabled'}`, 'debug');
        } else {
            this.logger.warn('Could not find bottom import button to enable', 'warn');
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
