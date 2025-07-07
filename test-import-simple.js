// Simple test to verify import functionality
import { FileHandler } from './public/js/modules/file-handler.js';
import { Logger } from './public/js/modules/logger.js';
import { UIManager } from './public/js/modules/ui-manager.js';

// Mock DOM elements
global.document = {
    getElementById: (id) => {
        const elements = {
            'csv-file': { addEventListener: () => {} },
            'file-info': { innerHTML: '' },
            'preview-container': { innerHTML: '' }
        };
        return elements[id] || null;
    }
};

// Create logger and UI manager
const logger = new Logger();
const uiManager = new UIManager(logger);
const fileHandler = new FileHandler(logger, uiManager);

// Test CSV content
const testCsvContent = `firstName,lastName,email,username,enabled
John,Doe,john.doe@example.com,johndoe,true
Jane,Smith,jane.smith@example.com,janesmith,true
Bob,Johnson,bob.johnson@example.com,bobjohnson,false`;

// Create a mock file
const mockFile = {
    name: 'test-import.csv',
    size: testCsvContent.length,
    lastModified: Date.now(),
    type: 'text/csv'
};

// Test the file parsing
async function testFileParsing() {
    try {
        console.log('Testing file parsing...');
        
        // Parse the CSV file
        const parseResults = await fileHandler.parseCSVFile(mockFile);
        
        console.log('Parse results:', {
            totalRows: parseResults.totalRows,
            validUsers: parseResults.validUsers,
            invalidUsers: parseResults.invalidUsers,
            errors: parseResults.errors,
            users: parseResults.users
        });
        
        // Test getParsedUsers
        const parsedUsers = fileHandler.getParsedUsers();
        console.log('Parsed users from getParsedUsers:', parsedUsers);
        
        console.log('✅ File parsing test completed successfully');
        
    } catch (error) {
        console.error('❌ File parsing test failed:', error);
    }
}

// Run the test
testFileParsing(); 