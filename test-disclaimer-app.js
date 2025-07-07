// Test script to debug disclaimer button in the main app
// Run this in the browser console at http://localhost:4000

console.log('=== DISCLAIMER DEBUG TEST STARTING ===');

// Test 1: Check if elements exist
const acceptButton = document.getElementById('accept-disclaimer');
const disclaimerCheckbox = document.getElementById('disclaimer-agreement');
const riskCheckbox = document.getElementById('risk-acceptance');
const disclaimer = document.getElementById('disclaimer');
const featureCards = document.querySelector('.feature-cards');

console.log('Element check:', {
    acceptButton: !!acceptButton,
    disclaimerCheckbox: !!disclaimerCheckbox,
    riskCheckbox: !!riskCheckbox,
    disclaimer: !!disclaimer,
    featureCards: !!featureCards
});

// Test 2: Check button state
if (acceptButton) {
    console.log('Button state:', {
        disabled: acceptButton.disabled,
        className: acceptButton.className,
        innerHTML: acceptButton.innerHTML
    });
}

// Test 3: Check checkbox states
if (disclaimerCheckbox) {
    console.log('Disclaimer checkbox:', {
        checked: disclaimerCheckbox.checked,
        required: disclaimerCheckbox.required
    });
}

if (riskCheckbox) {
    console.log('Risk checkbox:', {
        checked: riskCheckbox.checked,
        required: riskCheckbox.required
    });
}

// Test 4: Check localStorage
console.log('localStorage:', {
    'disclaimer-agreed': localStorage.getItem('disclaimer-agreed'),
    'disclaimer-agreed-date': localStorage.getItem('disclaimer-agreed-date')
});

// Test 5: Check display states
if (disclaimer) {
    console.log('Disclaimer display:', disclaimer.style.display);
}

if (featureCards) {
    console.log('Feature cards display:', featureCards.style.display);
}

// Test 6: Try to manually trigger button click
if (acceptButton) {
    console.log('Attempting to click button programmatically...');
    acceptButton.click();
    console.log('Button click attempted');
}

// Test 7: Check if app instance exists
if (window.app) {
    console.log('App instance found:', {
        hasSetupDisclaimerAgreement: typeof window.app.setupDisclaimerAgreement === 'function'
    });
    
    // Try to call setupDisclaimerAgreement manually
    if (typeof window.app.setupDisclaimerAgreement === 'function') {
        console.log('Calling setupDisclaimerAgreement manually...');
        window.app.setupDisclaimerAgreement();
        console.log('setupDisclaimerAgreement called');
    }
} else {
    console.log('No app instance found in window.app');
}

// Test 8: Add manual event listener to button
if (acceptButton) {
    console.log('Adding manual event listener to button...');
    acceptButton.addEventListener('click', function(e) {
        console.log('MANUAL BUTTON CLICK DETECTED!', e);
        alert('Button clicked manually!');
    });
    console.log('Manual event listener added');
}

console.log('=== DISCLAIMER DEBUG TEST COMPLETE ==='); 