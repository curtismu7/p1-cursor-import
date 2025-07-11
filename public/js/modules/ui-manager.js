// File: ui-manager.js
// Description: UI management for PingOne user import tool
// 
// This module handles all user interface interactions and state management:
// - Status notifications and user feedback
// - Progress tracking and real-time updates
// - View transitions and navigation
// - Debug logging and error display
// - Connection status indicators
// - Form handling and validation feedback
// 
// Provides a centralized interface for updating the UI based on application events.

import { Logger } from './logger.js';
import { createCircularProgress } from './circular-progress.js';

// Enable debug mode for development (set to false in production)
const DEBUG_MODE = true;

/**
 * UI Manager Class
 * 
 * Centralizes all UI-related operations and state management.
 * Provides methods for updating progress, showing notifications,
 * handling view transitions, and managing user feedback.
 * 
 * @param {Logger} logger - Logger instance for UI logging
 */
export class UIManager {
    constructor(logger) {
        this.logger = logger;
        
        // Application state tracking
        // Tracks current view and operation states to prevent conflicts
        this.currentView = 'import';
        this.isImporting = false;
        this.isExporting = false;
        this.isDeleting = false;
        this.isModifying = false;
        this.isPopulationDeleting = false;
        
        // Navigation elements cache
        this.navItems = [];
        
        // Progress tracking for last run status
        this.lastRunStatus = {};
    }

    /**
     * Initialize the UI Manager
     * 
     * Sets up navigation elements and initializes progress tracking state.
     * Called during application startup to prepare the UI for user interaction.
     * 
     * @returns {Promise<void>}
     */
    async init() {
        try {
            // Initialize navigation elements for view switching
            this.navItems = document.querySelectorAll('[data-view]');
            
            // Initialize progress tracking for all operation types
            // Each operation maintains its last run status for display
            this.lastRunStatus = {
                import: { status: 'idle', message: 'No import run yet' },
                export: { status: 'idle', message: 'No export run yet' },
                delete: { status: 'idle', message: 'No delete run yet' },
                modify: { status: 'idle', message: 'No modify run yet' },
                'population-delete': { status: 'idle', message: 'No population delete run yet' }
            };
            
            // Initialize universal token status system
            this.initUniversalTokenStatus();
            
        } catch (error) {
            this.logger.error('UI Manager initialization error:', error);
            throw error;
        }
    }

    /**
     * Initialize the universal token status system
     * 
     * Sets up the token status bar that appears on all pages,
     * including automatic refresh timer and event handlers.
     * This provides users with real-time visibility into their
     * PingOne token status and expiration time.
     */
    initUniversalTokenStatus() {
        try {
            // Get token status elements
            this.tokenStatusBar = document.getElementById('universal-token-status');
            this.tokenStatusIcon = this.tokenStatusBar?.querySelector('.token-status-icon');
            this.tokenStatusText = this.tokenStatusBar?.querySelector('.token-status-text');
            this.tokenStatusTime = this.tokenStatusBar?.querySelector('.token-status-time');
            this.refreshTokenBtn = this.tokenStatusBar?.querySelector('#refresh-token-status');
            this.getTokenQuickBtn = this.tokenStatusBar?.querySelector('#get-token-quick');
            
            if (!this.tokenStatusBar) {
                console.warn('Universal token status bar not found');
                return;
            }
            
            // Set up event listeners for token status actions
            this.setupTokenStatusEventListeners();
            
            // Initialize token status display
            this.updateUniversalTokenStatus();
            
            // Start automatic refresh timer (every 60 seconds)
            this.startTokenStatusTimer();
            
            this.logger.info('Universal token status system initialized');
            
        } catch (error) {
            this.logger.error('Error initializing universal token status:', error);
        }
    }

    /**
     * Set up event listeners for token status actions
     * 
     * Handles refresh button clicks and quick token acquisition
     * to provide immediate user feedback and token management.
     */
    setupTokenStatusEventListeners() {
        try {
            // Refresh token status button
            if (this.refreshTokenBtn) {
                this.refreshTokenBtn.addEventListener('click', () => {
                    this.refreshTokenStatus();
                });
            }
            
            // Quick get token button
            if (this.getTokenQuickBtn) {
                this.getTokenQuickBtn.addEventListener('click', () => {
                    this.quickGetToken();
                });
            }
            
        } catch (error) {
            this.logger.error('Error setting up token status event listeners:', error);
        }
    }

    /**
     * Start automatic token status refresh timer
     * 
     * Updates token status every 60 seconds to keep countdown accurate
     * and provide real-time feedback on token expiration.
     */
    startTokenStatusTimer() {
        try {
            // Clear any existing timer
            if (this.tokenStatusTimer) {
                clearInterval(this.tokenStatusTimer);
            }
            
            // Set up 60-second refresh timer
            this.tokenStatusTimer = setInterval(() => {
                this.updateUniversalTokenStatus();
            }, 60000); // 60 seconds
            
            this.logger.debug('Token status auto-refresh timer started (60s interval)');
            
        } catch (error) {
            this.logger.error('Error starting token status timer:', error);
        }
    }

    /**
     * Stop the automatic token status refresh timer
     * 
     * Called during cleanup or when the application is shutting down
     * to prevent memory leaks and unnecessary API calls.
     */
    stopTokenStatusTimer() {
        try {
            if (this.tokenStatusTimer) {
                clearInterval(this.tokenStatusTimer);
                this.tokenStatusTimer = null;
                this.logger.debug('Token status auto-refresh timer stopped');
            }
        } catch (error) {
            this.logger.error('Error stopping token status timer:', error);
        }
    }

    /**
     * Update the universal token status display
     * 
     * Retrieves current token information and updates the status bar
     * with appropriate colors, icons, and time remaining. This is
     * the main method for keeping token status current across all pages.
     * 
     * @param {Object} tokenInfo - Optional token info object (if already retrieved)
     */
    updateUniversalTokenStatus(tokenInfo = null) {
        try {
            if (!this.tokenStatusBar) {
                return;
            }
            
            // Show loading state
            this.setTokenStatusLoading();
            
            // Get token info if not provided
            if (!tokenInfo && window.app && window.app.pingOneClient) {
                tokenInfo = window.app.pingOneClient.getCurrentTokenTimeRemaining();
            }
            
            // Update display based on token status
            if (!tokenInfo) {
                this.setTokenStatusNoToken();
            } else if (tokenInfo.isExpired) {
                this.setTokenStatusExpired();
            } else if (tokenInfo.timeRemaining <= 300) { // 5 minutes or less
                this.setTokenStatusWarning(tokenInfo);
            } else {
                this.setTokenStatusValid(tokenInfo);
            }
            
            // Log status for debugging
            if (window.DEBUG_MODE) {
                console.log('Token status updated:', tokenInfo);
            }
            
        } catch (error) {
            this.logger.error('Error updating universal token status:', error);
            this.setTokenStatusError();
        }
    }

    /**
     * Set token status to loading state
     * 
     * Shows a loading indicator while checking token status
     * to provide immediate feedback to users.
     */
    setTokenStatusLoading() {
        try {
            if (!this.tokenStatusBar) return;
            
            this.tokenStatusBar.className = 'universal-token-status loading';
            this.tokenStatusIcon.textContent = '⏳';
            this.tokenStatusText.textContent = 'Checking token status...';
            this.tokenStatusTime.textContent = '';
            this.getTokenQuickBtn.style.display = 'none';
            
        } catch (error) {
            this.logger.error('Error setting token status loading:', error);
        }
    }

    /**
     * Set token status to no token state
     * 
     * Indicates that no valid token is available and shows
     * the quick get token button for immediate action.
     */
    setTokenStatusNoToken() {
        try {
            if (!this.tokenStatusBar) return;
            
            this.tokenStatusBar.className = 'universal-token-status no-token';
            this.tokenStatusIcon.textContent = '❌';
            this.tokenStatusText.textContent = 'No valid token available';
            this.tokenStatusTime.textContent = '';
            this.getTokenQuickBtn.style.display = 'inline-block';
            
        } catch (error) {
            this.logger.error('Error setting token status no token:', error);
        }
    }

    /**
     * Set token status to expired state
     * 
     * Indicates that the token has expired and shows
     * the quick get token button for immediate renewal.
     */
    setTokenStatusExpired() {
        try {
            if (!this.tokenStatusBar) return;
            
            this.tokenStatusBar.className = 'universal-token-status expired';
            this.tokenStatusIcon.textContent = '⚠️';
            this.tokenStatusText.textContent = 'Token expired';
            this.tokenStatusTime.textContent = '';
            this.getTokenQuickBtn.style.display = 'inline-block';
            
        } catch (error) {
            this.logger.error('Error setting token status expired:', error);
        }
    }

    /**
     * Set token status to warning state (near expiration)
     * 
     * Indicates that the token will expire soon (within 5 minutes)
     * and shows the remaining time with a warning color.
     * 
     * @param {Object} tokenInfo - Token information with time remaining
     */
    setTokenStatusWarning(tokenInfo) {
        try {
            if (!this.tokenStatusBar) return;
            
            this.tokenStatusBar.className = 'universal-token-status warning';
            this.tokenStatusIcon.textContent = '⚠️';
            this.tokenStatusText.textContent = 'Token expires soon';
            this.tokenStatusTime.textContent = `(${tokenInfo.formattedTime} remaining)`;
            this.getTokenQuickBtn.style.display = 'inline-block';
            
        } catch (error) {
            this.logger.error('Error setting token status warning:', error);
        }
    }

    /**
     * Set token status to valid state
     * 
     * Indicates that the token is valid and shows
     * the remaining time until expiration.
     * 
     * @param {Object} tokenInfo - Token information with time remaining
     */
    setTokenStatusValid(tokenInfo) {
        try {
            if (!this.tokenStatusBar) return;
            
            this.tokenStatusBar.className = 'universal-token-status valid';
            this.tokenStatusIcon.textContent = '✅';
            this.tokenStatusText.textContent = 'Token valid';
            this.tokenStatusTime.textContent = `(${tokenInfo.formattedTime} remaining)`;
            this.getTokenQuickBtn.style.display = 'none';
            
        } catch (error) {
            this.logger.error('Error setting token status valid:', error);
        }
    }

    /**
     * Set token status to error state
     * 
     * Indicates that there was an error checking token status
     * and provides a way to retry or get a new token.
     */
    setTokenStatusError() {
        try {
            if (!this.tokenStatusBar) return;
            
            this.tokenStatusBar.className = 'universal-token-status no-token';
            this.tokenStatusIcon.textContent = '❓';
            this.tokenStatusText.textContent = 'Error checking token status';
            this.tokenStatusTime.textContent = '';
            this.getTokenQuickBtn.style.display = 'inline-block';
            
        } catch (error) {
            this.logger.error('Error setting token status error:', error);
        }
    }

    /**
     * Refresh token status manually
     * 
     * Called when user clicks the refresh button to get
     * immediate token status update.
     */
    refreshTokenStatus() {
        try {
            this.logger.info('Manual token status refresh requested');
            this.updateUniversalTokenStatus();
            
            // Show brief update animation
            if (this.tokenStatusBar) {
                this.tokenStatusBar.classList.add('updating');
                setTimeout(() => {
                    this.tokenStatusBar.classList.remove('updating');
                }, 500);
            }
            
        } catch (error) {
            this.logger.error('Error refreshing token status:', error);
        }
    }

    /**
     * Quick token acquisition from status bar
     * 
     * Provides immediate token acquisition without navigating
     * to the settings page, for user convenience.
     */
    async quickGetToken() {
        try {
            this.logger.info('Quick token acquisition requested');
            
            // Show loading state
            this.setTokenStatusLoading();
            
            // Attempt to get token
            if (window.app && window.app.getToken) {
                await window.app.getToken();
                
                // Update status after token acquisition
                setTimeout(() => {
                    this.updateUniversalTokenStatus();
                }, 1000);
            } else {
                this.logger.error('App getToken method not available');
                this.setTokenStatusError();
            }
            
        } catch (error) {
            this.logger.error('Error in quick token acquisition:', error);
            this.setTokenStatusError();
        }
    }

    /**
     * Show success notification to user
     * 
     * @param {string} message - Success message to display
     * @param {string} details - Optional additional details
     */
    showSuccess(message, details = '') {
        this.showNotification('success', message, details);
    }

    /**
     * Show error notification to user
     * 
     * @param {string} message - Error message to display
     * @param {string} details - Optional additional details
     */
    showError(message, details = '') {
        this.showNotification('error', message, details);
    }

    /**
     * Show warning notification to user
     * 
     * @param {string} message - Warning message to display
     * @param {string} details - Optional additional details
     */
    showWarning(message, details = '') {
        this.showNotification('warning', message, details);
    }

    /**
     * Show info notification to user
     * 
     * @param {string} message - Info message to display
     * @param {string} details - Optional additional details
     */
    showInfo(message, details = '') {
        this.showNotification('info', message, details);
    }

    /**
     * Display a notification to the user
     * 
     * Creates and displays a Bootstrap alert with appropriate styling,
     * icon, and auto-dismiss functionality. Supports different types
     * of notifications (success, error, warning, info).
     * 
     * @param {string} type - Notification type ('success', 'error', 'warning', 'info')
     * @param {string} message - Main notification message
     * @param {string} details - Optional additional details
     */
    showNotification(type, message, details = '') {
        try {
            // Get notification container and clear existing notifications
            const container = document.getElementById('notification-area');
            if (container) {
                while (container.firstChild) {
                    container.removeChild(container.firstChild);
                }
            }
            
            // Create notification element with Bootstrap classes
            const notification = document.createElement('div');
            notification.className = `status-message status-${type} alert-dismissible fade show`;
            notification.setAttribute('role', 'alert');
            notification.setAttribute('aria-live', 'polite');
            
            // Debug log for rendered message
            console.log(`Message rendered: "${message}", type = ${type}, class = ${notification.className}`);
            
            // Get icon and styling configuration based on notification type
            const iconConfig = this.getStatusIconConfig(type);
            
            // Build notification HTML with icon, message, and close button
            notification.innerHTML = `
                <div class="status-message-content">
                    <span class="status-icon" aria-hidden="true">${iconConfig.icon}</span>
                    <div class="status-text">
                        <strong class="status-title">${message}</strong>
                        ${details ? `<div class="status-details">${details}</div>` : ''}
                    </div>
                    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close notification">
                        <span aria-hidden="true">&times;</span>
                    </button>
                </div>
            `;
            
            // Add notification to container and set auto-dismiss timer
            if (container) {
                container.appendChild(notification);
                
                // Auto-remove notification after 5 seconds
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

    getStatusIconConfig(type) {
        const configs = {
            success: {
                icon: '✅',
                bgColor: '#d4edda',
                borderColor: '#c3e6cb',
                textColor: '#155724',
                iconColor: '#28a745'
            },
            warning: {
                icon: '⚠️',
                bgColor: '#fff3cd',
                borderColor: '#ffeaa7',
                textColor: '#856404',
                iconColor: '#ffc107'
            },
            error: {
                icon: '❌',
                bgColor: '#f8d7da',
                borderColor: '#f5c6cb',
                textColor: '#721c24',
                iconColor: '#dc3545'
            },
            info: {
                icon: 'ℹ️',
                bgColor: '#d1ecf1',
                borderColor: '#bee5eb',
                textColor: '#0c5460',
                iconColor: '#17a2b8'
            }
        };
        
        return configs[type] || configs.info;
    }

    /**
     * Display current token status with time remaining
     * 
     * Shows the current token status on the settings page, including
     * time remaining until expiration or if no valid token exists.
     * 
     * @param {Object} tokenInfo - Token information object from PingOneClient
     */
    showCurrentTokenStatus(tokenInfo = null) {
        try {
            const statusElement = document.getElementById('token-status');
            if (!statusElement) {
                console.warn('Token status element not found');
                return;
            }
            
            if (!tokenInfo) {
                // No valid token
                statusElement.innerHTML = `
                    <div class="token-status-display">
                        <span class="status-icon">❌</span>
                        <span class="status-text">No valid token available</span>
                    </div>
                `;
                statusElement.className = 'token-status no-token';
                return;
            }
            
            if (tokenInfo.isExpired) {
                // Token is expired
                statusElement.innerHTML = `
                    <div class="token-status-display">
                        <span class="status-icon">⚠️</span>
                        <span class="status-text">Token expired</span>
                    </div>
                `;
                statusElement.className = 'token-status expired';
                return;
            }
            
            // Valid token with time remaining
            statusElement.innerHTML = `
                <div class="token-status-display">
                    <span class="status-icon">✅</span>
                    <span class="status-text">Token valid</span>
                    <span class="time-remaining">(${tokenInfo.formattedTime} remaining)</span>
                </div>
            `;
            statusElement.className = 'token-status valid';
            
        } catch (error) {
            console.error('Error showing current token status:', error);
        }
    }

    /**
     * Update connection status display
     * 
     * Updates the connection status indicator with current state and message.
     * Used to show real-time connection status to the user.
     * 
     * @param {string} status - Connection status ('connected', 'disconnected', 'connecting', 'error')
     * @param {string} message - Status message to display
     */
    updateConnectionStatus(status, message = '') {
        try {
            // Update main connection status indicator
            const statusElement = document.getElementById('connection-status');
            if (statusElement) {
                const iconElement = statusElement.querySelector('.status-icon');
                const messageElement = statusElement.querySelector('.status-message');
                
                // Update icon based on status
                if (iconElement) {
                    iconElement.className = `status-icon fas ${this.getStatusIcon(status)}`;
                }
                
                // Update message text
                if (messageElement) {
                    messageElement.textContent = message || this.getDefaultStatusMessage(status);
                }
                
                // Update CSS class for styling
                statusElement.className = `connection-status ${status}`;
            }
            
            // Also update settings page connection status if present
            const settingsStatus = document.getElementById('settings-connection-status');
            if (settingsStatus) {
                const iconElement = settingsStatus.querySelector('.status-icon');
                const messageElement = settingsStatus.querySelector('.status-message');
                
                if (iconElement) {
                    iconElement.className = `status-icon fas ${this.getStatusIcon(status)}`;
                }
                
                if (messageElement) {
                    messageElement.textContent = message || this.getDefaultStatusMessage(status);
                }
                
                settingsStatus.className = `settings-connection-status ${status}`;
                
                // Log for debugging
                console.log('[UI] Settings connection status updated:', status, message);
            }
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

    /**
     * Shows the import progress section and initializes progress display
     * @param {number} totalUsers - Total number of users to import
     * @param {string} populationName - Name of the selected population
     * @param {string} populationId - ID of the selected population
     */
    showImportStatus(totalUsers, populationName = '', populationId = '') {
        // Show import status section (no modal overlay needed)
        const importStatus = document.getElementById('import-status');
        if (importStatus) {
            importStatus.style.display = 'block';
            this.debugLog('UI', 'Import status section displayed');
        } else {
            console.error('Import status element not found');
        }
        this.isImporting = true;
        this.updateLastRunStatus('import', 'User Import', 'In Progress', `Importing ${totalUsers} users`, { total: totalUsers, success: 0, failed: 0, skipped: 0 });
        this.updateImportProgress(0, totalUsers, 'Starting import...', {}, populationName, populationId);
    }

    /**
     * Updates the import progress bar, counters, and log
     * @param {number} current - Current user index
     * @param {number} total - Total users
     * @param {string} message - Progress message
     * @param {object} counts - Success/fail/skip counts
     * @param {string} populationName - Population name
     * @param {string} populationId - Population ID
     */
    updateImportProgress(current, total, message, counts = {}, populationName = '', populationId = '') {
        const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
        const spinnerContainer = document.getElementById('import-progress-spinner');
        if (spinnerContainer) {
            spinnerContainer.innerHTML = '';
            spinnerContainer.appendChild(createCircularProgress({
                value: percent,
                label: message || 'Importing Users'
            }));
        }
        // Update counts
        if (typeof successCount !== 'undefined' && successCount) successCount.textContent = counts.succeeded || counts.success || 0;
        if (typeof failedCount !== 'undefined' && failedCount) failedCount.textContent = counts.failed || 0;
        if (typeof skippedCount !== 'undefined' && skippedCount) skippedCount.textContent = counts.skipped || 0;
        
        // Update population name (show 'Not selected' if empty)
        if (typeof populationNameElement !== 'undefined' && populationNameElement) {
            const displayName = populationName && populationName.trim() ? populationName : 'Not selected';
            populationNameElement.textContent = displayName;
            populationNameElement.setAttribute('data-content', displayName);
        }
        // Update population ID (show 'Not set' if empty)
        if (typeof populationIdElement !== 'undefined' && populationIdElement) {
            const displayId = populationId && populationId.trim() ? populationId : 'Not set';
            populationIdElement.textContent = displayId;
            populationIdElement.setAttribute('data-content', displayId);
        }

        // Add progress log entry
        this.addProgressLogEntry(message, 'info', counts, 'import');
        
        // Update last run status with current progress
        this.updateLastRunStatus('import', 'User Import', 'In Progress', message, counts);
    }

    resetImportProgress() {
        const progressBar = document.getElementById('import-progress-bar');
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
        
        // Reset error status
        this.hideImportErrorStatus();
    }

    showImportErrorStatus(errorSummary = '', errorDetails = []) {
        const errorStatusElement = document.getElementById('import-error-status');
        const errorSummaryElement = document.getElementById('import-error-summary');
        const errorDetailsElement = document.getElementById('import-error-details');
        
        if (errorStatusElement) {
            errorStatusElement.style.display = 'block';
        }
        
        if (errorSummaryElement && errorSummary) {
            errorSummaryElement.innerHTML = `
                <div style="color: #dc3545; font-weight: bold; margin-bottom: 10px;">
                    <i class="fas fa-exclamation-circle"></i> ${errorSummary}
                </div>
            `;
        }
        
        if (errorDetailsElement && errorDetails.length > 0) {
            let detailsHtml = '<div style="font-size: 0.9em; color: #666;">';
            errorDetails.forEach((error, index) => {
                detailsHtml += `
                    <div style="margin-bottom: 8px; padding: 8px; background-color: #fff; border-left: 3px solid #dc3545; border-radius: 3px;">
                        <strong>Error ${index + 1}:</strong> ${error}
                    </div>
                `;
            });
            detailsHtml += '</div>';
            errorDetailsElement.innerHTML = detailsHtml;
        }
    }

    hideImportErrorStatus() {
        const errorStatusElement = document.getElementById('import-error-status');
        const errorSummaryElement = document.getElementById('import-error-summary');
        const errorDetailsElement = document.getElementById('import-error-details');
        
        if (errorStatusElement) {
            errorStatusElement.style.display = 'none';
        }
        
        if (errorSummaryElement) {
            errorSummaryElement.innerHTML = '';
        }
        
        if (errorDetailsElement) {
            errorDetailsElement.innerHTML = '';
        }
    }

    updateImportErrorStatus(summary, errors) {
        const errorStatus = document.getElementById('import-error-status');
        if (!errorStatus) return;
        errorStatus.style.display = 'block';
        errorStatus.innerHTML = `
            <div class="error-summary">
                <i class="fas fa-exclamation-triangle"></i> <strong>Error Overview</strong>
            </div>
            <div class="error-main-message">
                <i class="fas fa-exclamation-circle"></i> ${summary}
            </div>
            <div class="error-list">
                ${errors.map((err, idx) => {
                    // Support error as string or { message, details }
                    let message = typeof err === 'string' ? err : err.message || 'Unknown error';
                    let details = typeof err === 'object' && err.details ? err.details : '';
                    return `
                        <div class="error-row" data-error-idx="${idx}">
                            <div class="error-row-header">
                                <span class="error-label"><strong>Error ${idx + 1}:</strong> ${message}</span>
                                ${details ? `<button class="error-toggle-btn" data-toggle-idx="${idx}"><i class="fas fa-chevron-down"></i> Details</button>` : ''}
                            </div>
                            ${details ? `<div class="error-details" id="error-details-${idx}" style="display:none;"><pre>${details}</pre></div>` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        // Add toggle listeners
        Array.from(errorStatus.querySelectorAll('.error-toggle-btn')).forEach(btn => {
            btn.onclick = (e) => {
                const idx = btn.getAttribute('data-toggle-idx');
                const detailsDiv = document.getElementById(`error-details-${idx}`);
                if (detailsDiv) {
                    const isOpen = detailsDiv.style.display === 'block';
                    detailsDiv.style.display = isOpen ? 'none' : 'block';
                    btn.innerHTML = isOpen ? '<i class="fas fa-chevron-down"></i> Details' : '<i class="fas fa-chevron-up"></i> Hide';
                }
            };
        });
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
        const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
        const spinnerContainer = document.getElementById('export-progress-spinner');
        if (spinnerContainer) {
            spinnerContainer.innerHTML = '';
            spinnerContainer.appendChild(createCircularProgress({
                value: percent,
                label: message || 'Exporting Users'
            }));
        }
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

    showDeleteStatus(totalUsers, populationName = '', populationId = '') {
        const overlay = document.getElementById('delete-progress-modal-overlay');
        if (overlay) overlay.style.display = 'flex';
        
        const deleteStatus = document.getElementById('delete-status');
        if (deleteStatus) {
            deleteStatus.style.display = 'block';
        }
        
        this.isDeleting = true;
        this.updateLastRunStatus('delete', 'User Delete', 'In Progress', `Deleting ${totalUsers} users`, { total: totalUsers, success: 0, failed: 0, skipped: 0 });
        this.updateDeleteProgress(0, totalUsers, 'Starting delete...', {}, populationName, populationId);
    }

    updateDeleteProgress(current, total, message, counts = {}, populationName = '', populationId = '') {
        const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
        const spinnerContainer = document.getElementById('delete-progress-spinner');
        if (spinnerContainer) {
            spinnerContainer.innerHTML = '';
            spinnerContainer.appendChild(createCircularProgress({
                value: percent,
                label: message || 'Deleting Users'
            }));
        }
        if (successCount) successCount.textContent = counts.success || 0;
        if (failedCount) failedCount.textContent = counts.failed || 0;
        if (skippedCount) skippedCount.textContent = counts.skipped || 0;
        
        // Update population name (show 'Not selected' if empty)
        if (populationNameElement) {
            const displayName = populationName && populationName.trim() ? populationName : 'Not selected';
            populationNameElement.textContent = displayName;
            populationNameElement.setAttribute('data-content', displayName);
        }
        // Update population ID (show 'Not set' if empty)
        if (populationIdElement) {
            const displayId = populationId && populationId.trim() ? populationId : 'Not set';
            populationIdElement.textContent = displayId;
            populationIdElement.setAttribute('data-content', displayId);
        }

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
        const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
        const spinnerContainer = document.getElementById('modify-progress-spinner');
        if (spinnerContainer) {
            spinnerContainer.innerHTML = '';
            spinnerContainer.appendChild(createCircularProgress({
                value: percent,
                label: message || 'Modifying Users'
            }));
        }
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
        const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
        const spinnerContainer = document.getElementById('population-delete-progress-spinner');
        if (spinnerContainer) {
            spinnerContainer.innerHTML = '';
            spinnerContainer.appendChild(createCircularProgress({
                value: percent,
                label: message || 'Deleting Population'
            }));
        }
        if (successCount) successCount.textContent = counts.success || 0;
        if (failedCount) failedCount.textContent = counts.failed || 0;
        if (skippedCount) skippedCount.textContent = counts.skipped || 0;

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
                
                const timeStr = new Date().toLocaleTimeString();
                
                // Create header with timestamp, level, message, and expand icon if details exist
                const headerElement = document.createElement('div');
                headerElement.className = 'log-header';
                headerElement.style.display = 'flex';
                headerElement.style.alignItems = 'center';
                headerElement.style.gap = '8px';
                
                const timeElement = document.createElement('span');
                timeElement.className = 'log-timestamp';
                timeElement.textContent = timeStr;
                
                const levelElement = document.createElement('span');
                levelElement.className = 'log-level';
                levelElement.textContent = level.toUpperCase();
                
                const messageElement = document.createElement('span');
                messageElement.className = 'log-message';
                messageElement.textContent = message;
                
                headerElement.appendChild(timeElement);
                headerElement.appendChild(levelElement);
                headerElement.appendChild(messageElement);
                
                // Add count badges to header
                if (counts.success !== undefined) {
                    const successElement = document.createElement('span');
                    successElement.className = 'log-success';
                    successElement.textContent = `✓ ${counts.success}`;
                    headerElement.appendChild(successElement);
                }
                
                if (counts.failed !== undefined) {
                    const failedElement = document.createElement('span');
                    failedElement.className = 'log-failed';
                    failedElement.textContent = `✗ ${counts.failed}`;
                    headerElement.appendChild(failedElement);
                }
                
                if (counts.skipped !== undefined) {
                    const skippedElement = document.createElement('span');
                    skippedElement.className = 'log-skipped';
                    skippedElement.textContent = `- ${counts.skipped}`;
                    headerElement.appendChild(skippedElement);
                }
                
                // Check if we have additional details for expandable content
                const hasDetails = Object.keys(counts).length > 0 || operation;
                let expandIcon = null;
                if (hasDetails) {
                    expandIcon = document.createElement('span');
                    expandIcon.className = 'log-expand-icon';
                    expandIcon.innerHTML = '▶'; // Right-pointing triangle for collapsed state
                    expandIcon.style.cursor = 'pointer';
                    headerElement.appendChild(expandIcon);
                }
                
                logElement.appendChild(headerElement);
                
                // Create details container for expandable content
                if (hasDetails) {
                    const detailsElement = document.createElement('div');
                    detailsElement.className = 'log-details';
                    detailsElement.style.display = 'none'; // Initially hidden
                    
                    // Add counts section if counts exist
                    if (Object.keys(counts).length > 0) {
                        const countsSection = document.createElement('div');
                        countsSection.className = 'log-detail-section';
                        
                        const countsTitle = document.createElement('h4');
                        countsTitle.textContent = 'Counts';
                        countsSection.appendChild(countsTitle);
                        
                        const countsContent = document.createElement('pre');
                        countsContent.className = 'log-detail-json';
                        countsContent.textContent = JSON.stringify(counts, null, 2);
                        countsSection.appendChild(countsContent);
                        
                        detailsElement.appendChild(countsSection);
                    }
                    
                    // Add operation section if operation exists
                    if (operation) {
                        const operationSection = document.createElement('div');
                        operationSection.className = 'log-detail-section';
                        
                        const operationTitle = document.createElement('h4');
                        operationTitle.textContent = 'Operation';
                        operationSection.appendChild(operationTitle);
                        
                        const operationContent = document.createElement('pre');
                        operationContent.className = 'log-detail-json';
                        operationContent.textContent = operation;
                        operationSection.appendChild(operationContent);
                        
                        detailsElement.appendChild(operationSection);
                    }
                    
                    logElement.appendChild(detailsElement);
                    
                    // Add click handler for expand/collapse functionality
                    logElement.addEventListener('click', (e) => {
                        // Don't expand if clicking on the expand icon itself
                        if (e.target === expandIcon) {
                            return;
                        }
                        
                        const details = logElement.querySelector('.log-details');
                        const icon = logElement.querySelector('.log-expand-icon');
                        
                        if (details && icon) {
                            const isExpanded = details.style.display !== 'none';
                            
                            if (isExpanded) {
                                // Collapse
                                details.style.display = 'none';
                                icon.innerHTML = '▶';
                                logElement.classList.remove('expanded');
                            } else {
                                // Expand
                                details.style.display = 'block';
                                icon.innerHTML = '▼';
                                logElement.classList.add('expanded');
                            }
                        }
                    });
                    
                    // Add click handler for expand icon specifically
                    if (expandIcon) {
                        expandIcon.addEventListener('click', (e) => {
                            e.stopPropagation(); // Prevent triggering the log entry click
                            
                            const details = logElement.querySelector('.log-details');
                            const icon = logElement.querySelector('.log-expand-icon');
                            
                            if (details && icon) {
                                const isExpanded = details.style.display !== 'none';
                                
                                if (isExpanded) {
                                    // Collapse
                                    details.style.display = 'none';
                                    icon.innerHTML = '▶';
                                    logElement.classList.remove('expanded');
                                } else {
                                    // Expand
                                    details.style.display = 'block';
                                    icon.innerHTML = '▼';
                                    logElement.classList.add('expanded');
                                }
                            }
                        });
                    }
                }
                
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

    logMessage(type, message, details = '') {
        const logContainer = document.getElementById('log-entries');
        if (!logContainer) return;
        
        const entry = document.createElement('div');
        entry.className = `log-entry log-${type}`;
        
        const iconMap = {
            success: '✅',
            api: '🔄',
            warning: '⚠️',
            info: 'ℹ️',
            error: '❌'
        };
        const icon = iconMap[type] || '';
        const timestamp = new Date().toLocaleTimeString();
        
        // Create header with icon, timestamp, message, and expand icon if details exist
        const headerElement = document.createElement('div');
        headerElement.className = 'log-header';
        headerElement.style.display = 'flex';
        headerElement.style.alignItems = 'center';
        headerElement.style.gap = '8px';
        
        const iconElement = document.createElement('span');
        iconElement.className = 'log-icon';
        iconElement.textContent = icon;
        
        const timestampElement = document.createElement('span');
        timestampElement.className = 'log-timestamp';
        timestampElement.textContent = `[${timestamp}]`;
        
        const messageElement = document.createElement('span');
        messageElement.className = 'log-message';
        messageElement.textContent = message;
        
        headerElement.appendChild(iconElement);
        headerElement.appendChild(timestampElement);
        headerElement.appendChild(messageElement);
        
        // Add expand icon if details exist
        let expandIcon = null;
        if (details) {
            expandIcon = document.createElement('span');
            expandIcon.className = 'log-expand-icon';
            expandIcon.innerHTML = '▶'; // Right-pointing triangle for collapsed state
            expandIcon.style.cursor = 'pointer';
            headerElement.appendChild(expandIcon);
        }
        
        entry.appendChild(headerElement);
        
        // Add details if they exist
        if (details) {
            const detailsElement = document.createElement('div');
            detailsElement.className = 'log-details';
            detailsElement.style.display = 'none'; // Initially hidden
            detailsElement.innerHTML = details;
            entry.appendChild(detailsElement);
            
            // Add click handler for expand/collapse functionality
            entry.addEventListener('click', (e) => {
                // Don't expand if clicking on the expand icon itself
                if (e.target === expandIcon) {
                    return;
                }
                
                const details = entry.querySelector('.log-details');
                const icon = entry.querySelector('.log-expand-icon');
                
                if (details && icon) {
                    const isExpanded = details.style.display !== 'none';
                    
                    if (isExpanded) {
                        // Collapse
                        details.style.display = 'none';
                        icon.innerHTML = '▶';
                        entry.classList.remove('expanded');
                    } else {
                        // Expand
                        details.style.display = 'block';
                        icon.innerHTML = '▼';
                        entry.classList.add('expanded');
                    }
                }
            });
            
            // Add click handler for expand icon specifically
            if (expandIcon) {
                expandIcon.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent triggering the log entry click
                    
                    const details = entry.querySelector('.log-details');
                    const icon = entry.querySelector('.log-expand-icon');
                    
                    if (details && icon) {
                        const isExpanded = details.style.display !== 'none';
                        
                        if (isExpanded) {
                            // Collapse
                            details.style.display = 'none';
                            icon.innerHTML = '▶';
                            entry.classList.remove('expanded');
                        } else {
                            // Expand
                            details.style.display = 'block';
                            icon.innerHTML = '▼';
                            entry.classList.add('expanded');
                        }
                    }
                });
            }
        }
        
        logContainer.appendChild(entry);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    updateFileInfo(fileInfo) {
        console.log('File info section repositioned under CSV file input');
        console.log('File info section moved below file upload input.');
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
            safeLog('Fetching logs from /api/logs...', 'debug');
            const response = await fetch('/api/logs?limit=200');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const responseData = await response.json();
            safeLog('Received logs from server', 'debug', {
                count: responseData.logs?.length
            });

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

                // === LOG LOADING: NEWEST FIRST ===
                // Process logs in reverse chronological order (newest first)
                // Logs are reversed so newest entries show first (top of the list)
                // Makes recent events immediately visible without scrolling
                // Maintain this ordering for all future log-related features
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

                            // Insert at the top of the container (newest first)
                            if (logEntries.firstChild) {
                                logEntries.insertBefore(logElement, logEntries.firstChild);
                            } else {
                                logEntries.appendChild(logElement);
                            }
                        } else {
                            safeLog(`Skipping invalid log entry at index ${index}`, 'warn', log);
                        }
                    } catch (logError) {
                        safeLog(`Error processing log entry at index ${index}: ${logError.message}`, 'error', {
                            error: logError
                        });
                    }
                });

                // Scroll to top since newest entries are at the top
                logEntries.scrollTop = 0;
            } else {
                const errorMsg = responseData.error || 'Failed to load logs';
                logEntries.innerHTML = `<div class="error">${errorMsg}</div>`;
                console.error('Failed to load logs:', errorMsg);
                if (this.logger && typeof this.logger.error === 'function') {
                    this.logger.error('Failed to load logs:', errorMsg);
                }
            }
        } catch (error) {
            safeLog(`Error loading logs: ${error.message}`, 'error', { error });
            logEntries.innerHTML = `<div class="error">Failed to load logs: ${error.message}</div>`;
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

    updateLiveStatus(message, type = 'info') {
        const el = document.getElementById('status-live');
        if (!el) return;
        el.textContent = message;
        el.className = `status-message status-${type}`;
        el.style.display = 'block';
    }
    clearLiveStatus() {
        const el = document.getElementById('status-live');
        if (!el) return;
        el.textContent = '';
        el.style.display = 'none';
    }

    /**
     * Centralized debug logger for UI and import flow
     * @param {string} area - Tag/category for the log (e.g., 'Import', 'SSE')
     * @param {string} message - Log message
     * @param {any} data - Optional data to log
     */
    debugLog(area, message, data = null) {
        if (!DEBUG_MODE) return;
        const formatted = `[DEBUG - ${area}] ${message}`;
        if (data !== null) {
            console.log(formatted, data);
        } else {
            console.log(formatted);
        }
        // Also log to debug window if present
        this.logDebugToWindow(area, message, data);
    }

    /**
     * Appends a debug log entry to the debug log window in the UI (if present)
     * @param {string} area - Log area/tag
     * @param {string} message - Log message
     * @param {any} data - Optional data
     */
    logDebugToWindow(area, message, data = null) {
        const debugContent = document.getElementById('debug-log-content');
        if (!debugContent) return;
        // Create a new log entry element
        const entry = document.createElement('div');
        entry.className = `debug-log-entry debug-${area.toLowerCase()}`;
        entry.setAttribute('data-area', area.toLowerCase());
        entry.innerHTML = `<span class="debug-tag">[${area}]</span> <span class="debug-msg">${message}</span> ${data ? `<pre class='debug-data'>${JSON.stringify(data, null, 2)}</pre>` : ''}`;
        debugContent.appendChild(entry);
        debugContent.scrollTop = debugContent.scrollHeight;
        // Apply current filters
        applyDebugFilters();
    }
}
