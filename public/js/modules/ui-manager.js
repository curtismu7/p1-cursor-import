export class UIManager {
    constructor(logger) {
        this.logger = logger;
        this.currentView = 'import';
        // Initialize UI elements
        this.views = {
            'import': document.getElementById('import-view'),
            'settings': document.getElementById('settings-view'),
            'logs': document.getElementById('logs-view'),
            'delete-csv': document.getElementById('delete-csv-view')
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
     * Update the settings status in the UI
     * @param {boolean} hasRequiredSettings - Whether all required settings are present
     */
    updateSettingsStatus(hasRequiredSettings) {
        const statusElement = document.getElementById('settings-status');
        if (!statusElement) return;
        
        if (hasRequiredSettings) {
            statusElement.innerHTML = `
                <i class="fas fa-check-circle"></i>
                <span>All required settings are configured</span>
            `;
            statusElement.className = 'status-message status-success';
        } else {
            statusElement.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i>
                <span>Missing required settings</span>
            `;
            statusElement.className = 'status-message status-warning';
        }
    }
    
    /**
     * Update the connection status display with enhanced error handling and logging
     * @param {string} status - The connection status ('connected', 'disconnected', 'error', 'connecting')
     * @param {string} [message] - The status message to display (optional)
     * @param {boolean} [updateSettingsStatus=true] - Whether to also update the settings page status
     * @returns {boolean} - Returns true if update was successful, false otherwise
     */
    updateConnectionStatus(status, message, updateSettingsStatus = true) {
        try {
            // Validate input
            if (!status) {
                console.warn('No status provided to updateConnectionStatus');
                return false;
            }
            
            const normalizedStatus = status.toLowerCase();
            const normalizedMessage = message || this._getDefaultStatusMessage(normalizedStatus);
            
            console.debug(`Updating connection status to: ${normalizedStatus} - ${normalizedMessage}`);
            
            // Update main connection status
            const mainUpdateSuccess = this._updateStatusElement('connection-status', normalizedStatus, normalizedMessage);
            
            // Also update settings status if needed and possible
            let settingsUpdateSuccess = true;
            if (updateSettingsStatus) {
                settingsUpdateSuccess = this.updateSettingsConnectionStatus(normalizedStatus, normalizedMessage);
            }
            
            // Update any UI elements that depend on connection status
            this._updateConnectionDependentUI(normalizedStatus);
            
            // Log the status change
            this._logStatusChange(normalizedStatus, normalizedMessage);
            
            return mainUpdateSuccess && settingsUpdateSuccess;
            
        } catch (error) {
            console.error('Error in updateConnectionStatus:', error);
            this._handleStatusUpdateError(error, status, message);
            return false;
        }
    }
    
    /**
     * Update the connection status in the settings page
     * @param {string} status - The connection status ('connected', 'disconnected', 'error', 'connecting')
     * @param {string} [message] - The status message to display (optional)
     * @returns {boolean} - Returns true if update was successful, false otherwise
     */
    updateSettingsConnectionStatus(status, message) {
        try {
            if (!status) {
                console.warn('No status provided to updateSettingsConnectionStatus');
                return false;
            }
            
            const normalizedStatus = status.toLowerCase();
            const normalizedMessage = message || this._getDefaultStatusMessage(normalizedStatus);
            
            return this._updateStatusElement('settings-connection-status', normalizedStatus, normalizedMessage);
            
        } catch (error) {
            console.error('Error in updateSettingsConnectionStatus:', error);
            return false;
        }
    }
    
    /**
     * Update UI elements that depend on connection status
     * @private
     * @param {string} status - The current connection status
     */
    _updateConnectionDependentUI(status) {
        try {
            // Update connection button state
            const connectButton = document.getElementById('connect-button');
            if (connectButton) {
                connectButton.disabled = status === 'connected';
                connectButton.textContent = status === 'connected' ? 'Connected' : 'Connect';
                connectButton.className = `btn ${status === 'connected' ? 'btn-success' : 'btn-primary'}`;
            }
            
            // Update import button state
            const importButton = document.getElementById('import-button');
            if (importButton) {
                importButton.disabled = status !== 'connected';
                importButton.title = status === 'connected' 
                    ? 'Start user import' 
                    : 'Please connect to PingOne first';
            }
            
            // Update status indicator in navigation
            const statusIndicator = document.getElementById('nav-connection-status');
            if (statusIndicator) {
                statusIndicator.className = `nav-status-indicator status-${status}`;
                statusIndicator.title = `${status.charAt(0).toUpperCase() + status.slice(1)}: ${this._getDefaultStatusMessage(status)}`;
            }
            
            // Show/hide connection error message
            const errorElement = document.getElementById('connection-error');
            if (errorElement) {
                if (status === 'error') {
                    errorElement.style.display = 'block';
                } else {
                    errorElement.style.display = 'none';
                }
            }
            
        } catch (error) {
            console.error('Error updating connection-dependent UI:', error);
        }
    }
    
    /**
     * Helper method to update a status element with validation and error handling
     * @private
     * @param {string} elementId - The ID of the element to update
     * @param {string} status - The status class to apply
     * @param {string} message - The message to display
     * @returns {boolean} - Returns true if update was successful, false otherwise
     */
    _updateStatusElement(elementId, status, message) {
        if (!elementId) {
            console.warn('No elementId provided to _updateStatusElement');
            return false;
        }
        
        const element = document.getElementById(elementId);
        if (!element) {
            console.warn(`Element with ID '${elementId}' not found`);
            return false;
        }
        
        try {
            // Update the element's content and classes
            element.textContent = message || '';
            
            // Remove all status classes
            element.className = element.className
                .split(' ')
                .filter(cls => !cls.startsWith('status-'))
                .join(' ');
                
            // Add the new status class
            element.classList.add(`status-${status}`);
            
            // Add ARIA attributes for accessibility
            element.setAttribute('aria-live', 'polite');
            element.setAttribute('aria-atomic', 'true');
            
            return true;
            
        } catch (error) {
            console.error(`Error updating element '${elementId}':`, error);
            return false;
        }
    }
    
    /**
     * Log status changes for debugging and auditing
     * @private
     * @param {string} status - The connection status
     * @param {string} message - The status message
     */
    _logStatusChange(status, message) {
        const timestamp = new Date().toISOString();
        console.debug(`[${timestamp}] Connection status changed to: ${status} - ${message}`);
        
        // You could also log this to a server endpoint for auditing
        // this._logToServer('connection-status', { status, message, timestamp });
    }
    
    /**
     * Handle errors that occur during status updates
     * @private
     * @param {Error} error - The error that occurred
     * @param {string} status - The status that was being set
     * @param {string} message - The message that was being set
     */
    _handleStatusUpdateError(error, status, message) {
        const errorMessage = `Failed to update status to '${status}': ${error.message}`;
        console.error(errorMessage, error);
        
        // Try to show a user-visible error if possible
        try {
            const errorElement = document.getElementById('connection-error');
            if (errorElement) {
                errorElement.textContent = `Error: ${errorMessage}. ${message || ''}`;
                errorElement.style.display = 'block';
            }
        } catch (uiError) {
            console.error('Failed to display error to user:', uiError);
        }
    }
    
    /**
     * Get the default status message for a given status
     * @private
     * @param {string} status - The connection status
     * @returns {string} The default status message
     */
    _getDefaultStatusMessage(status) {
        switch(status) {
            case 'connected':
                return 'Successfully connected to PingOne';
            case 'connecting':
                return 'Connecting to PingOne...';
            case 'error':
                return 'Connection error. Please check your settings.';
            case 'disconnected':
            default:
                return 'Not connected. Please configure your API credentials and test the connection.';
        }
    }
    
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
                
                // Process logs in chronological order (oldest first, newest last)
                // Reverse the array since server returns newest first, but we want oldest first
                const logsToProcess = [...responseData.logs].reverse();

                logsToProcess.forEach((log, index) => {
                    try {
                        if (log && typeof log === 'object') {
                            const logElement = document.createElement('div');
                            const logLevel = (log.level || 'info').toLowerCase();
                            logElement.className = `log-entry log-${logLevel}`;
                            logElement.style.cursor = 'pointer';
                            
                            const timestamp = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
                            const level = log.level ? log.level.toUpperCase() : 'INFO';
                            const message = log.message || 'No message';
                            
                            logElement.innerHTML = `
                                <span class="log-timestamp">[${timestamp}]</span>
                                <span class="log-level">${level}</span>
                                <span class="log-message">${message}</span>
                            `;

                            // Add data if present (collapsed by default)
                            let detailsElement = null;
                            if (log.data && Object.keys(log.data).length > 0) {
                                detailsElement = document.createElement('pre');
                                detailsElement.className = 'log-details';
                                detailsElement.style.display = 'none';
                                detailsElement.textContent = JSON.stringify(log, null, 2);
                                logElement.appendChild(detailsElement);
                            } else {
                                // Always allow expansion for full log object
                                detailsElement = document.createElement('pre');
                                detailsElement.className = 'log-details';
                                detailsElement.style.display = 'none';
                                detailsElement.textContent = JSON.stringify(log, null, 2);
                                logElement.appendChild(detailsElement);
                            }

                            // Toggle expand/collapse on click
                            logElement.addEventListener('click', function (e) {
                                // Only toggle if not clicking a link or button inside
                                if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON') return;
                                const expanded = logElement.classList.toggle('expanded');
                                if (detailsElement) {
                                    detailsElement.style.display = expanded ? 'block' : 'none';
                                }
                            });

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
    /**
     * Show or hide the import status section
     * @param {boolean} isImporting - Whether import is in progress
     */
    setImporting(isImporting) {
        const importButton = document.getElementById('start-import');
        const cancelButton = document.getElementById('cancel-import');
        
        if (importButton) {
            importButton.disabled = isImporting;
            importButton.textContent = isImporting ? 'Importing...' : 'Start Import';
        }
        
        if (cancelButton) {
            cancelButton.style.display = isImporting ? 'inline-block' : 'none';
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
     * Reset/Clear the Import Progress area for a new import
     */
    resetImportProgress() {
        // Progress bar
        const progressBar = document.getElementById('import-progress');
        if (progressBar) {
            progressBar.style.width = '0%';
            progressBar.setAttribute('aria-valuenow', 0);
        }
        const progressPercent = document.getElementById('import-progress-percent');
        if (progressPercent) progressPercent.textContent = '0%';
        const progressText = document.getElementById('import-progress-text');
        if (progressText) progressText.textContent = 'Ready';
        const progressCount = document.getElementById('import-progress-count');
        if (progressCount) progressCount.textContent = '0 of 0 users';
        // Stats
        const successCount = document.getElementById('import-success-count');
        if (successCount) successCount.textContent = '0';
        const failedCount = document.getElementById('import-failed-count');
        if (failedCount) failedCount.textContent = '0';
        const skippedCount = document.getElementById('import-skipped-count');
        if (skippedCount) skippedCount.textContent = '0';
        // Hide population warning
        this.hidePopulationWarning && this.hidePopulationWarning();
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
        
        // Remove existing success notification if type is success
        if (type === 'success') {
            const existingSuccess = notificationArea.querySelector('.notification-success');
            if (existingSuccess) {
                existingSuccess.remove();
            }
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
        
        // Set up Clear Logs button
        const clearLogsBtn = document.getElementById('clear-logs');
        if (clearLogsBtn) {
            // Hide the button by default
            clearLogsBtn.style.display = 'none';
            clearLogsBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                try {
                    const response = await fetch('/api/logs/ui', { method: 'DELETE' });
                    const data = await response.json();
                    if (data.success) {
                        this.showNotification('Logs cleared. Only UI logs are cleared. Server logs are not affected.', 'info');
                        await this.loadAndDisplayLogs();
                    } else {
                        this.showNotification('Failed to clear logs: ' + (data.error || 'Unknown error'), 'error');
                    }
                } catch (error) {
                    this.showNotification('Error clearing logs: ' + error.message, 'error');
                }
            });
        }
        // Make sure the current view is visible
        const currentView = this.getLastView();
        this.showView(currentView);

        // Show/hide Clear Logs button based on view
        const updateClearLogsBtnVisibility = (viewName) => {
            if (clearLogsBtn) {
                clearLogsBtn.style.display = (viewName === 'logs') ? '' : 'none';
            }
        };
        // Patch showView to also update button visibility
        const origShowView = this.showView.bind(this);
        this.showView = async (viewName) => {
            updateClearLogsBtnVisibility(viewName);
            return await origShowView(viewName);
        };
        // Set initial visibility
        updateClearLogsBtnVisibility(currentView);
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
                
                // Process and display logs in chronological order (oldest first, newest last)
                // Reverse the array since server returns newest first, but we want oldest first
                const logsToProcess = [...data.logs].reverse();
                
                logsToProcess.forEach((log, index) => {
                    if (!log) {
                        console.warn('Skipping null log entry');
                        return;
                    }
                    
                    // Create expandable log entry element
                    const logEntry = document.createElement('div');
                    logEntry.className = `log-entry log-${log.level || 'info'}`;
                    logEntry.setAttribute('data-log-index', index);
                    
                    // Create the main log content (always visible)
                    const logContent = document.createElement('div');
                    logContent.className = 'log-content';
                    
                    // Format the log message
                    const timestamp = log.timestamp ? new Date(log.timestamp).toISOString() : new Date().toISOString();
                    const level = (log.level || 'info').toUpperCase();
                    const message = log.message || '';
                    
                    // Create timestamp element
                    const timestampElement = document.createElement('span');
                    timestampElement.className = 'log-timestamp';
                    timestampElement.textContent = `[${timestamp}]`;
                    
                    // Create level element
                    const levelElement = document.createElement('span');
                    levelElement.className = `log-level ${log.level || 'info'}`;
                    levelElement.textContent = level;
                    
                    // Create message element
                    const messageElement = document.createElement('span');
                    messageElement.className = 'log-message';
                    messageElement.textContent = message;
                    
                    // Create expand/collapse indicator
                    const expandIcon = document.createElement('span');
                    expandIcon.className = 'log-expand-icon';
                    expandIcon.innerHTML = '<i class="fas fa-chevron-right"></i>';
                    
                    // Add click handler for expand/collapse
                    logContent.addEventListener('click', () => {
                        const detailsElement = logEntry.querySelector('.log-details');
                        const icon = logContent.querySelector('.log-expand-icon i');
                        
                        if (detailsElement) {
                            if (detailsElement.style.display === 'none' || !detailsElement.style.display) {
                                detailsElement.style.display = 'block';
                                logEntry.classList.add('expanded');
                                icon.className = 'fas fa-chevron-down';
                            } else {
                                detailsElement.style.display = 'none';
                                logEntry.classList.remove('expanded');
                                icon.className = 'fas fa-chevron-right';
                            }
                        }
                    });
                    
                    // Add cursor pointer to indicate clickable
                    logContent.style.cursor = 'pointer';
                    
                    // Assemble the main log content
                    logContent.appendChild(timestampElement);
                    logContent.appendChild(levelElement);
                    logContent.appendChild(messageElement);
                    logContent.appendChild(expandIcon);
                    
                    logEntry.appendChild(logContent);
                    
                    // Create expandable details section
                    const detailsElement = document.createElement('div');
                    detailsElement.className = 'log-details';
                    detailsElement.style.display = 'none';
                    
                    // Add detailed information
                    const detailsContent = document.createElement('div');
                    detailsContent.className = 'log-details-content';
                    
                    // Create details sections
                    const detailsSections = [];
                    
                    // Add meta information if available
                    if (log.meta && Object.keys(log.meta).length > 0) {
                        const metaSection = document.createElement('div');
                        metaSection.className = 'log-detail-section';
                        metaSection.innerHTML = `
                            <h4>Additional Information</h4>
                            <pre class="log-detail-json">${JSON.stringify(log.meta, null, 2)}</pre>
                        `;
                        detailsSections.push(metaSection);
                    }
                    
                    // Add error details if available
                    if (log.error) {
                        const errorSection = document.createElement('div');
                        errorSection.className = 'log-detail-section';
                        errorSection.innerHTML = `
                            <h4>Error Details</h4>
                            <pre class="log-detail-error">${JSON.stringify(log.error, null, 2)}</pre>
                        `;
                        detailsSections.push(errorSection);
                    }
                    
                    // Add stack trace if available
                    if (log.stack) {
                        const stackSection = document.createElement('div');
                        stackSection.className = 'log-detail-section';
                        stackSection.innerHTML = `
                            <h4>Stack Trace</h4>
                            <pre class="log-detail-stack">${log.stack}</pre>
                        `;
                        detailsSections.push(stackSection);
                    }
                    
                    // Add request/response details if available
                    if (log.request || log.response) {
                        const requestSection = document.createElement('div');
                        requestSection.className = 'log-detail-section';
                        
                        let requestContent = '<h4>Request/Response Details</h4>';
                        if (log.request) {
                            requestContent += `<h5>Request</h5><pre class="log-detail-json">${JSON.stringify(log.request, null, 2)}</pre>`;
                        }
                        if (log.response) {
                            requestContent += `<h5>Response</h5><pre class="log-detail-json">${JSON.stringify(log.response, null, 2)}</pre>`;
                        }
                        
                        requestSection.innerHTML = requestContent;
                        detailsSections.push(requestSection);
                    }
                    
                    // Add raw log data if no other details are available
                    if (detailsSections.length === 0) {
                        const rawSection = document.createElement('div');
                        rawSection.className = 'log-detail-section';
                        rawSection.innerHTML = `
                            <h4>Raw Log Data</h4>
                            <pre class="log-detail-json">${JSON.stringify(log, null, 2)}</pre>
                        `;
                        detailsSections.push(rawSection);
                    }
                    
                    // Add all sections to details content
                    detailsSections.forEach(section => {
                        detailsContent.appendChild(section);
                    });
                    
                    detailsElement.appendChild(detailsContent);
                    logEntry.appendChild(detailsElement);
                    
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

    /**
     * Show population ID warning message
     * @param {string} csvPopulationId - The invalid population ID from CSV
     * @param {string} settingsPopulationId - The population ID from settings that was used instead
     */
    showPopulationWarning(csvPopulationId, settingsPopulationId) {
        const warningArea = document.getElementById('population-warning');
        const warningText = document.getElementById('population-warning-text');
        
        if (warningArea && warningText) {
            warningText.textContent = `Invalid population ID "${csvPopulationId}" found in CSV file. Using settings population ID "${settingsPopulationId}" instead.`;
            warningArea.style.display = 'block';
        }
    }

    /**
     * Hide population ID warning message
     */
    hidePopulationWarning() {
        const warningArea = document.getElementById('population-warning');
        if (warningArea) {
            warningArea.style.display = 'none';
        }
    }

    setDeletingCsv(isDeleting) {
        const deleteButton = document.getElementById('start-delete-csv-btn');
        const cancelButton = document.getElementById('cancel-delete-csv-btn');
        if (deleteButton) {
            deleteButton.disabled = isDeleting;
            deleteButton.textContent = isDeleting ? 'Deleting...' : 'Delete Users (CSV Safe)';
        }
        if (cancelButton) {
            cancelButton.style.display = isDeleting ? 'inline-block' : 'none';
        }
    }

    showDeleteCsvStatus(totalUsers) {
        const deleteStatus = document.getElementById('delete-csv-status');
        if (deleteStatus) {
            deleteStatus.style.display = 'block';
        }
        this.updateDeleteCsvProgress(0, totalUsers, 'Starting delete operation...', {
            success: 0,
            failed: 0,
            skipped: 0
        });
    }

    updateDeleteCsvProgress(current, total, message, counts = {}) {
        const progressBar = document.getElementById('delete-csv-progress');
        const progressPercent = document.getElementById('delete-csv-progress-percent');
        const progressText = document.getElementById('delete-csv-progress-text');
        const progressCount = document.getElementById('delete-csv-progress-count');
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
        if (counts.success !== undefined) {
            const successCount = document.getElementById('delete-csv-success-count');
            if (successCount) successCount.textContent = counts.success;
        }
        if (counts.failed !== undefined) {
            const failedCount = document.getElementById('delete-csv-failed-count');
            if (failedCount) failedCount.textContent = counts.failed;
        }
        if (counts.skipped !== undefined) {
            const skippedCount = document.getElementById('delete-csv-skipped-count');
            if (skippedCount) skippedCount.textContent = counts.skipped;
        }
    }

    resetDeleteCsvState() {
        const deleteStatus = document.getElementById('delete-csv-status');
        if (deleteStatus) {
            deleteStatus.style.display = 'none';
        }
    }

    resetDeleteCsvProgress() {
        const progressBar = document.getElementById('delete-csv-progress');
        if (progressBar) {
            progressBar.style.width = '0%';
            progressBar.setAttribute('aria-valuenow', 0);
        }
        const progressPercent = document.getElementById('delete-csv-progress-percent');
        if (progressPercent) progressPercent.textContent = '0%';
        const progressText = document.getElementById('delete-csv-progress-text');
        if (progressText) progressText.textContent = 'Ready';
        const progressCount = document.getElementById('delete-csv-progress-count');
        if (progressCount) progressCount.textContent = '0 of 0 users';
        const successCount = document.getElementById('delete-csv-success-count');
        if (successCount) successCount.textContent = '0';
        const failedCount = document.getElementById('delete-csv-failed-count');
        if (failedCount) failedCount.textContent = '0';
        const skippedCount = document.getElementById('delete-csv-skipped-count');
        if (skippedCount) skippedCount.textContent = '0';
    }
}

// No need for module.exports with ES modules
