document.addEventListener('DOMContentLoaded', () => {
    // Only run this once
    if (!localStorage.getItem('settingsConfigured')) {
        const settings = {
            apiClientId: "yo95dc946f-5e0a-4a8b-a8ba-b587b244e005",
            apiSecret: "your-client-sEe2YBEmqrBRdELuNDAh5SPL6T01_M~R9o7QMYHyjcWXwzHvhhlvdptZRH6A6_2g-ecret",
            environmentId: "d02d2305-f445-406d-82ee-7cdbf6eeabfd",
            populationId: "367bc5a0-7c0f-4ae3-95b6-2f045e9c48e3",
            region: "NorthAmerica",
            connectionStatus: "disconnected",
            connectionMessage: "Not connected",
            autoSave: true
        };

        // Wait for app to be available
        const checkApp = setInterval(() => {
            if (window.app) {
                clearInterval(checkApp);
                window.app.settingsManager.saveSettings(settings)
                    .then(() => {
                        console.log('Settings configured successfully');
                        localStorage.setItem('settingsConfigured', 'true');
                        // Don't auto-refresh, let the user do it
                        alert('Settings have been configured. Please refresh the page.');
                    })
                    .catch(console.error);
            }
        }, 100);
    }
});
