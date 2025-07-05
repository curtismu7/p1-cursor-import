document.addEventListener('DOMContentLoaded', () => {
    // Load current settings from server and populate the form
    const loadCurrentSettings = async () => {
        try {
            const response = await fetch('/api/settings');
            if (response.ok) {
                const result = await response.json();
                if (result.success && result.data) {
                    const settings = result.data;
                    
                    // Populate the form fields with current values
                    const form = document.getElementById('settings-form');
                    if (form) {
                        const environmentIdField = form.querySelector('#environment-id');
                        const apiClientIdField = form.querySelector('#api-client-id');
                        const apiSecretField = form.querySelector('#api-secret');
                        const populationIdField = form.querySelector('#population-id');
                        const regionField = form.querySelector('#region');
                        
                        if (environmentIdField) environmentIdField.value = settings.environmentId || '';
                        if (apiClientIdField) apiClientIdField.value = settings.apiClientId || '';
                        if (apiSecretField) apiSecretField.value = settings.apiSecret || '';
                        if (populationIdField) populationIdField.value = settings.populationId || '';
                        if (regionField) regionField.value = settings.region || '';
                        
                        console.log('Settings loaded from server:', {
                            environmentId: settings.environmentId,
                            apiClientId: settings.apiClientId,
                            region: settings.region,
                            populationId: settings.populationId
                        });
                    }
                    
                    // Update connection status if available
                    const statusContainer = document.getElementById('settings-connection-status');
                    if (statusContainer && settings.connectionStatus) {
                        statusContainer.className = `connection-status status-${settings.connectionStatus}`;
                        const statusMessage = statusContainer.querySelector('.status-message');
                        if (statusMessage) {
                            statusMessage.textContent = settings.connectionMessage || 'Connection status unknown';
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    };
    
    // Load settings immediately
    loadCurrentSettings();
    
    // Also load settings when switching to settings view
    const settingsNavItem = document.querySelector('[data-view="settings"]');
    if (settingsNavItem) {
        settingsNavItem.addEventListener('click', () => {
            setTimeout(loadCurrentSettings, 100); // Small delay to ensure view is loaded
        });
    }
});
