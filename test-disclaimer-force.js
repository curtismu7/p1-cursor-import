// Force enable disclaimer button and add debugging
// Run this in browser console at http://localhost:4000

console.log('=== FORCE ENABLE DISCLAIMER BUTTON ===');

// Get the button
const button = document.getElementById('accept-disclaimer');
if (!button) {
    console.error('Button not found!');
} else {
    console.log('Button found, current state:', {
        disabled: button.disabled,
        className: button.className,
        innerHTML: button.innerHTML
    });
    
    // Force enable the button
    button.disabled = false;
    console.log('Button disabled state set to false');
    
    // Remove any existing event listeners by cloning the element
    const newButton = button.cloneNode(true);
    button.parentNode.replaceChild(newButton, button);
    console.log('Button cloned to remove existing event listeners');
    
    // Add multiple event listeners to catch any clicks
    newButton.addEventListener('click', function(e) {
        console.log('CLICK EVENT 1 DETECTED!', e);
        alert('Button clicked! Event 1');
    });
    
    newButton.addEventListener('click', function(e) {
        console.log('CLICK EVENT 2 DETECTED!', e);
        alert('Button clicked! Event 2');
    });
    
    newButton.addEventListener('mousedown', function(e) {
        console.log('MOUSEDOWN EVENT DETECTED!', e);
    });
    
    newButton.addEventListener('mouseup', function(e) {
        console.log('MOUSEUP EVENT DETECTED!', e);
    });
    
    // Try to trigger a click programmatically
    setTimeout(() => {
        console.log('Attempting programmatic click...');
        newButton.click();
    }, 1000);
    
    console.log('Multiple event listeners added to button');
}

// Also try to call the setup function if app exists
if (window.app && typeof window.app.setupDisclaimerAgreement === 'function') {
    console.log('Calling app.setupDisclaimerAgreement...');
    window.app.setupDisclaimerAgreement();
}

console.log('=== FORCE ENABLE COMPLETE ==='); 