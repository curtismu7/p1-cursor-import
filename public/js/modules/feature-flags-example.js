// Feature Flags Usage Examples
// This file demonstrates how to use feature flags in your application

import { isFeatureEnabled, setFeatureFlag } from './feature-flags.js';

// Example 1: Conditional feature based on Feature Flag A
export function exampleFeatureA() {
    if (isFeatureEnabled('A')) {
        console.log('Feature Flag A is enabled - showing advanced import options');
        // Show advanced import options
        showAdvancedImportOptions();
    } else {
        console.log('Feature Flag A is disabled - showing basic import options');
        // Show basic import options
        showBasicImportOptions();
    }
}

// Example 2: Feature Flag B for experimental export functionality
export function exampleFeatureB() {
    if (isFeatureEnabled('B')) {
        console.log('Feature Flag B is enabled - using experimental export format');
        // Use experimental export format
        return exportWithExperimentalFormat();
    } else {
        console.log('Feature Flag B is disabled - using standard export format');
        // Use standard export format
        return exportWithStandardFormat();
    }
}

// Example 3: Feature Flag C for enhanced logging
export function exampleFeatureC() {
    if (isFeatureEnabled('C')) {
        console.log('Feature Flag C is enabled - using enhanced logging');
        // Enable enhanced logging
        enableEnhancedLogging();
    } else {
        console.log('Feature Flag C is disabled - using standard logging');
        // Use standard logging
        enableStandardLogging();
    }
}

// Example 4: Dynamic feature flag checking in a function
export function processUserData(userData) {
    const enhancedProcessing = isFeatureEnabled('A');
    const experimentalExport = isFeatureEnabled('B');
    const detailedLogging = isFeatureEnabled('C');
    
    console.log('Processing user data with flags:', {
        enhancedProcessing,
        experimentalExport,
        detailedLogging
    });
    
    // Process based on flags
    if (enhancedProcessing) {
        userData = enhanceUserData(userData);
    }
    
    if (detailedLogging) {
        logDetailedUserData(userData);
    }
    
    return userData;
}

// Example 5: Feature flag in UI components
export function updateUIBasedOnFlags() {
    const showAdvancedFeatures = isFeatureEnabled('A');
    const useExperimentalUI = isFeatureEnabled('B');
    
    // Update UI elements based on flags
    const advancedSection = document.getElementById('advanced-features');
    if (advancedSection) {
        advancedSection.style.display = showAdvancedFeatures ? 'block' : 'none';
    }
    
    const experimentalButton = document.getElementById('experimental-btn');
    if (experimentalButton) {
        experimentalButton.style.display = useExperimentalUI ? 'inline-block' : 'none';
    }
}

// Helper functions (these would be your actual implementation)
function showAdvancedImportOptions() {
    // Implementation for advanced import options
    console.log('Showing advanced import options');
}

function showBasicImportOptions() {
    // Implementation for basic import options
    console.log('Showing basic import options');
}

function exportWithExperimentalFormat() {
    // Implementation for experimental export
    console.log('Using experimental export format');
    return 'experimental-export-data';
}

function exportWithStandardFormat() {
    // Implementation for standard export
    console.log('Using standard export format');
    return 'standard-export-data';
}

function enableEnhancedLogging() {
    // Implementation for enhanced logging
    console.log('Enhanced logging enabled');
}

function enableStandardLogging() {
    // Implementation for standard logging
    console.log('Standard logging enabled');
}

function enhanceUserData(userData) {
    // Implementation for enhanced user data processing
    return { ...userData, enhanced: true };
}

function logDetailedUserData(userData) {
    // Implementation for detailed logging
    console.log('Detailed user data:', userData);
} 