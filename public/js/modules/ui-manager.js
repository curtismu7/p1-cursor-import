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
     */
    updateConnectionStatus(status, message) {
        if (!this.connectionStatusElement) {
            this.connectionStatusElement = document.getElementById('connection-status');
            if (!this.connectionStatusElement) return;
        }
        
        // Clear existing classes
        this.connectionStatusElement.className = 'connection-status';
        
        // Add status class and update text
        this.connectionStatusElement.classList.add(`status-${status}`);
        this.connectionStatusElement.textContent = message;
        
        // Show the status element
        this.connectionStatusElement.style.display = 'block';
    }

    /**
     * Switch to the specified view
     * @param {string} viewName - Name of the view to show ('import', 'settings', 'logs')
     */
    async showView(viewName) {
        console.log(`Switching to view: ${viewName}`);
        
        // Hide all views
        Object.values(this.views).forEach(view => {
            if (view) view.style.display = 'none';
        });

        // Deactivate all nav items
        this.navItems.forEach(item => {
            if (item && item.classList) {
                item.classList.remove('active');
            }
        });

        // Show the selected view and activate its nav item
        const view = this.views[viewName];
        if (view) {
            view.style.display = 'block';
            const navItem = document.querySelector(`[data-view="${viewName}"]`);
            if (navItem) {
                navItem.classList.add('active');
            }
            this.currentView = viewName;

            // Save the current view to localStorage
            try {
                localStorage.setItem('currentView', viewName);
            } catch (e) {
                console.warn('Could not save view to localStorage:', e);
            }

            // Special handling for logs view
            if (viewName === 'logs' && this.logger) {
                await this.loadAndDisplayLogs();
            }
        } else {
            console.warn(`View '${viewName}' not found`);
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

    init() {
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
        
        // Make sure the current view is visible
        const currentView = this.getLastView();
        this.showView(currentView);
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
