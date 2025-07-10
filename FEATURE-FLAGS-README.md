# Feature Flags Implementation

This document describes the feature flags system implemented in the PingOne User Import Tool.

## Overview

The feature flags system allows you to enable/disable specific features in the application without requiring code changes or redeployment. This is useful for:

- A/B testing new features
- Gradual rollouts
- Emergency feature disabling
- Development and testing

## Available Feature Flags

The system includes three feature flags:

- **Feature Flag A**: Experimental feature A
- **Feature Flag B**: Experimental feature B  
- **Feature Flag C**: Experimental feature C

## How to Use

### 1. Frontend Usage

Import the feature flags module in your JavaScript files:

```javascript
import { isFeatureEnabled, setFeatureFlag, getAllFeatureFlags, resetFeatureFlags } from './modules/feature-flags.js';

// Check if a feature is enabled
if (isFeatureEnabled('A')) {
    // Feature A is enabled
    showAdvancedFeatures();
} else {
    // Feature A is disabled
    showBasicFeatures();
}

// Set a feature flag programmatically
setFeatureFlag('B', true);  // Enable Feature B
setFeatureFlag('C', false); // Disable Feature C

// Get all current flags
const flags = getAllFeatureFlags();
console.log('Current flags:', flags);

// Reset all flags to defaults
resetFeatureFlags();
```

### 2. Backend Usage

The backend also supports feature flags through environment variables:

```bash
# Enable Feature Flag A
export FEATURE_FLAG_A=true

# Enable Feature Flag B
export FEATURE_FLAG_B=true

# Enable Feature Flag C
export FEATURE_FLAG_C=true
```

Or in your Node.js code:

```javascript
const featureFlags = require('./server/feature-flags.js');

if (featureFlags.isFeatureEnabled('A')) {
    // Feature A is enabled on backend
    console.log('Using enhanced processing');
} else {
    // Feature A is disabled on backend
    console.log('Using standard processing');
}
```

### 3. API Endpoints

The backend provides REST API endpoints for managing feature flags:

```bash
# Get all feature flags
GET /api/feature-flags

# Set a specific feature flag
POST /api/feature-flags/A
Content-Type: application/json
{
    "enabled": true
}

# Reset all feature flags to defaults
POST /api/feature-flags/reset
```

## UI Controls

### Feature Flags Panel

The application includes a feature flags panel accessible via a floating button in the bottom-right corner. The panel allows you to:

- Toggle individual feature flags on/off
- Reset all flags to their default values
- See the current state of all flags

### Accessing the Panel

1. Look for the toggle button (⚙️ icon) in the bottom-right corner of the application
2. Click the button to open the feature flags panel
3. Use the checkboxes to enable/disable features
4. Click "Reset to Defaults" to restore default values
5. Click the X button to close the panel

## Persistence

### Frontend Persistence

Feature flags are persisted in the browser's localStorage under the key `pingone_feature_flags`. This means:

- Flags persist across browser sessions
- Flags are specific to each browser/device
- Flags can be cleared by clearing browser data

### Backend Persistence

Backend feature flags are controlled by environment variables and are not persistent by default. To make them persistent, you can:

1. Set environment variables in your deployment configuration
2. Store flags in a database or configuration file
3. Use a configuration management system

## Example Implementations

See `public/js/modules/feature-flags-example.js` for comprehensive examples of how to use feature flags in your application code.

### Basic Example

```javascript
import { isFeatureEnabled } from './modules/feature-flags.js';

function processData(data) {
    if (isFeatureEnabled('A')) {
        // Use enhanced processing
        return enhancedProcess(data);
    } else {
        // Use standard processing
        return standardProcess(data);
    }
}
```

### UI Example

```javascript
import { isFeatureEnabled } from './modules/feature-flags.js';

function updateUI() {
    const advancedSection = document.getElementById('advanced-features');
    if (advancedSection) {
        advancedSection.style.display = isFeatureEnabled('A') ? 'block' : 'none';
    }
}
```

## Best Practices

1. **Default to Disabled**: Always default feature flags to `false` for safety
2. **Graceful Degradation**: Ensure your application works when features are disabled
3. **Clear Naming**: Use descriptive names for your feature flags
4. **Documentation**: Document what each feature flag does
5. **Testing**: Test both enabled and disabled states of your features
6. **Monitoring**: Monitor the impact of feature flags on your application

## Troubleshooting

### Feature Flag Not Working

1. Check if the flag is enabled in the UI panel
2. Verify the flag name is correct (A, B, or C)
3. Check browser console for any JavaScript errors
4. Clear localStorage and reset flags if needed

### Backend Feature Flags Not Working

1. Verify environment variables are set correctly
2. Restart the server after changing environment variables
3. Check server logs for any errors
4. Verify the feature-flags.js module is properly imported

### UI Panel Not Appearing

1. Ensure the bundle.js file is properly built and loaded
2. Check that the feature-flags-toggle button exists in the DOM
3. Verify CSS styles are loaded correctly
4. Check browser console for any JavaScript errors

## Development

### Adding New Feature Flags

1. Add the flag to the `DEFAULT_FLAGS` object in both frontend and backend modules
2. Add UI controls in the feature flags panel
3. Update the event listeners in the App class
4. Rebuild the bundle with `npm run build`

### Modifying Feature Flag Behavior

1. Update the feature flags module logic
2. Modify UI controls as needed
3. Update any dependent code
4. Test both enabled and disabled states

## Security Considerations

- Feature flags are stored in localStorage and are visible to users
- Backend feature flags should be properly secured in production
- Consider using a proper feature flag service for production environments
- Regularly audit and clean up unused feature flags

## Future Enhancements

Potential improvements to the feature flags system:

1. **Remote Configuration**: Fetch flags from a remote service
2. **User-Specific Flags**: Allow different flags for different users
3. **Time-Based Flags**: Automatically enable/disable flags based on time
4. **Analytics**: Track feature flag usage and impact
5. **Audit Logging**: Log when flags are changed and by whom
6. **Rollout Strategies**: Gradual rollout capabilities
7. **A/B Testing**: Built-in A/B testing framework 