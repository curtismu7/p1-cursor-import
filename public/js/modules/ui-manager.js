export class UIManager {
    constructor(logger) {
        this.logger = logger;
        this.currentView = 'import';
        
        // Status tracking for all views
        this.lastRunStatus = {
            import: { operation: 'None', status: 'Ready', timestamp: null, details: null, results: null },
            export: { operation: 'None', status: 'Ready', timestamp: null, details: null, results: null },
            'delete-csv': { operation: 'None', status: 'Ready', timestamp: null, details: null, results: null },
            modify: { operation: 'None', status: 'Ready', timestamp: null, details: null, results: null },
            settings: { operation: 'None', status: 'Ready', timestamp: null, details: null, results: null },
            logs: { operation: 'None', status: 'Ready', timestamp: null, details: null, results: null }
        };
        
        // Initialize UI elements
        this.views = {
            'home': document.getElementById('home-view'),
            'import': document.getElementById('import-view'),
            'settings': document.getElementById('settings-view'),
            'logs': document.getElementById('logs-view'),
            'delete-csv': document.getElementById('delete-csv-view'),
            'modify': document.getElementById('modify-view'),
            'export': document.getElementById('export-view')
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
        
        // Load persisted status from localStorage
        this.loadPersistedStatus();
        
        // Rate limit warning tracking
        this.lastRateLimitWarning = null;
        this.rateLimitWarningCooldown = 30000; // 30 seconds cooldown
        
        // Progress log tracking
        this.progressLog = [];
        this.maxProgressLogEntries = 100; // Keep last 100 entries
        
        // Import state tracking
        this.isImporting = false;
        
        // Log pagination tracking
        this.logsPagination = {
            currentPage: 1,
            pageSize: 25,
            totalRecords: 0,
            totalPages: 0,
            allLogs: [], // Store all logs for pagination
            isLoading: false
        };
        
        // Set up progress close button handlers
        this.setupProgressCloseButtons();
        
        // Set up log navigation handlers
        this.setupLogNavigation();
    }

    /**
     * Set up event handlers for log navigation buttons
     */
    setupLogNavigation() {
        const logNavButtons = [
            { id: 'scroll-logs-top', action: 'scrollToTop' },
            { id: 'scroll-logs-up', action: 'scrollUp' },
            { id: 'scroll-logs-down', action: 'scrollDown' },
            { id: 'scroll-logs-bottom', action: 'scrollToBottom' }
        ];

        logNavButtons.forEach(({ id, action }) => {
            const button = document.getElementById(id);
            if (button) {
                button.addEventListener('click', () => {
                    this[action]();
                    this.logger?.info(`Log navigation: ${action}`);
                });
            }
        });
    }

    /**
     * Scroll logs to the top
     */
    scrollToTop() {
        const logsContainer = document.getElementById('log-entries');
        if (logsContainer) {
            logsContainer.scrollTop = 0;
            this.showNotification('Scrolled to top of logs', 'info');
        }
    }

    /**
     * Scroll logs up by one page
     */
    scrollUp() {
        const logsContainer = document.getElementById('log-entries');
        if (logsContainer) {
            const scrollAmount = logsContainer.clientHeight * 0.8;
            logsContainer.scrollTop = Math.max(0, logsContainer.scrollTop - scrollAmount);
            this.showNotification('Scrolled up in logs', 'info');
        }
    }

    /**
     * Scroll logs down by one page
     */
    scrollDown() {
        const logsContainer = document.getElementById('log-entries');
        if (logsContainer) {
            const scrollAmount = logsContainer.clientHeight * 0.8;
            logsContainer.scrollTop = Math.min(
                logsContainer.scrollHeight - logsContainer.clientHeight,
                logsContainer.scrollTop + scrollAmount
            );
            this.showNotification('Scrolled down in logs', 'info');
        }
    }

    /**
     * Scroll logs to the bottom
     */
    scrollToBottom() {
        const logsContainer = document.getElementById('log-entries');
        if (logsContainer) {
            logsContainer.scrollTop = logsContainer.scrollHeight;
            this.showNotification('Scrolled to bottom of logs', 'info');
        }
    }

    /**
     * Update pagination controls and display
     */
    updatePaginationControls() {
        const counter = document.getElementById('logs-counter');
        const pageInput = document.getElementById('logs-page-input');
        const totalPages = document.getElementById('logs-total-pages');
        const firstBtn = document.getElementById('logs-first-page');
        const prevBtn = document.getElementById('logs-prev-page');
        const nextBtn = document.getElementById('logs-next-page');
        const lastBtn = document.getElementById('logs-last-page');
        const pageSizeSelect = document.getElementById('logs-page-size');

        if (!counter || !pageInput || !totalPages) return;

        const { currentPage, pageSize, totalRecords, totalPages: total } = this.logsPagination;
        
        // Update counter
        const startRecord = (currentPage - 1) * pageSize + 1;
        const endRecord = Math.min(currentPage * pageSize, totalRecords);
        counter.textContent = `${startRecord}-${endRecord} of ${totalRecords} records shown`;

        // Update page input and total pages
        pageInput.value = currentPage;
        totalPages.textContent = total;

        // Update navigation buttons
        firstBtn.disabled = currentPage <= 1;
        prevBtn.disabled = currentPage <= 1;
        nextBtn.disabled = currentPage >= total;
        lastBtn.disabled = currentPage >= total;

        // Update page size selector
        if (pageSizeSelect) {
            pageSizeSelect.value = pageSize;
        }
    }

    /**
     * Display logs for current page
     */
    displayCurrentPageLogs() {
        const { currentPage, pageSize, allLogs } = this.logsPagination;
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const pageLogs = allLogs.slice(startIndex, endIndex);

        this.displayLogs(pageLogs);
        this.updatePaginationControls();
    }

    /**
     * Display logs in the log entries container
     */
    displayLogs(logs) {
        const logEntries = document.getElementById('log-entries');
        if (!logEntries) return;

        // Clear existing content
        logEntries.innerHTML = '';

        if (!logs || logs.length === 0) {
            const noLogsElement = document.createElement('div');
            noLogsElement.className = 'log-entry info';
            noLogsElement.textContent = 'No logs available';
            logEntries.appendChild(noLogsElement);
            return;
        }

        logs.forEach((log, index) => {
            try {
                if (log && typeof log === 'object') {
                    const logElement = document.createElement('div');
                    const logLevel = (log.level || 'info').toLowerCase();
                    logElement.className = `log-entry log-${logLevel}`;
                    logElement.style.cursor = 'pointer';
                    
                    const timestamp = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
                    const level = log.level ? log.level.toUpperCase() : 'INFO';
                    const message = log.message || 'No message';
                    
                    // Create the main log content with expand icon
                    logElement.innerHTML = `
                        <div class="log-content">
                            <span class="log-timestamp">[${timestamp}]</span>
                            <span class="log-level">${level}</span>
                            <span class="log-message">${message}</span>
                            <span class="log-expand-icon">
                                <i class="fas fa-chevron-right"></i>
                            </span>
                        </div>
                    `;

                    // Add expandable details section
                    const detailsElement = document.createElement('div');
                    detailsElement.className = 'log-details';
                    detailsElement.style.display = 'none';
                    detailsElement.innerHTML = `
                        <div class="log-details-content">
                            <pre class="log-detail-json">${JSON.stringify(log, null, 2)}</pre>
                        </div>
                    `;
                    logElement.appendChild(detailsElement);

                    // Add click handler for expand/collapse
                    const logContent = logElement.querySelector('.log-content');
                    const expandIcon = logElement.querySelector('.log-expand-icon i');
                    
                    logContent.addEventListener('click', function (e) {
                        // Only toggle if not clicking a link or button inside
                        if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON') return;
                        
                        const expanded = logElement.classList.toggle('expanded');
                        if (detailsElement) {
                            detailsElement.style.display = expanded ? 'block' : 'none';
                        }
                        
                        // Update expand icon
                        if (expandIcon) {
                            expandIcon.className = expanded ? 'fas fa-chevron-down' : 'fas fa-chevron-right';
                        }
                    });

                    logEntries.appendChild(logElement);
                }
            } catch (logError) {
                console.error(`Error processing log entry at index ${index}:`, logError);
            }
        });
    }

    /**
     * Setup pagination event handlers
     */
    setupPaginationHandlers() {
        const firstBtn = document.getElementById('logs-first-page');
        const prevBtn = document.getElementById('logs-prev-page');
        const nextBtn = document.getElementById('logs-next-page');
        const lastBtn = document.getElementById('logs-last-page');
        const pageInput = document.getElementById('logs-page-input');
        const pageSizeSelect = document.getElementById('logs-page-size');

        if (firstBtn) firstBtn.addEventListener('click', () => this.goToPage(1));
        if (prevBtn) prevBtn.addEventListener('click', () => this.goToPage(this.logsPagination.currentPage - 1));
        if (nextBtn) nextBtn.addEventListener('click', () => this.goToPage(this.logsPagination.currentPage + 1));
        if (lastBtn) lastBtn.addEventListener('click', () => this.goToPage(this.logsPagination.totalPages));

        if (pageInput) {
            pageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const page = parseInt(pageInput.value);
                    if (page && page >= 1 && page <= this.logsPagination.totalPages) {
                        this.goToPage(page);
                    }
                }
            });
        }

        if (pageSizeSelect) {
            pageSizeSelect.addEventListener('change', (e) => {
                this.logsPagination.pageSize = parseInt(e.target.value);
                this.logsPagination.currentPage = 1;
                this.calculatePagination();
                this.displayCurrentPageLogs();
            });
        }
    }

    /**
     * Navigate to a specific page
     */
    goToPage(page) {
        if (page < 1 || page > this.logsPagination.totalPages) return;
        
        this.logsPagination.currentPage = page;
        this.displayCurrentPageLogs();
    }

    /**
     * Calculate pagination values
     */
    calculatePagination() {
        const { pageSize, totalRecords } = this.logsPagination;
        this.logsPagination.totalPages = Math.ceil(totalRecords / pageSize);
        
        // Ensure current page is within bounds
        if (this.logsPagination.currentPage > this.logsPagination.totalPages) {
            this.logsPagination.currentPage = this.logsPagination.totalPages || 1;
        }
    }

    /**
     * Hide a progress screen with a delay
     * @param {string} statusElementId - The ID of the status element to hide
     * @param {number} delay - Delay in milliseconds (default: 5000)
     */
    hideProgressScreenWithDelay(statusElementId, delay = 5000) {
        const statusElement = document.getElementById(statusElementId);
        if (!statusElement) return;
        
        // Clear any existing timeout for this element
        const timeoutKey = `hideTimeout_${statusElementId}`;
        if (this[timeoutKey]) {
            clearTimeout(this[timeoutKey]);
        }
        
        // Set new timeout to hide the progress screen
        this[timeoutKey] = setTimeout(() => {
            statusElement.style.display = 'none';
            delete this[timeoutKey]; // Clean up the timeout reference
            this.logger?.info(`Progress screen auto-hidden after delay: ${statusElementId}`);
        }, delay);
        
        this.logger?.info(`Progress screen will be hidden in ${delay}ms: ${statusElementId}`);
    }

    /**
     * Set up event handlers for progress screen close buttons
     */
    setupProgressCloseButtons() {
        const progressScreens = [
            { buttonId: 'close-import-status', statusId: 'import-status', viewName: 'import' },
            { buttonId: 'close-export-status', statusId: 'export-status', viewName: 'export' },
            { buttonId: 'close-delete-csv-status', statusId: 'delete-csv-status', viewName: 'delete-csv' },
            { buttonId: 'close-modify-status', statusId: 'modify-status', viewName: 'modify' }
        ];

        progressScreens.forEach(({ buttonId, statusId, viewName }) => {
            const closeButton = document.getElementById(buttonId);
            const statusElement = document.getElementById(statusId);
            
            if (closeButton && statusElement) {
                closeButton.addEventListener('click', () => {
                    // Clear any pending hide timeout
                    const timeoutKey = `hideTimeout_${statusId}`;
                    if (this[timeoutKey]) {
                        clearTimeout(this[timeoutKey]);
                        delete this[timeoutKey];
                    }
                    
                    // Hide the progress screen
                    statusElement.style.display = 'none';
                    
                    // Reset the status to prevent it from showing again on page reload
                    const currentStatus = this.lastRunStatus[viewName];
                    if (currentStatus && currentStatus.status === 'In Progress') {
                        this.updateLastRunStatus(viewName, currentStatus.operation || 'Operation', 'Ready', 'Operation stopped by user');
                    }
                    
                    this.logger?.info(`Progress screen closed: ${statusId}`);
                    this.showNotification(`${viewName.charAt(0).toUpperCase() + viewName.slice(1)} progress screen closed`, 'info');
                });
            }
        });
    }

    /**
     * Load persisted status from localStorage
     */
    loadPersistedStatus() {
        try {
            const saved = localStorage.getItem('pingone-import-last-status');
            if (saved) {
                const parsed = JSON.parse(saved);
                this.lastRunStatus = { ...this.lastRunStatus, ...parsed };
            }
        } catch (error) {
            this.logger.error('Failed to load persisted status:', error);
        }
    }

    /**
     * Save status to localStorage
     */
    savePersistedStatus() {
        try {
            localStorage.setItem('pingone-import-last-status', JSON.stringify(this.lastRunStatus));
        } catch (error) {
            this.logger.error('Failed to save persisted status:', error);
        }
    }

    /**
     * Update the last run status for a view
     * @param {string} viewName - The view name (import, export, delete-csv, modify, settings, logs)
     * @param {string} operation - The operation performed
     * @param {string} status - The status (Ready, In Progress, Completed, Failed, Error)
     * @param {string} details - Additional details about the operation
     * @param {Object} results - Results object with counts/data
     */
    updateLastRunStatus(viewName, operation, status, details = null, results = null) {
        if (!this.lastRunStatus[viewName]) {
            this.lastRunStatus[viewName] = {};
        }
        
        this.lastRunStatus[viewName] = {
            operation,
            status,
            timestamp: new Date().toISOString(),
            details,
            results
        };
        
        // Save to localStorage
        this.savePersistedStatus();
        
        // Update the UI if this view is currently active or always show persistent status
        this.displayLastRunStatus(viewName);
    }

    /**
     * Display the last run status for a specific view
     * @param {string} viewName - The view name
     */
    displayLastRunStatus(viewName) {
        const status = this.lastRunStatus[viewName];
        if (!status || status.operation === 'None') return;

        // For operation views (import, export, delete-csv, modify), 
        // show the progress section if the operation is currently "In Progress" OR if it was recently completed
        if (['import', 'export', 'delete-csv', 'modify'].includes(viewName)) {
            const statusElement = document.getElementById(`${viewName}-status`);
            
            // Show the progress screen if the operation is currently in progress OR if it was completed recently
            if (statusElement) {
                if (status.status === 'In Progress') {
                    statusElement.style.display = 'block';
                    this.updateOperationStatus(viewName, status);
                } else if (status.status === 'Completed' || status.status === 'Ready') {
                    // Keep the progress screen open even after completion so users can see results
                    statusElement.style.display = 'block';
                    this.updateOperationStatus(viewName, status);
                }
                // For other statuses (Failed, Cancelled, etc.), keep the screen open to show error details
                else {
                    statusElement.style.display = 'block';
                    this.updateOperationStatus(viewName, status);
                }
            }
        } else {
            // For logs and settings, always show status
            const statusElement = document.getElementById(`${viewName}-status`);
            if (!statusElement) return;

            statusElement.style.display = 'block';
            
            if (viewName === 'logs') {
                this.updateLogsStatus(status);
            } else if (viewName === 'settings') {
                this.updateSettingsLastRunStatus(status);
            }
        }
    }

    /**
     * Update logs view status
     */
    updateLogsStatus(status) {
        const elements = {
            operation: document.getElementById('logs-last-operation'),
            status: document.getElementById('logs-operation-status'),
            timestamp: document.getElementById('logs-operation-timestamp'),
            details: document.getElementById('logs-operation-details')
        };

        if (elements.operation) elements.operation.textContent = status.operation;
        if (elements.status) {
            elements.status.textContent = status.status;
            elements.status.className = `stat-value ${this.getStatusClass(status.status)}`;
        }
        if (elements.timestamp) {
            elements.timestamp.textContent = status.timestamp ? 
                new Date(status.timestamp).toLocaleString() : '-';
        }
        if (elements.details) elements.details.textContent = status.details || '-';
    }

    /**
     * Update settings view last run status
     */
    updateSettingsLastRunStatus(status) {
        // Add a last operation status to settings if it doesn't exist
        let lastOpElement = document.getElementById('settings-last-operation-status');
        if (!lastOpElement) {
            const container = document.querySelector('.settings-status-container');
            if (container) {
                lastOpElement = document.createElement('div');
                lastOpElement.id = 'settings-last-operation-status';
                lastOpElement.className = 'settings-last-operation-status';
                lastOpElement.innerHTML = `
                    <div class="status-details">
                        <span class="status-icon">📋</span>
                        <span class="status-message">
                            <strong>Last Operation:</strong> <span id="settings-last-op-text">${status.operation}</span> - 
                            <span id="settings-last-op-status" class="${this.getStatusClass(status.status)}">${status.status}</span>
                            <small class="timestamp">${status.timestamp ? new Date(status.timestamp).toLocaleString() : ''}</small>
                        </span>
                    </div>
                `;
                container.appendChild(lastOpElement);
            }
        } else {
            // Update existing elements
            const opText = document.getElementById('settings-last-op-text');
            const opStatus = document.getElementById('settings-last-op-status');
            const timestamp = lastOpElement.querySelector('.timestamp');
            
            if (opText) opText.textContent = status.operation;
            if (opStatus) {
                opStatus.textContent = status.status;
                opStatus.className = this.getStatusClass(status.status);
            }
            if (timestamp) {
                timestamp.textContent = status.timestamp ? new Date(status.timestamp).toLocaleString() : '';
            }
        }
    }

    /**
     * Update operation status for import/export/delete/modify views
     */
    updateOperationStatus(viewName, status) {
        // Update the main status text
        const statusTextElement = document.getElementById(`${viewName}-progress-text`);
        if (statusTextElement) {
            statusTextElement.textContent = `${status.operation} - ${status.status}`;
            statusTextElement.className = `stat-value ${this.getStatusClass(status.status)}`;
        }

        // If we have results, update the counters
        if (status.results) {
            const counters = ['success', 'failed', 'skipped'];
            counters.forEach(counter => {
                const element = document.getElementById(`${viewName}-${counter}-count`);
                if (element && status.results[counter] !== undefined) {
                    element.textContent = status.results[counter];
                }
            });

            // Update progress count if available
            const progressCountElement = document.getElementById(`${viewName}-progress-count`);
            if (progressCountElement && status.results.total !== undefined) {
                const processed = (status.results.success || 0) + (status.results.failed || 0) + (status.results.skipped || 0);
                progressCountElement.textContent = `${processed} of ${status.results.total} users`;
            }
        }

        // Add timestamp info
        const timestampElement = document.getElementById(`${viewName}-timestamp`);
        if (!timestampElement && status.timestamp) {
            const statsContainer = document.getElementById(`${viewName}-stats`);
            if (statsContainer) {
                const timestampDiv = document.createElement('div');
                timestampDiv.className = 'stat-item';
                timestampDiv.innerHTML = `
                    <span class="stat-label">Last Run:</span>
                    <span id="${viewName}-timestamp" class="stat-value">${new Date(status.timestamp).toLocaleString()}</span>
                `;
                statsContainer.appendChild(timestampDiv);
            }
        } else if (timestampElement) {
            timestampElement.textContent = status.timestamp ? new Date(status.timestamp).toLocaleString() : '-';
        }
    }

    /**
     * Get CSS class for status
     */
    getStatusClass(status) {
        switch (status.toLowerCase()) {
            case 'completed':
            case 'success':
                return 'success';
            case 'failed':
            case 'error':
                return 'error';
            case 'in progress':
            case 'running':
                return 'info';
            case 'cancelled':
            case 'skipped':
                return 'warning';
            default:
                return '';
        }
    }

    /**
     * Show all persisted status sections when switching views
     */
    showPersistedStatus() {
        Object.keys(this.lastRunStatus).forEach(viewName => {
            this.displayLastRunStatus(viewName);
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
            
            // Always display persisted status for the current view
            this.displayLastRunStatus(viewName);
            
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
        
        // Update counter to show loading
        const counter = document.getElementById('logs-counter');
        if (counter) {
            counter.textContent = 'Loading...';
        }
        
        try {
            // Fetch logs from the UI logs endpoint
            safeLog('Fetching logs from /api/logs/ui...', 'debug');
            const response = await fetch('/api/logs/ui?limit=1000'); // Fetch more logs for pagination
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const responseData = await response.json();
            safeLog('Received logs from server', 'debug', { count: responseData.logs?.length });
            
            // Clear loading indicator
            logEntries.innerHTML = '';
            
            if (responseData.success === true && Array.isArray(responseData.logs)) {
                if (responseData.logs.length === 0) {
                    const noLogsElement = document.createElement('div');
                    noLogsElement.className = 'log-entry info';
                    noLogsElement.textContent = 'No logs available';
                    logEntries.appendChild(noLogsElement);
                    
                    // Update pagination
                    this.logsPagination.allLogs = [];
                    this.logsPagination.totalRecords = 0;
                    this.calculatePagination();
                    this.updatePaginationControls();
                    return;
                }
                
                // Process logs in chronological order (oldest first, newest last)
                // Reverse the array since server returns newest first, but we want oldest first
                const logsToProcess = [...responseData.logs].reverse();

                // Store all logs for pagination
                this.logsPagination.allLogs = logsToProcess;
                this.logsPagination.totalRecords = logsToProcess.length;
                this.calculatePagination();
                
                // Display current page logs
                this.displayCurrentPageLogs();
                
                // Setup pagination handlers if not already done
                this.setupPaginationHandlers();
                
            } else {
                safeLog('No valid log entries found in response', 'warn');
                const noLogsElement = document.createElement('div');
                noLogsElement.className = 'log-entry info';
                noLogsElement.textContent = 'No logs available';
                logEntries.appendChild(noLogsElement);
                
                // Update pagination
                this.logsPagination.allLogs = [];
                this.logsPagination.totalRecords = 0;
                this.calculatePagination();
                this.updatePaginationControls();
            }
        } catch (error) {
            safeLog(`Error fetching logs: ${error.message}`, 'error', { 
                error: {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                }
            });
            
            const errorElement = document.createElement('div');
            errorElement.className = 'log-entry error';
            errorElement.textContent = `Error loading logs: ${error.message}`;
            logEntries.appendChild(errorElement);
            
            // Update pagination
            this.logsPagination.allLogs = [];
            this.logsPagination.totalRecords = 0;
            this.calculatePagination();
            this.updatePaginationControls();
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
        
        // Set importing flag
        this.isImporting = true;
        
        // Update last run status
        this.updateLastRunStatus('import', 'User Import', 'In Progress', `Importing ${totalUsers} users`, { total: totalUsers, success: 0, failed: 0, skipped: 0 });
        
        // Reset all counters
        this.updateImportProgress(0, totalUsers, 'Starting import...', {
            success: 0,
            failed: 0,
            skipped: 0
        });
        
        // Add initial progress log entry
        this.addProgressLogEntry(`Starting import of ${totalUsers} users`, 'info', { total: totalUsers });
        
        // Set up progress log handlers
        this.setupProgressLogHandlers();
    }

    /**
     * Update import progress
     * @param {number} current - Current progress
     * @param {number} total - Total items
     * @param {string} status - Status message
     * @param {Object} results - Results object
     */
    updateImportProgress(current, total, status, results) {
        // Update progress bar
        const progressBar = document.getElementById('import-progress');
        const progressPercent = document.getElementById('import-progress-percent');
        const progressText = document.getElementById('import-progress-text');
        const progressCount = document.getElementById('import-progress-count');
        
        if (progressBar && total > 0) {
            const percent = Math.round((current / total) * 100);
            progressBar.style.width = `${percent}%`;
            progressBar.setAttribute('aria-valuenow', percent);
            if (progressPercent) progressPercent.textContent = `${percent}%`;
        }
        
        if (progressText) progressText.textContent = status;
        if (progressCount) progressCount.textContent = `${current} of ${total} users`;
        
        // Update result counters
        if (results) {
            const successElement = document.getElementById('import-success-count');
            const failedElement = document.getElementById('import-failed-count');
            const skippedElement = document.getElementById('import-skipped-count');
            
            if (successElement) successElement.textContent = results.success || 0;
            if (failedElement) failedElement.textContent = results.failed || 0;
            if (skippedElement) skippedElement.textContent = results.skipped || 0;
        }
        
        // Add progress log entry
        let logType = 'info';
        if (status.includes('completed') || status.includes('success')) {
            logType = 'success';
        } else if (status.includes('failed') || status.includes('error')) {
            logType = 'error';
        } else if (status.includes('skipped')) {
            logType = 'warning';
        } else if (status.includes('Importing')) {
            logType = 'progress';
        }
        
        this.addProgressLogEntry(status, logType, results);
        
        // Update persistent status
        const operationStatus = current >= total ? 'Completed' : 'In Progress';
        this.updateLastRunStatus('import', 'User Import', operationStatus, status, { 
            total, 
            success: results?.success || 0, 
            failed: results?.failed || 0, 
            skipped: results?.skipped || 0 
        });
    }
    
    /**
     * Reset the import state
     */
    resetImportState() {
        // Set importing flag to false
        this.isImporting = false;
        
        // Clear the "In Progress" status to prevent progress screen from showing on future page loads
        const currentStatus = this.lastRunStatus['import'];
        if (currentStatus && currentStatus.status === 'In Progress') {
            this.updateLastRunStatus('import', currentStatus.operation || 'Import', 'Ready', 'Import stopped or completed');
        }
        
        // Progress screen will stay open until user manually closes it with X button
        // No automatic hiding
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
        
        // Only clear progress log if we're not currently importing
        // This prevents clearing the log during active imports
        if (!this.isImporting) {
            this.clearProgressLog();
        }
    }

    /**
     * Set the import button state
     * @param {boolean} enabled - Whether the button should be enabled
     * @param {string} [text] - Optional button text
     */
    setImportButtonState(enabled, text) {
        const importButton = document.getElementById('start-import-btn');
        const importButtonBottom = document.getElementById('start-import-btn-bottom');
        
        if (importButton) {
            importButton.disabled = !enabled;
            if (text) {
                importButton.textContent = text;
            }
        }
        
        if (importButtonBottom) {
            importButtonBottom.disabled = !enabled;
            if (text) {
                importButtonBottom.textContent = text;
            }
        }
    }
    
    /**
     * Show a success notification
     * @param {string} message - The message to display
     */
    showSuccess(message) {
        // Add green checkmark if not already present
        const messageWithCheckmark = message.startsWith('✅') ? message : `✅ ${message}`;
        this.showNotification(messageWithCheckmark, 'success');
    }
    
    /**
     * Show a warning notification
     * @param {string} message - The message to display
     */
    showWarning(message) {
        // Special handling for disclaimer warning
        if (message.includes('disclaimer')) {
            this.showDisclaimerWarning(message);
        } else {
            this.showNotification(message, 'warning');
        }
    }
    
    /**
     * Show a special disclaimer warning with light red background and longer duration
     * @param {string} message - The disclaimer warning message
     */
    showDisclaimerWarning(message) {
        console.log(`[disclaimer-warning] ${message}`);
        
        // Get or create notification container
        let notificationArea = document.getElementById('notification-area');
        if (!notificationArea) {
            console.warn('Notification area not found in the DOM');
            return;
        }
        
        // Create notification element with light red background
        const notification = document.createElement('div');
        notification.className = 'notification notification-disclaimer';
        notification.style.backgroundColor = '#ffe6e6'; // Light red background
        notification.style.borderColor = '#ff9999'; // Light red border
        notification.style.color = '#cc0000'; // Darker red text for contrast
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
        
        // Auto-remove after 10 seconds (twice as long as regular notifications)
        setTimeout(() => {
            if (notification.parentNode) {
                notification.classList.add('fade-out');
                setTimeout(() => notification.remove(), 300);
            }
        }, 10000);
        
        return notification;
    }
    
    /**
     * Show an error notification
     * @param {string} message - The message to display
     */
    showError(message) {
        this.showNotification(message, 'error');
    }

    /**
     * Show a specialized rate limit warning with enhanced information
     * @param {string} message - The basic rate limit message
     * @param {Object} [options] - Additional options for the rate limit warning
     * @param {boolean} [options.isRetrying=false] - Whether the request is being retried automatically
     * @param {number} [options.retryAttempt] - Current retry attempt number
     * @param {number} [options.maxRetries] - Maximum number of retry attempts
     * @param {number} [options.retryDelay] - Delay before next retry (in milliseconds)
     */
    showRateLimitWarning(message, options = {}) {
        const { isRetrying = false, retryAttempt, maxRetries, retryDelay } = options;
        
        // Check if we recently showed a rate limit warning
        const now = Date.now();
        if (this.lastRateLimitWarning && (now - this.lastRateLimitWarning) < this.rateLimitWarningCooldown) {
            // Skip showing the warning if it was shown recently
            return;
        }
        
        // Update the last warning time
        this.lastRateLimitWarning = now;
        
        let enhancedMessage = message;
        
        // Add retry information if available
        if (isRetrying && retryAttempt && maxRetries) {
            enhancedMessage += ` (Retry ${retryAttempt}/${maxRetries})`;
            if (retryDelay) {
                const delaySeconds = Math.ceil(retryDelay / 1000);
                enhancedMessage += ` - Waiting ${delaySeconds}s before retry`;
            }
        }
        
        // Add helpful context
        enhancedMessage += ' The system will pause slightly 💡 The system has automatically increased rate limits to handle more requests.';
        
        this.showNotification(enhancedMessage, 'warning');
    }
    
    /**
     * Show a notification
     * @param {string} message - The message to display
     * @param {string} type - The type of notification ('success', 'warning', 'error')
     */
    showNotification(message, type = 'info') {
        // Add green checkmark to success messages if not already present
        let displayMessage = message;
        if (type === 'success' && !message.startsWith('✅')) {
            displayMessage = `✅ ${message}`;
        }
        
        console.log(`[${type}] ${displayMessage}`);
        
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
                <span class="notification-message">${displayMessage}</span>
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
            'populationId': 'population-id',
            'rateLimit': 'rate-limit'
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
        
        // Setup progress close buttons
        this.setupProgressCloseButtons();
        
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
                    this.updateLogsOperationStatus('Clear Logs', true, 'Clearing log entries...');
                    
                    const response = await fetch('/api/logs/ui', { method: 'DELETE' });
                    const data = await response.json();
                    
                    if (data.success) {
                        this.updateLogsOperationStatus('Clear Logs', true, 'Logs cleared successfully');
                        this.showNotification('Logs cleared. Only UI logs are cleared. Server logs are not affected.', 'info');
                        await this.loadAndDisplayLogs();
                    } else {
                        this.updateLogsOperationStatus('Clear Logs', false, `Failed to clear logs: ${data.error || 'Unknown error'}`);
                        this.showNotification('Failed to clear logs: ' + (data.error || 'Unknown error'), 'error');
                    }
                } catch (error) {
                    this.updateLogsOperationStatus('Clear Logs', false, `Error clearing logs: ${error.message}`);
                    this.showNotification('Error clearing logs: ' + error.message, 'error');
                }
            });
        }
        
        // Setup pagination handlers
        this.setupPaginationHandlers();
        
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

    setDeleteCsvButtonState(enabled, text) {
        const deleteButton = document.getElementById('start-delete-csv-btn');
        if (deleteButton) {
            deleteButton.disabled = !enabled;
            if (text) {
                deleteButton.textContent = text;
            }
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
        // Progress screen will stay open until user manually closes it with X button
        // No automatic hiding
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

    setModifying(isModifying) {
        const modifyButton = document.getElementById('start-modify-btn');
        const cancelButton = document.getElementById('cancel-modify-btn');
        if (modifyButton) {
            modifyButton.disabled = isModifying;
            modifyButton.textContent = isModifying ? 'Modifying...' : 'Modify Users';
        }
        if (cancelButton) {
            cancelButton.style.display = isModifying ? 'inline-block' : 'none';
        }
    }

    setModifyCsvButtonState(enabled, text) {
        const modifyButton = document.getElementById('start-modify-btn');
        if (modifyButton) {
            modifyButton.disabled = !enabled;
            if (text) {
                modifyButton.textContent = text;
            }
        }
    }

    showModifyStatus(totalUsers) {
        const modifyStatus = document.getElementById('modify-status');
        if (modifyStatus) {
            modifyStatus.style.display = 'block';
        }
        this.updateModifyProgress(0, totalUsers, 'Starting modify operation...');
        this.resetModifyStats();
    }

    updateModifyProgress(current, total, status, progress = null) {
        const progressBar = document.getElementById('modify-progress');
        const progressPercent = document.getElementById('modify-progress-percent');
        const progressText = document.getElementById('modify-progress-text');
        const progressCount = document.getElementById('modify-progress-count');

        if (progressBar && progressPercent) {
            const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
            progressBar.style.width = `${percentage}%`;
            progressBar.setAttribute('aria-valuenow', percentage);
            progressPercent.textContent = `${percentage}%`;
        }

        if (progressText) {
            progressText.textContent = status || 'Processing...';
            console.log('Updated modify progress text:', status);
        } else {
            console.warn('modify-progress-text element not found');
        }

        if (progressCount) {
            progressCount.textContent = `${current} of ${total} users`;
        }

        // Also update stats if progress object is provided
        if (progress && typeof progress === 'object') {
            this.updateModifyStats(progress);
        }
    }

    updateModifyStats(stats) {
        const successCount = document.getElementById('modify-success-count');
        const createdCount = document.getElementById('modify-created-count');
        const failedCount = document.getElementById('modify-failed-count');
        const skippedCount = document.getElementById('modify-skipped-count');
        const noChangesCount = document.getElementById('modify-no-changes-count');

        if (successCount) successCount.textContent = stats.modified || 0;
        if (createdCount) createdCount.textContent = stats.created || 0;
        if (failedCount) failedCount.textContent = stats.failed || 0;
        if (skippedCount) skippedCount.textContent = stats.skipped || 0;
        if (noChangesCount) noChangesCount.textContent = stats.noChanges || 0;
    }

    resetModifyStats() {
        const successCount = document.getElementById('modify-success-count');
        const createdCount = document.getElementById('modify-created-count');
        const failedCount = document.getElementById('modify-failed-count');
        const skippedCount = document.getElementById('modify-skipped-count');
        const noChangesCount = document.getElementById('modify-no-changes-count');

        if (successCount) successCount.textContent = '0';
        if (createdCount) createdCount.textContent = '0';
        if (failedCount) failedCount.textContent = '0';
        if (skippedCount) skippedCount.textContent = '0';
        if (noChangesCount) noChangesCount.textContent = '0';
    }

    resetModifyProgress() {
        const progressBar = document.getElementById('modify-progress');
        const progressPercent = document.getElementById('modify-progress-percent');
        const progressText = document.getElementById('modify-progress-text');
        const progressCount = document.getElementById('modify-progress-count');

        if (progressBar) {
            progressBar.style.width = '0%';
            progressBar.setAttribute('aria-valuenow', 0);
        }
        if (progressPercent) progressPercent.textContent = '0%';
        if (progressText) progressText.textContent = 'Ready';
        if (progressCount) progressCount.textContent = '0 of 0 users';
    }

    resetModifyState() {
        this.setModifying(false);
        this.resetModifyProgress();
        this.resetModifyStats();
        
        // Progress screen will stay open until user manually closes it with X button
        // No automatic hiding
    }
    
    /**
     * Update the settings save status message
     * @param {string} message - The status message to display
     * @param {string} type - The type of status (success, error, warning, info)
     * @param {boolean} show - Whether to show or hide the status
     */
    updateSettingsSaveStatus(message, type = 'info', show = true) {
        const statusElement = document.getElementById('settings-save-status');
        const statusIcon = statusElement?.querySelector('.status-icon');
        const statusMessage = statusElement?.querySelector('.status-message');
        
        if (statusElement && statusIcon && statusMessage) {
            // Update the message
            statusMessage.textContent = message;
            
            // Update the icon based on type
            const icons = {
                success: '✅',
                error: '❌',
                warning: '⚠️',
                info: 'ℹ️'
            };
            statusIcon.textContent = icons[type] || icons.info;
            
            // Update the styling
            statusElement.className = `settings-save-status ${type}`;
            
            // Show or hide the status
            if (show) {
                statusElement.classList.add('show');
                statusElement.style.display = 'block';
            } else {
                statusElement.classList.remove('show');
                statusElement.style.display = 'none';
            }
        }
    }
    
    /**
     * Clear the settings save status
     */
    clearSettingsSaveStatus() {
        this.updateSettingsSaveStatus('', 'info', false);
    }

    // Export functionality UI methods
    showExportStatus() {
        const statusElement = document.getElementById('export-status');
        const startBtn = document.getElementById('start-export-btn');
        const cancelBtn = document.getElementById('cancel-export-btn');
        
        if (statusElement) statusElement.style.display = 'block';
        if (startBtn) startBtn.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'inline-block';
    }

    /**
     * Set the export button state and text
     * @param {boolean} isExporting - Whether export is in progress
     */
    setExporting(isExporting) {
        const exportButton = document.getElementById('start-export-btn');
        const cancelButton = document.getElementById('cancel-export-btn');
        
        if (exportButton) {
            exportButton.disabled = isExporting;
            // Update button text with icon
            exportButton.innerHTML = isExporting ? 
                '<i class="fas fa-spinner fa-spin"></i> Exporting...' : 
                '<i class="fas fa-download"></i> Export Users';
        }
        
        if (cancelButton) {
            cancelButton.style.display = isExporting ? 'inline-block' : 'none';
        }
    }

    hideExportStatus() {
        const startBtn = document.getElementById('start-export-btn');
        const cancelBtn = document.getElementById('cancel-export-btn');
        
        if (startBtn) startBtn.style.display = 'inline-block';
        if (cancelBtn) cancelBtn.style.display = 'none';
        
        // Progress screen will stay open until user manually closes it with X button
        // No automatic hiding
    }

    showExportButton() {
        const startBtn = document.getElementById('start-export-btn');
        const cancelBtn = document.getElementById('cancel-export-btn');
        
        if (startBtn) startBtn.style.display = 'inline-block';
        if (cancelBtn) cancelBtn.style.display = 'none';
    }

    updateExportProgress(current, total, message) {
        const progressElement = document.getElementById('export-progress');
        const progressPercent = document.getElementById('export-progress-percent');
        const progressText = document.getElementById('export-progress-text');
        const progressCount = document.getElementById('export-progress-count');
        
        if (progressElement && total > 0) {
            const percentage = Math.round((current / total) * 100);
            progressElement.style.width = `${percentage}%`;
            progressElement.setAttribute('aria-valuenow', current);
            progressElement.setAttribute('aria-valuemax', total);
        }
        
        if (progressPercent) {
            progressPercent.textContent = total > 0 ? `${Math.round((current / total) * 100)}%` : '0%';
        }
        
        if (progressText) {
            progressText.textContent = message || 'Exporting...';
        }
        
        if (progressCount) {
            progressCount.textContent = `${current} of ${total} users`;
        }
    }

    updateExportStats(stats) {
        const successCount = document.getElementById('export-success-count');
        const failedCount = document.getElementById('export-failed-count');
        const skippedCount = document.getElementById('export-skipped-count');
        const ignoredCount = document.getElementById('export-ignored-count');
        
        if (successCount) successCount.textContent = stats.exported || 0;
        if (failedCount) failedCount.textContent = stats.failed || 0;
        if (skippedCount) skippedCount.textContent = stats.skipped || 0;
        if (ignoredCount) ignoredCount.textContent = stats.ignored || 0;
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showInfo(message) {
        this.showNotification(message, 'info');
    }

    /**
     * Update logs operation status
     * @param {string} operation - The operation being performed
     * @param {boolean} success - Whether the operation was successful
     * @param {string} message - Status message
     */
    updateLogsOperationStatus(operation, success, message) {
        const status = success ? 'Completed' : 'Failed';
        this.updateLastRunStatus('logs', operation, status, message);
    }

    /**
     * Update file info in the UI (stub for compatibility)
     * @param {Object} fileInfo - File info object
     */
    updateFileInfo(fileInfo) {
        // Optionally implement UI update for file info, or leave as a no-op
        // Example: update an element with file name/size
        // console.log('updateFileInfo called', fileInfo);
    }

    /**
     * Add an entry to the progress log
     * @param {string} message - The progress message
     * @param {string} type - The type of entry (success, error, warning, info)
     * @param {Object} stats - Optional stats object
     */
    addProgressLogEntry(message, type = 'info', stats = null) {
        const timestamp = new Date().toLocaleTimeString();
        const entry = {
            timestamp,
            message,
            type,
            stats
        };
        
        // Add to progress log array
        this.progressLog.push(entry);
        
        // Keep only the last maxProgressLogEntries
        if (this.progressLog.length > this.maxProgressLogEntries) {
            this.progressLog = this.progressLog.slice(-this.maxProgressLogEntries);
        }
        
        // Update the display
        this.updateProgressLogDisplay();
    }
    
    /**
     * Update the progress log display
     */
    updateProgressLogDisplay() {
        const logContainer = document.getElementById('progress-log-entries');
        if (!logContainer) return;
        
        // Clear existing entries
        logContainer.innerHTML = '';
        
        // Add all entries
        this.progressLog.forEach(entry => {
            const entryElement = document.createElement('div');
            entryElement.className = `progress-log-entry ${entry.type}`;
            
            const icon = this.getProgressLogIcon(entry.type);
            const statsText = entry.stats ? this.formatProgressStats(entry.stats) : '';
            
            entryElement.innerHTML = `
                <span class="entry-timestamp">${entry.timestamp}</span>
                <span class="entry-icon">${icon}</span>
                <span class="entry-message">${entry.message}</span>
                ${statsText ? `<span class="entry-stats">${statsText}</span>` : ''}
            `;
            
            logContainer.appendChild(entryElement);
        });
        
        // Scroll to bottom to show latest entries
        logContainer.scrollTop = logContainer.scrollHeight;
    }
    
    /**
     * Get the appropriate icon for a progress log entry type
     * @param {string} type - The entry type
     * @returns {string} The icon HTML
     */
    getProgressLogIcon(type) {
        const icons = {
            success: '<i class="fas fa-check-circle"></i>',
            error: '<i class="fas fa-exclamation-circle"></i>',
            warning: '<i class="fas fa-exclamation-triangle"></i>',
            info: '<i class="fas fa-info-circle"></i>',
            progress: '<i class="fas fa-spinner fa-spin"></i>'
        };
        return icons[type] || icons.info;
    }
    
    /**
     * Format progress stats for display
     * @param {Object} stats - The stats object
     * @returns {string} Formatted stats string
     */
    formatProgressStats(stats) {
        const parts = [];
        if (stats.success !== undefined) parts.push(`✅ ${stats.success}`);
        if (stats.failed !== undefined) parts.push(`❌ ${stats.failed}`);
        if (stats.skipped !== undefined) parts.push(`⏭️ ${stats.skipped}`);
        if (stats.total !== undefined) parts.push(`📊 ${stats.total}`);
        return parts.join(' ');
    }
    
    /**
     * Clear the progress log
     */
    clearProgressLog() {
        this.progressLog = [];
        this.updateProgressLogDisplay();
        this.logger?.info('Progress log cleared');
    }
    
    /**
     * Set up progress log event handlers
     */
    setupProgressLogHandlers() {
        const clearButton = document.getElementById('clear-progress-log');
        if (clearButton) {
            clearButton.addEventListener('click', () => {
                this.clearProgressLog();
                this.showNotification('Progress log cleared', 'info');
            });
        }
    }

    /**
     * Show or hide the import status section
     * @param {boolean} isImporting - Whether import is in progress
     */
    setImporting(isImporting) {
        this.isImporting = isImporting;
        
        const importButton = document.getElementById('start-import-btn');
        const importButtonBottom = document.getElementById('start-import-btn-bottom');
        const cancelButton = document.getElementById('cancel-import-btn');
        const cancelButtonBottom = document.getElementById('cancel-import-btn-bottom');
        
        if (importButton) {
            importButton.disabled = isImporting;
            importButton.textContent = isImporting ? 'Importing...' : 'Import Users (v1.0.2)';
        }
        
        if (importButtonBottom) {
            importButtonBottom.disabled = isImporting;
            importButtonBottom.textContent = isImporting ? 'Importing...' : 'Import Users (v1.0.2)';
        }
        
        if (cancelButton) {
            cancelButton.style.display = isImporting ? 'inline-block' : 'none';
        }
        
        if (cancelButtonBottom) {
            cancelButtonBottom.style.display = isImporting ? 'inline-block' : 'none';
        }
    }
}

// No need for module.exports with ES modules
