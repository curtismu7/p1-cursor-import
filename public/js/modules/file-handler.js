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
    
    handleFileSelect(event) {
        try {
            const fileInput = event.target;
            if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
                this.logger.error('No file selected or invalid file input');
                return;
            }
            
            const file = fileInput.files[0];
            this.logger.log(`Handling file selection: ${file.name} (${file.size} bytes)`, 'debug');
            
            // Update file info in UI first
            this.saveFileInfo(file);
            this.updateFileInfo(file);
            
            this.processCSV(file)
                .then(({ headers, rows }) => {
                    this.lastParsedUsers = rows;
                    this.showPreview(rows);
                    this.logger.log(`Successfully processed ${rows.length} users from ${file.name}`, 'success');
                })
                .catch(error => {
                    this.logger.error(`Error processing file: ${error.message}`, 'error', error);
                    this.clearFileInfo();
                    // Reset the file input to allow re-upload
                    if (this.fileInput) {
                        this.fileInput.value = '';
                    }
                });
        } catch (error) {
            this.logger.error('Unexpected error in handleFileSelect:', 'error', error);
            this.clearFileInfo();
            if (this.fileInput) {
                this.fileInput.value = '';
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
        
        // Check file type
        const fileName = file.name || '';
        const fileExt = this.getFileExtension(fileName).toLowerCase();
        const fileType = file.type || '';
        
        this.logger.log(`File info - Name: ${fileName}, Extension: ${fileExt}, Type: ${fileType}`, 'debug');
        
        // Check if file has a valid extension or is a text file
        const isValidExtension = fileExt && ['csv', 'txt'].includes(fileExt);
        const isTextFile = fileType.match(/text\/.*/) || fileType === ''; // Some browsers might not set type for CSV
        
        if (!isValidExtension && !isTextFile) {
            const errorMsg = `Unsupported file type: ${fileExt || 'unknown'}. Please upload a CSV or text file.`;
            this.logger.error(errorMsg, { fileName, fileExt, fileType });
            throw new Error(errorMsg);
        }
        
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
            // Disable import button if no rows
            const importBtn = document.getElementById('start-import-btn');
            if (importBtn) {
                importBtn.disabled = true;
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
        
        // Enable import button after showing preview
        const importBtn = document.getElementById('start-import-btn');
        if (importBtn) {
            importBtn.disabled = false;
            this.logger.log('Import button enabled', 'debug');
        } else {
            this.logger.warn('Could not find import button to enable', 'warn');
        }
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
}

export { FileHandler };
