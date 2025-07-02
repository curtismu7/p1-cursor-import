export class UIManager {
    constructor(logger) {
        this.logger = logger;
        this.currentView = 'import';
        // Initialize UI elements
        this.views = {
            'import': document.getElementById('import-view'),
            'settings': document.getElementById('settings-view'),
            'logs': document.getElementById('logs-view')
        };
        // Navigation elements
        this.navItems = document.querySelectorAll('.nav-item');
        // Logs view elements
        this.logsView = this.views.logs;
        // Connection status element
        this.connectionStatusElement = document.getElementById('connection-status');

        // Attach navigation click listeners
        this.navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const view = item.getAttribute('data-view');
                if (view) {
                    this.showView(view);
                }
            });
        });
    }

    /**
     * Switch between different views
     * @param {string} viewName - The name of the view to switch to ('import', 'settings', 'logs')
     */
    /**
     * Show a specific view (alias for switchView with async/await support)
     * @param {string} viewName - The name of the view to show
     * @returns {Promise<boolean>} True if view was shown successfully
     * @throws {Error} If view is not found
     */
    async showView(viewName) {
        // Hide all views and remove 'active'
        Object.entries(this.views).forEach(([name, element]) => {
            if (element) {
                element.style.display = 'none';
                element.classList.remove('active');
            }
            const navItem = document.querySelector(`[data-view="${name}"]`);
            if (navItem) navItem.classList.remove('active');
        });
        // Show the selected view
        const viewElement = this.views[viewName];
        if (viewElement) {
            viewElement.style.display = 'block';
            viewElement.classList.add('active');
            this.currentView = viewName;
            const navItem = document.querySelector(`[data-view="${viewName}"]`);
            if (navItem) navItem.classList.add('active');
            // Special handling for logs/settings
            switch(viewName) {
                case 'logs':
                    await this.loadAndDisplayLogs();
                    this.scrollLogsToBottom();
                    break;
                case 'settings':
                    // Load settings when the settings view is shown
                    if (window.app && typeof window.app.checkSettingsAndRestore === 'function') {
                        window.app.checkSettingsAndRestore();
                    }
                    const currentStatus = this.connectionStatusElement?.classList.contains('status-connected') ? 'connected' : 'disconnected';
                    const currentMessage = this.connectionStatusElement?.querySelector('.status-message')?.textContent || '';
                    this.updateSettingsConnectionStatus(currentStatus, currentMessage);
                    break;
            }
            return true;
        } else {
            console.warn(`View '${viewName}' not found`);
            return false;
        }
    }
    
    /**
     * Switch between different views
     * @param {string} viewName - The name of the view to switch to ('import', 'settings', 'logs')
     */
    switchView(viewName) {
        // Convert view name to lowercase for case-insensitive comparison
        const normalizedViewName = viewName.toLowerCase();
        const viewElement = this.views[normalizedViewName];
        
        if (!viewElement) {
            console.error(`View '${viewName}' not found`);
            throw new Error(`View '${viewName}' not found`);
        }

        // Hide all views
        Object.entries(this.views).forEach(([name, element]) => {
            if (element) {
                element.style.display = 'none';
                element.classList.remove('active');
            }
            // Update nav items
            const navItem = document.querySelector(`[data-view="${name}"]`);
            if (navItem) {
                navItem.classList.remove('active');
            }
        });

        // Show the selected view
        viewElement.style.display = 'block';
        viewElement.classList.add('active');
        this.currentView = normalizedViewName;

        // Update active state of nav item
        const activeNavItem = document.querySelector(`[data-view="${normalizedViewName}"]`);
        if (activeNavItem) {
            activeNavItem.classList.add('active');
        }
        // Save current view to localStorage for persistence
        try {
            localStorage.setItem('currentView', normalizedViewName);
        } catch (e) {}
        this.logger.debug(`Switched to ${viewName} view`);
        return true;
    }

    /**
     * Update the connection status display
     * @param {string} status - The connection status ('connected', 'disconnected', 'error')
     * @param {string} message - The status message to display
     * @param {boolean} [updateSettingsStatus=true] - Whether to also update the settings page status
     */
    updateConnectionStatus(status, message, updateSettingsStatus = true) {
        console.log(`Updating connection status: ${status} - ${message}`);
        
        // Update main status
        this._updateStatusElement('connection-status', status, message);
        
        // Also update settings status if we're on the settings page
        if (updateSettingsStatus && this.currentView === 'settings') {
            this.updateSettingsConnectionStatus(status, message);
        }
    }
    
    /**
     * Update the settings page connection status
     * @param {string} status - The connection status ('connected', 'disconnected', 'error')
     * @param {string} message - The status message to display
     */
    updateSettingsConnectionStatus(status, message) {
        // Default messages for statuses if not provided
        if (!message) {
            switch(status) {
                case 'connected':
                    message = 'Successfully connected to PingOne';
                    break;
                case 'error':
                    message = 'Connection error. Please check your settings.';
                    break;
                case 'disconnected':
                default:
                    message = 'Not connected. Please save your API credentials and test the connection.';
            }
        }
        
        this._updateStatusElement('settings-connection-status', status, message, false);
    }
    
    /**
     * Internal method to update a status element
     * @private
     */
    _updateStatusElement(elementId, status, message, autoHide = true) {
        let element = document.getElementById(elementId);
        if (!element) {
            console.warn(`Status element with ID '${elementId}' not found`);
            return;
        }
        
        // Clear existing classes and reset styles
        element.className = 'connection-status';
        element.style.display = 'flex';
        element.style.alignItems = 'center';
        element.style.padding = '10px 15px';
        element.style.borderRadius = '4px';
        element.style.margin = '10px 0';
        element.style.fontWeight = '500';
        element.style.transition = 'all 0.3s ease';
        
        // Set styles based on status
        let icon = '';
        switch(status) {
            case 'connected':
                element.style.backgroundColor = '#e6f7e6';
                element.style.color = '#2e7d32';
                element.style.border = '1px solid #a5d6a7';
                icon = '✓';
                break;
            case 'error':
                element.style.backgroundColor = '#ffebee';
                element.style.color = '#c62828';
                element.style.border = '1px solid #ef9a9a';
                icon = '!';
                break;
            case 'connecting':
                element.style.backgroundColor = '#e3f2fd';
                element.style.color = '#1565c0';
                element.style.border = '1px solid #90caf9';
                icon = '↻';
                // Add spinning animation
                const style = document.createElement('style');
                style.id = 'spin-animation';
                style.textContent = `
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                    .spinning {
                        display: inline-block;
                        animation: spin 1s linear infinite;
                    }
                `;
                if (!document.getElementById('spin-animation')) {
                    document.head.appendChild(style);
                }
                break;
            case 'disconnected':
            default:
                element.style.backgroundColor = '#f5f5f5';
                element.style.color = '#424242';
                element.style.border = '1px solid #e0e0e0';
                icon = '!';
        }
        
        // Create status icon
        const iconSpan = document.createElement('span');
        iconSpan.className = 'status-icon';
        iconSpan.textContent = icon;
        iconSpan.style.marginRight = '8px';
        iconSpan.style.fontWeight = 'bold';
        
        if (status === 'connecting') {
            iconSpan.classList.add('spinning');
        }
        
        // Create message span
        const messageSpan = document.createElement('span');
        messageSpan.className = 'status-message';
        messageSpan.textContent = message;
        
        // Clear and update the element
        element.innerHTML = '';
        element.appendChild(iconSpan);
        element.appendChild(messageSpan);
        
        // If connected and auto-hide is enabled, hide after 5 seconds
        if (status === 'connected' && autoHide) {
            setTimeout(() => {
                if (element) {
                    element.style.opacity = '0';
                    setTimeout(() => {
                        if (element) element.style.display = 'none';
                    }, 300);
                }
            }, 5000);
        }
    }

    /**
     * Switch to the specified view
     * @param {string} viewName - Name of the view to show ('import', 'settings', 'logs')
     */
    /**
     * Scroll the logs container to the bottom
     */
    scrollLogsToBottom() {
        if (this.logsView) {
            const logsContainer = this.logsView.querySelector('.logs-container') || this.logsView;
            logsContainer.scrollTop = logsContainer.scrollHeight;
        }
    }

    /**
     * Load and display logs from the server
     */
    async loadAndDisplayLogs() {
        if (!this.logsView) {
            console.warn('Logs view element not found');
            return;
        }

        // Safe logging function
        const safeLog = (message, level = 'log', data = null) => {
            try {
                if (this.logger) {
                    if (typeof this.logger[level] === 'function') {
                        this.logger[level](message, data);
                        return;
                    } else if (typeof this.logger.log === 'function') {
                        this.logger.log(message, level, data);
                        return;
                    }
                }
                // Fallback to console
                if (console[level]) {
                    console[level](message, data);
                } else {
                    console.log(`[${level.toUpperCase()}]`, message, data);
                }
            } catch (logError) {
                console.error('Error in safeLog:', logError);
            }
        };

        // Get or create log entries container
        let logEntries = this.logsView.querySelector('.log-entries');
        if (!logEntries) {
            logEntries = document.createElement('div');
            logEntries.className = 'log-entries';
            this.logsView.appendChild(logEntries);
        }

        // Show loading indicator
        const loadingElement = document.createElement('div');
        loadingElement.id = 'logs-loading';
        loadingElement.textContent = 'Loading logs...';
        loadingElement.style.padding = '1rem';
        loadingElement.style.textAlign = 'center';
        loadingElement.style.color = '#666';
        
        // Clear existing content and show loading
        logEntries.innerHTML = '';
        logEntries.appendChild(loadingElement);
        
        try {
            // Fetch logs from the UI logs endpoint
            safeLog('Fetching logs from /api/logs/ui...', 'debug');
            const response = await fetch('/api/logs/ui?limit=200');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const responseData = await response.json();
            safeLog('Received logs from server', 'debug', { count: responseData.logs?.length });
            
            // Clear any existing logs in the UI
            logEntries.innerHTML = '';
            
            if (responseData.success === true && Array.isArray(responseData.logs)) {
                if (responseData.logs.length === 0) {
                    const noLogsElement = document.createElement('div');
                    noLogsElement.className = 'log-entry info';
                    noLogsElement.textContent = 'No logs available';
                    logEntries.appendChild(noLogsElement);
                    return;
                }
                
                // Process logs in reverse chronological order (newest first)
                const logsToProcess = [...responseData.logs].reverse();
                
                logsToProcess.forEach((log, index) => {
                    try {
                        if (log && typeof log === 'object') {
                            const logElement = document.createElement('div');
                            const logLevel = (log.level || 'info').toLowerCase();
                            logElement.className = `log-entry log-${logLevel}`;
                            
                            const timestamp = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
                            const level = log.level ? log.level.toUpperCase() : 'INFO';
                            const message = log.message || 'No message';
                            
                            logElement.innerHTML = `
                                <span class="log-timestamp">[${timestamp}]</span>
                                <span class="log-level">${level}</span>
                                <span class="log-message">${message}</span>
                            `;
                            
                            // Add data if present
                            if (log.data && Object.keys(log.data).length > 0) {
                                const dataElement = document.createElement('pre');
                                dataElement.className = 'log-data';
                                dataElement.textContent = JSON.stringify(log.data, null, 2);
                                logElement.appendChild(dataElement);
                            }
                            
                            logEntries.appendChild(logElement);
                        } else {
                            safeLog(`Skipping invalid log entry at index ${index}`, 'warn', log);
                        }
                    } catch (logError) {
                        safeLog(`Error processing log entry at index ${index}: ${logError.message}`, 'error', { error: logError });
                    }
                });
                
                // Scroll to bottom after adding logs
                this.scrollLogsToBottom();
            } else {
                safeLog('No valid log entries found in response', 'warn');
                const noLogsElement = document.createElement('div');
                noLogsElement.className = 'log-entry info';
                noLogsElement.textContent = 'No logs available';
                logEntries.appendChild(noLogsElement);
            }
        } catch (error) {
            safeLog(`Error fetching logs: ${error.message}`, 'error', { 
                error: {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                }
            });
            
            // Show error message in the UI
            const errorElement = document.createElement('div');
            errorElement.className = 'log-entry error';
            errorElement.textContent = `Error loading logs: ${error.message}`;
            logEntries.innerHTML = '';
            logEntries.appendChild(errorElement);
        } finally {
            // Remove loading indicator
            const loadingElement = document.getElementById('logs-loading');
            if (loadingElement && loadingElement.parentNode === logEntries) {
                logEntries.removeChild(loadingElement);
            }
        }
    }

    /**
     * Show the import status section
     * @param {number} totalUsers - Total number of users to import
     */
    showImportStatus(totalUsers) {
        const importStatus = document.getElementById('import-status');
        if (importStatus) {
            importStatus.style.display = 'block';
        }
        
        // Reset all counters
        this.updateImportProgress(0, totalUsers, 'Starting import...', {
            success: 0,
            failed: 0,
            skipped: 0
        });
    }

    /**
     * Update the import progress
     * @param {number} current - Number of users processed so far
     * @param {number} total - Total number of users to process
     * @param {string} message - Status message to display
     * @param {Object} [counts] - Optional object containing success, failed, and skipped counts
     */
    updateImportProgress(current, total, message, counts = {}) {
        const progressBar = document.getElementById('import-progress');
        const progressPercent = document.getElementById('import-progress-percent');
        const progressText = document.getElementById('import-progress-text');
        const progressCount = document.getElementById('import-progress-count');
        
        if (progressBar) {
            const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
            progressBar.style.width = `${percent}%`;
            progressBar.setAttribute('aria-valuenow', percent);
        }
        
        if (progressPercent) {
            progressPercent.textContent = `${total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0}%`;
        }
        
        if (progressText) {
            progressText.textContent = message || '';
        }
        
        if (progressCount) {
            progressCount.textContent = `${current} of ${total} users`;
        }
        
        // Update success, failed, and skipped counts if provided
        if (counts.success !== undefined) {
            const successCount = document.getElementById('import-success-count');
            if (successCount) successCount.textContent = counts.success;
        }
        
        if (counts.failed !== undefined) {
            const failedCount = document.getElementById('import-failed-count');
            if (failedCount) failedCount.textContent = counts.failed;
        }
        
        if (counts.skipped !== undefined) {
            const skippedCount = document.getElementById('import-skipped-count');
            if (skippedCount) skippedCount.textContent = counts.skipped;
        }
    }
    
    /**
     * Reset the import state
     */
    resetImportState() {
        const importStatus = document.getElementById('import-status');
        if (importStatus) {
            importStatus.style.display = 'none';
        }
    }
    
    /**
     * Set the import button state
     * @param {boolean} enabled - Whether the button should be enabled
     * @param {string} [text] - Optional button text
     */
    setImportButtonState(enabled, text) {
        const importButton = document.getElementById('start-import-btn');
        if (importButton) {
            importButton.disabled = !enabled;
            if (text) {
                importButton.textContent = text;
            }
        }
    }
    
    /**
     * Show a success notification
     * @param {string} message - The message to display
     */
    showSuccess(message) {
        this.showNotification(message, 'success');
    }
    
    /**
     * Show a warning notification
     * @param {string} message - The message to display
     */
    showWarning(message) {
        this.showNotification(message, 'warning');
    }
    
    /**
     * Show an error notification
     * @param {string} message - The message to display
     */
    showError(message) {
        this.showNotification(message, 'error');
    }
    
    /**
     * Show a notification
     * @param {string} message - The message to display
     * @param {string} type - The type of notification ('success', 'warning', 'error')
     */
    showNotification(message, type = 'info') {
        console.log(`[${type}] ${message}`);
        
        // Get or create notification container
        let notificationArea = document.getElementById('notification-area');
        if (!notificationArea) {
            console.warn('Notification area not found in the DOM');
            return;
        }
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
                <button class="notification-close">&times;</button>
            </div>
        `;
        
        // Add close button handler
        const closeButton = notification.querySelector('.notification-close');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                notification.classList.add('fade-out');
                setTimeout(() => notification.remove(), 300);
            });
        }
        
        // Add to notification area
        notificationArea.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.classList.add('fade-out');
                setTimeout(() => notification.remove(), 300);
            }
        }, 5000);
        
        return notification;
    }
    
    /**
     * Update the settings form with the provided settings
     * @param {Object} settings - The settings object containing the form values
     */
    updateSettingsForm(settings) {
        if (!settings) return;

        // Map of setting IDs to their corresponding form field IDs
        const settingFields = {
            'environmentId': 'environment-id',
            'apiClientId': 'api-client-id',
            'apiSecret': 'api-secret',
            'populationId': 'population-id'
        };

        // Update each form field with the corresponding setting value
        Object.entries(settingFields).forEach(([settingKey, fieldId]) => {
            const element = document.getElementById(fieldId);
            if (element && settings[settingKey] !== undefined) {
                element.value = settings[settingKey] || '';
            }
        });
    }

    init(callbacks = {}) {
        // Store callbacks
        this.callbacks = callbacks;
        
        // Initialize navigation event listeners
        this.navItems.forEach(item => {
            if (item) {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    const view = item.getAttribute('data-view');
                    if (view) {
                        this.showView(view);
                    }
                });
            }
        });
        
        // Set up Start Import button
        const startImportBtn = document.getElementById('start-import-btn');
        if (startImportBtn) {
            startImportBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (this.callbacks.onImport) {
                    this.callbacks.onImport();
                }
            });
        }
        
        // Set up Cancel Import button
        const cancelImportBtn = document.getElementById('cancel-import-btn');
        if (cancelImportBtn && this.callbacks.onCancelImport) {
            cancelImportBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.callbacks.onCancelImport();
            });
        }
        
        // Make sure the current view is visible
        const currentView = this.getLastView();
        this.showView(currentView);
    }
    
    /**
     * Show loading state
     * @param {boolean} [show=true] - Whether to show or hide the loading state
     * @param {string} [message='Loading...'] - Optional loading message
     */
    showLoading(show = true, message = 'Loading...') {
        let loadingElement = document.getElementById('loading-overlay');
        
        if (show) {
            // Create loading overlay if it doesn't exist
            if (!loadingElement) {
                loadingElement = document.createElement('div');
                loadingElement.id = 'loading-overlay';
                loadingElement.style.position = 'fixed';
                loadingElement.style.top = '0';
                loadingElement.style.left = '0';
                loadingElement.style.width = '100%';
                loadingElement.style.height = '100%';
                loadingElement.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
                loadingElement.style.display = 'flex';
                loadingElement.style.justifyContent = 'center';
                loadingElement.style.alignItems = 'center';
                loadingElement.style.zIndex = '9999';
                
                const spinner = document.createElement('div');
                spinner.className = 'spinner-border text-light';
                spinner.role = 'status';
                
                const srOnly = document.createElement('span');
                srOnly.className = 'visually-hidden';
                srOnly.textContent = 'Loading...';
                
                spinner.appendChild(srOnly);
                
                const messageElement = document.createElement('div');
                messageElement.className = 'ms-3 text-light';
                messageElement.textContent = message;
                messageElement.id = 'loading-message';
                
                loadingElement.appendChild(spinner);
                loadingElement.appendChild(messageElement);
                document.body.appendChild(loadingElement);
            } else {
                // Update existing loading message if needed
                const messageElement = document.getElementById('loading-message');
                if (messageElement) {
                    messageElement.textContent = message;
                }
                loadingElement.style.display = 'flex';
            }
        } else if (loadingElement) {
            // Hide loading overlay
            loadingElement.style.display = 'none';
        }
    }
    
    /**
     * Get the last viewed page from localStorage
     * @returns {string} The name of the last viewed page, or 'import' if not set
     */
    getLastView() {
        try {
            return localStorage.getItem('currentView') || 'import';
        } catch (e) {
            console.warn('Could not read view from localStorage:', e);
            return 'import';
        }
    }
    
    /**
     * Load and display logs in the logs view
     */
    async loadAndDisplayLogs() {
        const logsView = document.getElementById('logs-view');
        if (!logsView) {
            console.error('Logs view element not found');
            return;
        }
        
        // Show loading indicator
        let loadingElement = document.getElementById('logs-loading');
        if (!loadingElement) {
            loadingElement = document.createElement('div');
            loadingElement.id = 'logs-loading';
            loadingElement.textContent = 'Loading logs...';
            logsView.appendChild(loadingElement);
        } else {
            loadingElement.textContent = 'Loading logs...';
            loadingElement.style.display = 'block';
        }
        
        // Clear existing logs
        let logEntriesContainer = logsView.querySelector('.log-entries');
        if (!logEntriesContainer) {
            logEntriesContainer = document.createElement('div');
            logEntriesContainer.className = 'log-entries';
            logsView.appendChild(logEntriesContainer);
        } else {
            logEntriesContainer.innerHTML = '';
        }
        
        try {
            const response = await fetch('/api/logs/ui?limit=200');
            const data = await response.json();
            
            if (data.success && Array.isArray(data.logs)) {
                // Hide loading indicator
                loadingElement.style.display = 'none';
                
                // Process and display logs
                data.logs.forEach(log => {
                    if (!log) {
                        console.warn('Skipping null log entry');
                        return;
                    }
                    
                    // Create log entry element
                    const logEntry = document.createElement('div');
                    logEntry.className = `log-entry log-${log.level || 'info'}`;
                    
                    // Format the log message
                    const timestamp = log.timestamp ? new Date(log.timestamp).toISOString() : new Date().toISOString();
                    const level = (log.level || 'info').toUpperCase();
                    const message = log.message || '';
                    const meta = log.meta ? ' ' + JSON.stringify(log.meta) : '';
                    
                    logEntry.textContent = `[${timestamp}] ${level}: ${message}${meta}`;
                    
                    // Append to container
                    logEntriesContainer.appendChild(logEntry);
                    
                    // Log the entry using the logger (for testing purposes)
                    if (this.logger && typeof this.logger._log === 'function') {
                        this.logger._log(log.level || 'info', log.message || '', log.meta || {});
                    }
                });
                
                // Scroll to bottom
                logEntriesContainer.scrollTop = logEntriesContainer.scrollHeight;
            } else {
                const errorMsg = data.error || 'Failed to load logs';
                logEntriesContainer.innerHTML = `<div class="error">${errorMsg}</div>`;
                console.error('Failed to load logs:', errorMsg);
                
                if (this.logger && typeof this.logger.error === 'function') {
                    this.logger.error('Failed to load logs:', errorMsg);
                }
            }
        } catch (error) {
            const errorMsg = error.message || 'Error loading logs';
            logEntriesContainer.innerHTML = `<div class="error">${errorMsg}</div>`;
            console.error('Error loading logs:', error);
            
            if (this.logger && typeof this.logger.error === 'function') {
                this.logger.error('Error loading logs:', error);
            }
        } finally {
            // Ensure loading indicator is hidden
            if (loadingElement) {
                loadingElement.style.display = 'none';
            }
        }
    }
    
    /**
     * Add a form with submission handling
     * @param {string} formId - The ID of the form element
     * @param {string} action - The URL to submit the form to
     * @param {Function} onSuccess - Callback for successful submission
     * @param {Function} onError - Callback for submission error
     */
    addForm(formId, action, onSuccess, onError) {
        const form = document.getElementById(formId);
        if (!form) {
            console.error(`Form with ID '${formId}' not found`);
            return;
        }
        
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            
            const formData = new FormData(form);
            const formDataObj = {};
            formData.forEach((value, key) => {
                formDataObj[key] = value;
            });
            
            try {
                const response = await fetch(action, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(formDataObj),
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.error || 'Form submission failed');
                }
                
                if (typeof onSuccess === 'function') {
                    onSuccess(data);
                }
            } catch (error) {
                console.error('Form submission error:', error);
                if (typeof onError === 'function') {
                    onError({ error: error.message });
                }
            }
        });
    }
    
    /**
     * Update the content of an element
     * @param {string} elementId - The ID of the element to update
     * @param {string} content - The new content to set
     */
    updateElementContent(elementId, content) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = content;
        } else {
            console.error(`Element with ID ${elementId} not found`);
        }
    }
}

// No need for module.exports with ES modules
