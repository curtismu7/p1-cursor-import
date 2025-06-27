class UIManager {
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
        
        // Clear existing classes
        element.className = 'connection-status';
        
        // Add status class
        element.classList.add(`status-${status}`);
        
        // Add icon based on status
        let icon = '';
        switch(status) {
            case 'connected':
                icon = '✓';
                break;
            case 'error':
                icon = '⚠️';
                break;
            case 'disconnected':
            default:
                icon = '⚠️';
        }
        
        // Update with icon and message
        element.innerHTML = `<span class="status-icon">${icon}</span> <span class="status-message">${message}</span>`;
        
        // Show the status element
        element.style.display = 'flex';
        
        // If connected and auto-hide is enabled, hide after 5 seconds
        if (status === 'connected' && autoHide) {
            setTimeout(() => {
                if (element) {
                    element.style.display = 'none';
                }
            }, 5000);
        }
    }

    /**
     * Switch to the specified view
     * @param {string} viewName - Name of the view to show ('import', 'settings', 'logs')
     */
    async showView(viewName) {
        console.log(`Switching to view: ${viewName}`);
        
        // Hide all views
        Object.values(this.views).forEach(view => {
            if (view) view.classList.remove('active');
        });
        
        // Deactivate all nav items
        this.navItems.forEach(item => {
            if (item) item.classList.remove('active');
        });
        
        // Show the selected view
        if (this.views[viewName]) {
            this.views[viewName].classList.add('active');
            this.currentView = viewName;
            
            // Activate the corresponding nav item
            const navItem = document.querySelector(`[data-view="${viewName}"]`);
            if (navItem) {
                navItem.classList.add('active');
            }
            
            // Special handling for specific views
            switch(viewName) {
                case 'logs':
                    this.scrollLogsToBottom();
                    await this.loadAndDisplayLogs();
                    break;
                case 'settings':
                    // Update settings connection status when switching to settings view
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
     * Load and display logs from the server
     */
    async loadAndDisplayLogs() {
        if (!this.logsView) {
            console.warn('Logs view element not found');
            return;
        }

        // Show loading indicator
        const loadingElement = document.createElement('div');
        loadingElement.id = 'logs-loading';
        loadingElement.textContent = 'Loading logs...';
        loadingElement.style.padding = '1rem';
        loadingElement.style.textAlign = 'center';
        loadingElement.style.color = '#';
        
        const logEntries = this.logsView.querySelector('.log-entries');
        if (logEntries) {
            logEntries.innerHTML = '';
            logEntries.appendChild(loadingElement);
        }
        
        try {
            // Fetch logs from the UI logs endpoint
            const response = await fetch('/api/logs/ui?limit=200');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const responseData = await response.json();
            console.log('UI logs response:', {
                success: responseData.success,
                count: responseData.count,
                total: responseData.total
            });
            
            // Process logs
            if (this.logger) {
                this.logger.clearLogs();
                
                if (responseData.success === true && Array.isArray(responseData.logs)) {
                    // Process logs in reverse chronological order
                    const logsToProcess = [...responseData.logs].reverse();
                    logsToProcess.forEach((log, index) => {
                        try {
                            if (log && typeof log === 'object') {
                                this.logger._log(
                                    String(log.level || 'info').toLowerCase(),
                                    String(log.message || 'No message'),
                                    typeof log.data === 'object' ? log.data : {}
                                );
                            } else {
                                console.warn(`Skipping invalid log entry at index ${index}:`, log);
                            }
                        } catch (logError) {
                            console.error(`Error processing log entry at index ${index}:`, logError);
                        }
                    });
                } else {
                    console.warn('No valid log entries found in response');
                }
            }
        } catch (error) {
            console.error('Error fetching logs:', error);
            
            // Show error message in the UI
            const errorElement = document.createElement('div');
            errorElement.className = 'log-entry error';
            errorElement.textContent = `Error loading logs: ${error.message}`;
            
            if (logEntries) {
                logEntries.innerHTML = '';
                logEntries.appendChild(errorElement);
            }
        } finally {
            // Remove loading indicator
            const loadingElement = document.getElementById('logs-loading');
            if (loadingElement) {
                loadingElement.remove();
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
        // Implementation for showing notifications
        console.log(`[${type}] ${message}`);
        // You can add actual UI notification logic here
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
}

// Export the UIManager class as a named export
module.exports = { UIManager };
