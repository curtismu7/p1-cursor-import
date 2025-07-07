// Console test for disclaimer button debugging
// Run this in the browser console at http://localhost:4000

console.log('=== CONSOLE DEBUG TEST STARTING ===');

// Check for JavaScript errors
window.addEventListener('error', function(e) {
    console.error('JavaScript Error:', e.error);
    console.error('Error details:', {
        message: e.message,
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno
    });
});

// Check for unhandled promise rejections
window.addEventListener('unhandledrejection', function(e) {
    console.error('Unhandled Promise Rejection:', e.reason);
});

// Test disclaimer button
function testDisclaimerButton() {
    console.log('Testing disclaimer button...');
    
    const button = document.getElementById('accept-disclaimer');
    if (!button) {
        console.error('❌ Disclaimer button not found!');
        return false;
    }
    
    console.log('✅ Disclaimer button found');
    console.log('Button state:', {
        disabled: button.disabled,
        className: button.className,
        innerHTML: button.innerHTML,
        style: {
            display: button.style.display,
            visibility: button.style.visibility,
            pointerEvents: button.style.pointerEvents
        }
    });
    
    // Check if button is actually clickable
    const rect = button.getBoundingClientRect();
    console.log('Button position:', {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        visible: rect.width > 0 && rect.height > 0
    });
    
    // Check if button is covered by other elements
    const elementAtPoint = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2
    );
    console.log('Element at button center:', elementAtPoint);
    console.log('Is button at center?', elementAtPoint === button);
    
    return true;
}

// Test app instance
function testAppInstance() {
    console.log('Testing app instance...');
    
    if (!window.app) {
        console.error('❌ No app instance found in window.app');
        return false;
    }
    
    console.log('✅ App instance found');
    console.log('App methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(window.app)));
    
    if (typeof window.app.setupDisclaimerAgreement === 'function') {
        console.log('✅ setupDisclaimerAgreement method exists');
        return true;
    } else {
        console.error('❌ setupDisclaimerAgreement method not found');
        return false;
    }
}

// Test DOM elements
function testDOMElements() {
    console.log('Testing DOM elements...');
    
    const elements = {
        'accept-disclaimer': document.getElementById('accept-disclaimer'),
        'disclaimer-agreement': document.getElementById('disclaimer-agreement'),
        'risk-acceptance': document.getElementById('risk-acceptance'),
        'disclaimer': document.getElementById('disclaimer'),
        '.feature-cards': document.querySelector('.feature-cards')
    };
    
    let allFound = true;
    for (const [name, element] of Object.entries(elements)) {
        if (element) {
            console.log(`✅ ${name} found`);
        } else {
            console.error(`❌ ${name} not found`);
            allFound = false;
        }
    }
    
    return allFound;
}

// Test localStorage
function testLocalStorage() {
    console.log('Testing localStorage...');
    
    const keys = ['disclaimer-agreed', 'disclaimer-agreed-date'];
    for (const key of keys) {
        const value = localStorage.getItem(key);
        console.log(`${key}: ${value}`);
    }
}

// Run all tests
console.log('Running all tests...');
const results = {
    domElements: testDOMElements(),
    appInstance: testAppInstance(),
    disclaimerButton: testDisclaimerButton()
};
testLocalStorage();

console.log('Test results:', results);

// Try to manually call setupDisclaimerAgreement if app exists
if (window.app && typeof window.app.setupDisclaimerAgreement === 'function') {
    console.log('Manually calling setupDisclaimerAgreement...');
    try {
        window.app.setupDisclaimerAgreement();
        console.log('✅ setupDisclaimerAgreement called successfully');
    } catch (error) {
        console.error('❌ Error calling setupDisclaimerAgreement:', error);
    }
}

// Add a global test function
window.testDisclaimerClick = function() {
    const button = document.getElementById('accept-disclaimer');
    if (button) {
        console.log('Manually clicking disclaimer button...');
        button.click();
        return true;
    } else {
        console.error('Disclaimer button not found for manual click');
        return false;
    }
};

console.log('=== CONSOLE DEBUG TEST COMPLETE ===');
console.log('You can now run testDisclaimerClick() to manually test the button'); 