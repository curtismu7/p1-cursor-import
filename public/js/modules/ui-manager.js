import { Logger } from './logger.js';

export class UIManager {
    constructor(logger) {
        this.logger = logger;
        this.currentView = 'import';
        this.isImporting = false;
        this.isExporting = false;
        this.isDeleting = false;
        this.isModifying = false;
        this.isPopulationDeleting = false;
        
        // Navigation elements
        this.navItems = [];
        
        // Progress tracking
        this.lastRunStatus = {};
    }

    async init() {
        try {
            // Initialize navigation
            this.navItems = document.querySelectorAll('[data-view]');
            
            // Initialize progress tracking
            this.lastRunStatus = {
                import: { status: 'idle', message: 'No import run yet' },
                export: { status: 'idle', message: 'No export run yet' },
                delete: { status: 'idle', message: 'No delete run yet' },
                modify: { status: 'idle', message: 'No modify run yet' },
                'population-delete': { status: 'idle', message: 'No population delete run yet' }
            };
            
        } catch (error) {
            this.logger.error('UI Manager initialization error:', error);
            throw error;
        }
    }

    showSuccess(message, details = '') {
        this.showNotification('success', message, details);
    }

    showError(message, details = '') {
        this.showNotification('error', message, details);
    }

    showWarning(message, details = '') {
        this.showNotification('warning', message, details);
    }

    showInfo(message, details = '') {
        this.showNotification('info', message, details);
    }

    showNotification(type, message, details = '') {
        try {
            const notification = document.createElement('div');
            notification.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show`;
            notification.innerHTML = `
                <strong>${message}</strong>
                ${details ? `<br><small>${details}</small>` : ''}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            `;
            
            // Use the correct notification area
            const container = document.getElementById('notification-area');
            if (container) {
                container.appendChild(notification);
                
                // Auto-remove after 5 seconds
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 5000);
            }
        } catch (error) {
            console.error('Error showing notification:', error);
        }
    }

    updateConnectionStatus(status, message = '') {
        try {
            const statusElement = document.getElementById('connection-status');
            if (!statusElement) return;
            
            const iconElement = statusElement.querySelector('.status-icon');
            const messageElement = statusElement.querySelector('.status-message');
            
            if (iconElement) {
                iconElement.className = `status-icon fas ${this.getStatusIcon(status)}`;
            }
            
            if (messageElement) {
                messageElement.textContent = message || this.getDefaultStatusMessage(status);
            }
            
            statusElement.className = `connection-status ${status}`;
            
        } catch (error) {
            console.error('Error updating connection status:', error);
        }
    }

    updateHomeTokenStatus(show, message = '') {
        try {
            const tokenStatusElement = document.getElementById('home-token-status');
            if (!tokenStatusElement) return;
            
            if (show) {
                tokenStatusElement.style.display = 'block';
                const messageElement = tokenStatusElement.querySelector('.token-status-message');
                if (messageElement) {
                    messageElement.textContent = message;
                }
            } else {
                tokenStatusElement.style.display = 'none';
            }
            
        } catch (error) {
            console.error('Error updating home token status:', error);
        }
    }

    updateSettingsSaveStatus(message, type = 'info') {
        try {
            const statusElement = document.getElementById('settings-connection-status');
            if (!statusElement) return;
            
            const iconElement = statusElement.querySelector('.status-icon');
            const messageElement = statusElement.querySelector('.status-message');
            
            if (iconElement) {
                iconElement.className = `status-icon fas ${this.getStatusIcon(type)}`;
            }
            
            if (messageElement) {
                messageElement.textContent = message;
            }
            
            statusElement.className = `settings-connection-status ${type}`;
            
        } catch (error) {
            console.error('Error updating settings save status:', error);
        }
    }

    getStatusIcon(status) {
        const icons = {
            connected: 'fa-check-circle text-success',
            disconnected: 'fa-times-circle text-danger',
            connecting: 'fa-spinner fa-spin text-warning',
            error: 'fa-exclamation-triangle text-danger',
            success: 'fa-check-circle text-success',
            warning: 'fa-exclamation-triangle text-warning',
            info: 'fa-info-circle text-info'
        };
        return icons[status] || 'fa-question-circle text-muted';
    }

    getDefaultStatusMessage(status) {
        const messages = {
            connected: 'Connected to PingOne',
            disconnected: 'Not connected to PingOne',
            connecting: 'Connecting to PingOne...',
            error: 'Connection error',
            success: 'Operation completed successfully',
            warning: 'Warning',
            info: 'Information'
        };
        return messages[status] || 'Unknown status';
    }

    showImportStatus(totalUsers, populationName = '') {
        // Show modal overlay
        const overlay = document.getElementById('import-progress-modal-overlay');
        if (overlay) overlay.style.display = 'flex';
        
        const importStatus = document.getElementById('import-status');
        if (importStatus) {
            importStatus.style.display = 'block';
        }
        
        this.isImporting = true;
        this.updateLastRunStatus('import', 'User Import', 'In Progress', `Importing ${totalUsers} users`, { total: totalUsers, success: 0, failed: 0, skipped: 0 });
        this.updateImportProgress(0, totalUsers, 'Starting import...', {}, populationName);
    }

    updateImportProgress(current, total, message, counts = {}, populationName = '') {
        const progressBar = document.getElementById('import-progress');
        const progressPercent = document.getElementById('import-progress-percent');
        const progressText = document.getElementById('import-progress-text');
        const progressCount = document.getElementById('import-progress-count');
        const successCount = document.getElementById('import-success-count');
        const failedCount = document.getElementById('import-failed-count');
        const skippedCount = document.getElementById('import-skipped-count');
        const populationNameElement = document.getElementById('import-population-name');

        // Ensure percent is always defined before use
        const percent = total > 0 ? (current / total) * 100 : 0;

        if (progressBar) {
            progressBar.style.width = `${percent}%`;
            progressBar.setAttribute('aria-valuenow', percent);
        }
        if (progressPercent) progressPercent.textContent = `${Math.round(percent)}%`;
        // Only append population name if defined and non-empty
        if (progressText) progressText.textContent = `${message}` + (populationName ? ` - ${populationName}` : '');
        if (progressCount) progressCount.textContent = `${current}/${total}`;
        
        // Update counts
        if (successCount) successCount.textContent = counts.success || 0;
        if (failedCount) failedCount.textContent = counts.failed || 0;
        if (skippedCount) skippedCount.textContent = counts.skipped || 0;
        
        // Update population name
        if (populationNameElement && populationName) {
            populationNameElement.textContent = populationName;
            populationNameElement.setAttribute('data-content', populationName);
        }

        // Add progress log entry
        this.addProgressLogEntry(message, 'info', counts, 'import');
        
        // Update last run status with current progress
        this.updateLastRunStatus('import', 'User Import', 'In Progress', message, counts);
    }

    resetImportProgress() {
        const progressBar = document.getElementById('import-progress');
        const progressPercent = document.getElementById('import-progress-percent');
        const progressText = document.getElementById('import-progress-text');
        const progressCount = document.getElementById('import-progress-count');
        const successCount = document.getElementById('import-success-count');
        const failedCount = document.getElementById('import-failed-count');
        const skippedCount = document.getElementById('import-skipped-count');
        const populationNameElement = document.getElementById('import-population-name');

        if (progressBar) {
            progressBar.style.width = '0%';
            progressBar.setAttribute('aria-valuenow', 0);
        }
        if (progressPercent) progressPercent.textContent = '0%';
        if (progressText) progressText.textContent = 'Ready to import';
        if (progressCount) progressCount.textContent = '0/0';
        if (successCount) successCount.textContent = '0';
        if (failedCount) failedCount.textContent = '0';
        if (skippedCount) skippedCount.textContent = '0';
        
        // Population name
        if (populationNameElement) {
            populationNameElement.textContent = 'Not selected';
            populationNameElement.setAttribute('data-content', 'Not selected');
        }
    }

    showExportStatus() {
        const overlay = document.getElementById('export-progress-modal-overlay');
        if (overlay) overlay.style.display = 'flex';
        
        const exportStatus = document.getElementById('export-status');
        if (exportStatus) {
            exportStatus.style.display = 'block';
        }
        
        this.isExporting = true;
        this.updateLastRunStatus('export', 'User Export', 'In Progress', 'Starting export...', { total: 0, success: 0, failed: 0, skipped: 0 });
        this.updateExportProgress(0, 0, 'Starting export...');
    }

    updateExportProgress(current, total, message, counts = {}) {
        const progressBar = document.getElementById('export-progress');
        const progressPercent = document.getElementById('export-progress-percent');
        const progressText = document.getElementById('export-progress-text');
        const progressCount = document.getElementById('export-progress-count');
        const successCount = document.getElementById('export-success-count');
        const failedCount = document.getElementById('export-failed-count');
        const skippedCount = document.getElementById('export-skipped-count');

        const percent = total > 0 ? (current / total) * 100 : 0;

        if (progressBar) {
            progressBar.style.width = `${percent}%`;
            progressBar.setAttribute('aria-valuenow', percent);
        }
        if (progressPercent) progressPercent.textContent = `${Math.round(percent)}%`;
        if (progressText) progressText.textContent = message;
        if (progressCount) progressCount.textContent = `${current}/${total}`;
        
        if (successCount) successCount.textContent = counts.success || 0;
        if (failedCount) failedCount.textContent = counts.failed || 0;
        if (skippedCount) skippedCount.textContent = counts.skipped || 0;

        this.addProgressLogEntry(message, 'info', counts, 'export');
        this.updateLastRunStatus('export', 'User Export', 'In Progress', message, counts);
    }

    resetExportProgress() {
        const progressBar = document.getElementById('export-progress');
        const progressPercent = document.getElementById('export-progress-percent');
        const progressText = document.getElementById('export-progress-text');
        const progressCount = document.getElementById('export-progress-count');
        const successCount = document.getElementById('export-success-count');
        const failedCount = document.getElementById('export-failed-count');
        const skippedCount = document.getElementById('export-skipped-count');

        if (progressBar) {
            progressBar.style.width = '0%';
            progressBar.setAttribute('aria-valuenow', 0);
        }
        if (progressPercent) progressPercent.textContent = '0%';
        if (progressText) progressText.textContent = 'Ready to export';
        if (progressCount) progressCount.textContent = '0/0';
        if (successCount) successCount.textContent = '0';
        if (failedCount) failedCount.textContent = '0';
        if (skippedCount) skippedCount.textContent = '0';
    }

    showDeleteStatus(totalUsers) {
        const overlay = document.getElementById('delete-progress-modal-overlay');
        if (overlay) overlay.style.display = 'flex';
        
        const deleteStatus = document.getElementById('delete-status');
        if (deleteStatus) {
            deleteStatus.style.display = 'block';
        }
        
        this.isDeleting = true;
        this.updateLastRunStatus('delete', 'User Delete', 'In Progress', `Deleting ${totalUsers} users`, { total: totalUsers, success: 0, failed: 0, skipped: 0 });
        this.updateDeleteProgress(0, totalUsers, 'Starting delete...');
    }

    updateDeleteProgress(current, total, message, counts = {}) {
        const progressBar = document.getElementById('delete-progress');
        const progressPercent = document.getElementById('delete-progress-percent');
        const progressText = document.getElementById('delete-progress-text');
        const progressCount = document.getElementById('delete-progress-count');
        const successCount = document.getElementById('delete-success-count');
        const failedCount = document.getElementById('delete-failed-count');
        const skippedCount = document.getElementById('delete-skipped-count');

        const percent = total > 0 ? (current / total) * 100 : 0;

        if (progressBar) {
            progressBar.style.width = `${percent}%`;
            progressBar.setAttribute('aria-valuenow', percent);
        }
        if (progressPercent) progressPercent.textContent = `${Math.round(percent)}%`;
        if (progressText) progressText.textContent = message;
        if (progressCount) progressCount.textContent = `${current}/${total}`;
        
        if (successCount) successCount.textContent = counts.success || 0;
        if (failedCount) failedCount.textContent = counts.failed || 0;
        if (skippedCount) skippedCount.textContent = counts.skipped || 0;

        this.addProgressLogEntry(message, 'info', counts, 'delete');
        this.updateLastRunStatus('delete', 'User Delete', 'In Progress', message, counts);
    }

    resetDeleteProgress() {
        const progressBar = document.getElementById('delete-progress');
        const progressPercent = document.getElementById('delete-progress-percent');
        const progressText = document.getElementById('delete-progress-text');
        const progressCount = document.getElementById('delete-progress-count');
        const successCount = document.getElementById('delete-success-count');
        const failedCount = document.getElementById('delete-failed-count');
        const skippedCount = document.getElementById('delete-skipped-count');

        if (progressBar) {
            progressBar.style.width = '0%';
            progressBar.setAttribute('aria-valuenow', 0);
        }
        if (progressPercent) progressPercent.textContent = '0%';
        if (progressText) progressText.textContent = 'Ready to delete';
        if (progressCount) progressCount.textContent = '0/0';
        if (successCount) successCount.textContent = '0';
        if (failedCount) failedCount.textContent = '0';
        if (skippedCount) skippedCount.textContent = '0';
    }

    showModifyStatus(totalUsers) {
        const overlay = document.getElementById('modify-progress-modal-overlay');
        if (overlay) overlay.style.display = 'flex';
        
        const modifyStatus = document.getElementById('modify-status');
        if (modifyStatus) {
            modifyStatus.style.display = 'block';
        }
        
        this.isModifying = true;
        this.updateLastRunStatus('modify', 'User Modify', 'In Progress', `Modifying ${totalUsers} users`, { total: totalUsers, success: 0, failed: 0, skipped: 0 });
        this.updateModifyProgress(0, totalUsers, 'Starting modify...');
    }

    updateModifyProgress(current, total, message, counts = {}) {
        const progressBar = document.getElementById('modify-progress');
        const progressPercent = document.getElementById('modify-progress-percent');
        const progressText = document.getElementById('modify-progress-text');
        const progressCount = document.getElementById('modify-progress-count');
        const successCount = document.getElementById('modify-success-count');
        const failedCount = document.getElementById('modify-failed-count');
        const skippedCount = document.getElementById('modify-skipped-count');

        const percent = total > 0 ? (current / total) * 100 : 0;

        if (progressBar) {
            progressBar.style.width = `${percent}%`;
            progressBar.setAttribute('aria-valuenow', percent);
        }
        if (progressPercent) progressPercent.textContent = `${Math.round(percent)}%`;
        if (progressText) progressText.textContent = message;
        if (progressCount) progressCount.textContent = `${current}/${total}`;
        
        if (successCount) successCount.textContent = counts.success || 0;
        if (failedCount) failedCount.textContent = counts.failed || 0;
        if (skippedCount) skippedCount.textContent = counts.skipped || 0;

        this.addProgressLogEntry(message, 'info', counts, 'modify');
        this.updateLastRunStatus('modify', 'User Modify', 'In Progress', message, counts);
    }

    resetModifyProgress() {
        const progressBar = document.getElementById('modify-progress');
        const progressPercent = document.getElementById('modify-progress-percent');
        const progressText = document.getElementById('modify-progress-text');
        const progressCount = document.getElementById('modify-progress-count');
        const successCount = document.getElementById('modify-success-count');
        const failedCount = document.getElementById('modify-failed-count');
        const skippedCount = document.getElementById('modify-skipped-count');

        if (progressBar) {
            progressBar.style.width = '0%';
            progressBar.setAttribute('aria-valuenow', 0);
        }
        if (progressPercent) progressPercent.textContent = '0%';
        if (progressText) progressText.textContent = 'Ready to modify';
        if (progressCount) progressCount.textContent = '0/0';
        if (successCount) successCount.textContent = '0';
        if (failedCount) failedCount.textContent = '0';
        if (skippedCount) skippedCount.textContent = '0';
    }

    showPopulationDeleteStatus(populationName) {
        const overlay = document.getElementById('population-delete-progress-modal-overlay');
        if (overlay) overlay.style.display = 'flex';
        
        const populationDeleteStatus = document.getElementById('population-delete-status');
        if (populationDeleteStatus) {
            populationDeleteStatus.style.display = 'block';
        }
        
        this.isPopulationDeleting = true;
        this.updateLastRunStatus('population-delete', 'Population Delete', 'In Progress', `Deleting population: ${populationName}`, { total: 1, success: 0, failed: 0, skipped: 0 });
        this.updatePopulationDeleteProgress(0, 1, 'Starting population delete...');
    }

    updatePopulationDeleteProgress(current, total, message, counts = {}) {
        const progressBar = document.getElementById('population-delete-progress');
        const progressPercent = document.getElementById('population-delete-progress-percent');
        const progressText = document.getElementById('population-delete-progress-text');
        const progressCount = document.getElementById('population-delete-progress-count');

        const percent = total > 0 ? (current / total) * 100 : 0;

        if (progressBar) {
            progressBar.style.width = `${percent}%`;
            progressBar.setAttribute('aria-valuenow', percent);
        }
        if (progressPercent) progressPercent.textContent = `${Math.round(percent)}%`;
        if (progressText) progressText.textContent = message;
        if (progressCount) progressCount.textContent = `${current}/${total}`;

        this.addProgressLogEntry(message, 'info', counts, 'population-delete');
        this.updateLastRunStatus('population-delete', 'Population Delete', 'In Progress', message, counts);
    }

    resetPopulationDeleteProgress() {
        const progressBar = document.getElementById('population-delete-progress');
        const progressPercent = document.getElementById('population-delete-progress-percent');
        const progressText = document.getElementById('population-delete-progress-text');
        const progressCount = document.getElementById('population-delete-progress-count');

        if (progressBar) {
            progressBar.style.width = '0%';
            progressBar.setAttribute('aria-valuenow', 0);
        }
        if (progressPercent) progressPercent.textContent = '0%';
        if (progressText) progressText.textContent = 'Ready to delete population';
        if (progressCount) progressCount.textContent = '0/0';
    }

    updateLastRunStatus(operation, title, status, message, counts = {}) {
        this.lastRunStatus[operation] = {
            title,
            status,
            message,
            counts,
            timestamp: new Date().toISOString()
        };
    }

    addProgressLogEntry(message, level, counts = {}, operation = '') {
        try {
            const logEntry = {
                timestamp: new Date().toISOString(),
                level,
                message,
                counts,
                operation
            };
            
            // Add to progress logs if available
            const progressLogs = document.getElementById('progress-logs');
            if (progressLogs) {
                const logElement = document.createElement('div');
                logElement.className = `log-entry log-${level}`;
                logElement.innerHTML = `
                    <span class="log-timestamp">${new Date().toLocaleTimeString()}</span>
                    <span class="log-level">${level.toUpperCase()}</span>
                    <span class="log-message">${message}</span>
                    ${counts.success !== undefined ? `<span class="log-success">✓ ${counts.success}</span>` : ''}
                    ${counts.failed !== undefined ? `<span class="log-failed">✗ ${counts.failed}</span>` : ''}
                    ${counts.skipped !== undefined ? `<span class="log-skipped">- ${counts.skipped}</span>` : ''}
                `;
                progressLogs.appendChild(logElement);
                progressLogs.scrollTop = progressLogs.scrollHeight;
            }
            
        } catch (error) {
            console.error('Error adding progress log entry:', error);
        }
    }

    refreshProgressData() {
        // Refresh progress data from server
        fetch('/api/queue/status')
            .then(response => response.json())
            .then(data => {
                if (data.success && data.jobs) {
                    // Update progress displays
                    this.updateProgressFromServer(data.jobs);
                }
            })
            .catch(error => {
                this.logger.error('Error refreshing progress data:', error);
            });
    }

    // Missing methods that were removed during cleanup
    
    async showView(viewName) {
        return await this.switchView(viewName);
    }

    switchView(viewName) {
        try {
            // Hide all views
            const views = document.querySelectorAll('[data-view]');
            views.forEach(view => {
                view.style.display = 'none';
            });

            // Show the requested view
            const targetView = document.querySelector(`[data-view="${viewName}"]`);
            if (!targetView) {
                throw new Error(`View '${viewName}' not found`);
            }
            targetView.style.display = 'block';

            // Update navigation
            this.navItems.forEach(item => {
                item.classList.remove('active');
            });
            const activeNav = document.querySelector(`[data-view="${viewName}"]`);
            if (activeNav) {
                activeNav.classList.add('active');
            }

            this.currentView = viewName;
            this.logger.info(`Switched to view: ${viewName}`);
            
            // Load logs if switching to logs view
            if (viewName === 'logs') {
                this.loadAndDisplayLogs();
            }
        } catch (error) {
            this.logger.error(`Error switching to view '${viewName}':`, error);
            throw error;
        }
    }

    async loadAndDisplayLogs() {
        try {
            const response = await fetch('/api/logs/ui?limit=200');
            const data = await response.json();
            
            if (data.success) {
                const logsContainer = document.getElementById('logs-container');
                if (logsContainer) {
                    logsContainer.innerHTML = '';
                    
                    if (data.logs && data.logs.length > 0) {
                        data.logs.forEach(log => {
                            const logEntry = document.createElement('div');
                            logEntry.className = `log-entry log-${log.level}`;
                            logEntry.innerHTML = `
                                <span class="log-timestamp">${new Date(log.timestamp).toLocaleString()}</span>
                                <span class="log-level">${log.level.toUpperCase()}</span>
                                <span class="log-message">${log.message}</span>
                            `;
                            logsContainer.appendChild(logEntry);
                        });
                    } else {
                        logsContainer.innerHTML = '<div class="no-logs">No logs available</div>';
                    }
                }
            } else {
                this.logger.error('Failed to load logs:', data.error);
            }
        } catch (error) {
            this.logger.error('Error loading logs:', error);
        }
    }

    addForm(formId, action, onSuccess, onError) {
        try {
            const form = document.getElementById(formId);
            if (!form) {
                this.logger.error(`Form with ID '${formId}' not found`);
                return;
            }

            // Store form handlers
            if (!this.forms) {
                this.forms = {};
            }
            this.forms[formId] = { action, onSuccess, onError };

            // Add submit handler
            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                await this.handleFormSubmit(formId, event);
            });

            this.logger.info(`Form '${formId}' added with action '${action}'`);
        } catch (error) {
            this.logger.error(`Error adding form '${formId}':`, error);
        }
    }

    async handleFormSubmit(formId, event) {
        try {
            const formConfig = this.forms[formId];
            if (!formConfig) {
                this.logger.error(`No configuration found for form '${formId}'`);
                return;
            }

            // Convert FormData to JSON for testing compatibility
            const formData = new FormData(event.target);
            const jsonData = {};
            for (const [key, value] of formData.entries()) {
                jsonData[key] = value;
            }

            const response = await fetch(formConfig.action, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(jsonData)
            });

            const data = await response.json();

            if (data.success) {
                if (formConfig.onSuccess) {
                    formConfig.onSuccess(data);
                }
            } else {
                if (formConfig.onError) {
                    formConfig.onError(data);
                }
            }
        } catch (error) {
            this.logger.error(`Error submitting form '${formId}':`, error);
            if (this.forms[formId] && this.forms[formId].onError) {
                this.forms[formId].onError({ error: error.message });
            }
        }
    }

    updateElementContent(elementId, content) {
        try {
            const element = document.getElementById(elementId);
            if (!element) {
                console.warn(`Element with ID '${elementId}' not found`);
                return;
            }
            element.innerHTML = content;
        } catch (error) {
            this.logger.error(`Error updating element '${elementId}':`, error);
        }
    }

    savePersistedStatus() {
        try {
            const status = {
                import: this.lastRunStatus.import,
                export: this.lastRunStatus.export,
                delete: this.lastRunStatus.delete,
                modify: this.lastRunStatus.modify,
                'population-delete': this.lastRunStatus['population-delete']
            };
            
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('pingone_import_status', JSON.stringify(status));
            }
        } catch (error) {
            this.logger.error('Error saving persisted status:', error);
        }
    }

    setButtonLoading(buttonId, isLoading) {
        try {
            const button = document.getElementById(buttonId);
            if (!button) {
                this.logger.warn(`Button with ID '${buttonId}' not found`);
                return;
            }

            if (isLoading) {
                // Add loading state
                button.disabled = true;
                button.classList.add('loading');
                
                // Add spinner if not already present
                if (!button.querySelector('.spinner-border')) {
                    const spinner = document.createElement('span');
                    spinner.className = 'spinner-border spinner-border-sm me-2';
                    spinner.setAttribute('role', 'status');
                    spinner.setAttribute('aria-hidden', 'true');
                    button.insertBefore(spinner, button.firstChild);
                }
            } else {
                // Remove loading state
                button.disabled = false;
                button.classList.remove('loading');
                
                // Remove spinner
                const spinner = button.querySelector('.spinner-border');
                if (spinner) {
                    spinner.remove();
                }
            }
        } catch (error) {
            this.logger.error(`Error setting button loading state for '${buttonId}':`, error);
        }
    }
}
