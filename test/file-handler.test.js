import { JSDOM } from 'jsdom';
import { FileHandler } from '../public/js/modules/file-handler.js';

// Set up the DOM environment
const setupDOM = () => {
  const dom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <body>
        <div class="file-upload-container">
          <input type="file" id="csv-file" accept=".csv" class="file-input">
          <label for="csv-file" class="file-label">
            <span>Choose CSV File</span>
          </label>
        </div>
        <div id="file-info" class="file-info"></div>
        <div id="preview-container"></div>
        <button id="start-import-btn" class="btn btn-primary" disabled>
          Import Users
        </button>
      </body>
    </html>
  `, {
    url: 'http://localhost',
    pretendToBeVisual: true,
    runScripts: 'dangerously'
  });

  // Set up the global variables
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.File = dom.window.File;
  global.Blob = dom.window.Blob;
  global.FileReader = dom.window.FileReader;
  global.URL = dom.window.URL;
  
  return dom;
};

describe('FileHandler', () => {
  let fileHandler;
  let mockLogger;
  let mockUIManager;
  let fileInput;
  let dom;

  beforeAll(() => {
    // Set up the DOM once before all tests
    dom = setupDOM();
  });

  beforeEach(() => {
    // Reset the document body
    document.body.innerHTML = `
      <div class="file-upload-container">
        <input type="file" id="csv-file" accept=".csv" class="file-input">
        <label for="csv-file" class="file-label">
          <span>Choose CSV File</span>
        </label>
      </div>
      <div id="file-info" class="file-info"></div>
      <div id="preview-container"></div>
      <button id="start-import-btn" class="btn btn-primary" disabled>
        Import Users
      </button>
    `;

    // Create mock logger and UI manager
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    
    mockUIManager = {
      updateFileInfo: jest.fn(),
      updatePreview: jest.fn(),
      fileInfo: document.getElementById('file-info')
    };
    
    // Create a new instance for each test
    fileHandler = new FileHandler(mockLogger, mockUIManager);
    
    // Get a fresh reference to the file input for each test
    fileInput = document.getElementById('csv-file');
    
    // Mock the files property
    Object.defineProperty(fileInput, 'files', {
      value: [],
      writable: true,
      configurable: true
    });
  });

  afterAll(() => {
    // Clean up the DOM after all tests
    dom.window.close();
  });

  describe('initializeFileInput', () => {
    it('should add change event listener to file input', () => {
      // Arrange
      const addEventListenerSpy = jest.spyOn(fileInput, 'addEventListener');
      
      // Act
      fileHandler.initializeFileInput();
      
      // Assert
      expect(addEventListenerSpy).toHaveBeenCalledWith('change', expect.any(Function));
    });
  });

  describe('handleFileSelect', () => {
    it('should handle file selection', async () => {
      // Arrange
      const fileContent = 'name,email\nTest,test@example.com';
      const file = new window.File([fileContent], 'test.csv', { type: 'text/csv' });
      
      // Update the files property
      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: true,
        configurable: true
      });
      
      // Mock FileReader
      const originalFileReader = window.FileReader;
      const mockFileReader = {
        readAsText: jest.fn(function() {
          this.result = fileContent;
          if (this.onload) {
            this.onload({ target: { result: this.result } });
          }
        }),
        onload: null,
        result: null
      };
      
      window.FileReader = jest.fn().mockImplementation(() => mockFileReader);
      
      // Mock the parseCSV method if it exists
      if (fileHandler.parseCSV) {
        fileHandler.parseCSV = jest.fn().mockReturnValue([
          { name: 'Test', email: 'test@example.com' }
        ]);
      }
      
      // Act
      await new Promise((resolve) => {
        fileHandler.handleFileSelect({ target: fileInput });
        // Small timeout to allow the async operations to complete
        setTimeout(resolve, 0);
      });
      
      // Assert
      expect(window.FileReader).toHaveBeenCalled();
      expect(mockFileReader.readAsText).toHaveBeenCalledWith(file);
      
      // Clean up
      window.FileReader = originalFileReader;
    });
    
    it('should handle no file selected', () => {
      // Arrange
      Object.defineProperty(fileInput, 'files', {
        value: [],
        configurable: true
      });
      
      // Spy on console.error to verify it's called
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // Act
      fileHandler.handleFileSelect({ target: fileInput });
      
      // Assert
      expect(mockUIManager.fileInfo.innerHTML).toBe('');
      expect(consoleErrorSpy).toHaveBeenCalledWith('No file selected');
      
      // Clean up
      consoleErrorSpy.mockRestore();
    });
    
    it('should handle file read error', async () => {
      // Arrange
      const file = new window.File(['test'], 'test.csv', { type: 'text/csv' });
      
      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: true,
        configurable: true
      });
      
      // Mock FileReader with error
      const originalFileReader = window.FileReader;
      const mockFileReader = {
        readAsText: jest.fn(function() {
          if (this.onerror) {
            this.onerror(new Error('File read error'));
          }
        }),
        onerror: null
      };
      
      window.FileReader = jest.fn().mockImplementation(() => mockFileReader);
      
      // Spy on console.error to verify it's called
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // Act & Assert
      await expect(
        new Promise((resolve) => {
          fileHandler.handleFileSelect({ target: fileInput });
          setTimeout(resolve, 0);
        })
      ).resolves.not.toThrow();
      
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error reading file:', expect.any(Error));
      
      // Clean up
      window.FileReader = originalFileReader;
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getFileExtension', () => {
    it('should return the correct file extension', () => {
      // Arrange
      const testCases = [
        { input: 'test.csv', expected: 'csv' },
        { input: 'test.file.name.csv', expected: 'csv' },
        { input: 'test.TXT', expected: 'txt' },
        { input: 'test.PDF', expected: 'pdf' },
        { input: '.gitignore', expected: 'gitignore' },
        { input: 'test', expected: '' },
        { input: '', expected: '' },
        { input: null, expected: '' },
        { input: undefined, expected: '' },
        { input: 123, expected: '' },
        { input: {}, expected: '' }
      ];
      
      // Act & Assert
      testCases.forEach(({ input, expected }) => {
        const result = fileHandler.getFileExtension(input);
        expect(result).toBe(expected);
      });
    });
  });
  
  describe('parseCSV', () => {
    it('should parse CSV content correctly', () => {
      // Arrange
      const csvContent = 'name,email\nJohn Doe,john@example.com\nJane Smith,jane@example.com';
      
      // Act
      const result = fileHandler.parseCSV(csvContent);
      
      // Assert
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0]).toEqual({ name: 'John Doe', email: 'john@example.com' });
      expect(result[1]).toEqual({ name: 'Jane Smith', email: 'jane@example.com' });
    });
    
    it('should handle empty CSV content', () => {
      // Arrange
      const csvContent = '';
      
      // Act
      const result = fileHandler.parseCSV(csvContent);
      
      // Assert
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
    
    it('should handle CSV with only headers', () => {
      // Arrange
      const csvContent = 'name,email\n';
      
      // Act
      const result = fileHandler.parseCSV(csvContent);
      
      // Assert
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
    
    it('should handle malformed CSV', () => {
      // Arrange
      const csvContent = 'name,email\nJohn Doe,john@example.com\nInvalid Row';
      
      // Act
      const result = fileHandler.parseCSV(csvContent);
      
      // Assert - Should still parse the valid rows
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0]).toEqual({ name: 'John Doe', email: 'john@example.com' });
    });
  });
  
  describe('validateFile', () => {
    it('should validate file type correctly', () => {
      // Arrange
      const validFile = { name: 'test.csv', type: 'text/csv' };
      const invalidFile1 = { name: 'test.txt', type: 'text/plain' };
      const invalidFile2 = { name: 'test.csv', type: 'application/json' };
      
      // Act & Assert
      expect(fileHandler.validateFile(validFile)).toBe(true);
      expect(fileHandler.validateFile(invalidFile1)).toBe(false);
      expect(fileHandler.validateFile(invalidFile2)).toBe(false);
    });
    
    it('should handle missing file', () => {
      // Act & Assert
      expect(fileHandler.validateFile(null)).toBe(false);
      expect(fileHandler.validateFile(undefined)).toBe(false);
    });
  });
});
