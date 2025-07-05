// Update the settings with your PingOne credentials
const settings = {
    apiClientId: "yo95dc946f-5e0a-4a8b-a8ba-b587b244e005",        // Replace with your actual client ID
    apiSecret: "your-client-sEe2YBEmqrBRdELuNDAh5SPL6T01_M~R9o7QMYHyjcWXwzHvhhlvdptZRH6A6_2g-ecret",      // Replace with your actual client secret
    environmentId: "your-end02d2305-f445-406d-82ee-7cdbf6eeabfdironment-id", // Replace with your environment ID
    populationId: "your-popu367bc5a0-7c0f-4ae3-95b6-2f045e9c48e3lation-id",   // Replace with your population ID
    region: "NorthAmerica",               // Or your region
    connectionStatus: "disconnected",
    connectionMessage: "Not connected",
    autoSave: true
  };
  
  // Save the settings
  window.app.settingsManager.saveSettings(settings).then(() => {
    console.log('Settings saved successfully');
    // Refresh the page to reinitialize with the new settings
    window.location.reload();
  });