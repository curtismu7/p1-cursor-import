const { JSDOM } = require('jsdom');
const { FileHandler } = require('../public/js/modules/file-handler');

// Set up the DOM environment before requiring the module
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
  pretendToBeVisual: true
});

// Set up the global variables
global.window = dom.window;
global.document = dom.window.document;

try {
  // Add missing globals if they don't exist
  if (!global.File) global.File = window.File;
  if (!global.Blob) global.Blob = window.Blob;
  if (!global.FileReader) global.FileReader = window.FileReader;
} catch (e) {
  console.warn('Could not set up some globals:', e);
}

describe('FileHandler', () => {
  let fileHandler;
  let mockLogger;
  let mockUIManager;
  let fileInput;

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
    
    // Mock the files property if fileInput exists
    if (fileInput) {
      Object.defineProperty(fileInput, 'files', {
        value: [],
        writable: true,
        configurable: true
      });
    } else {
      console.warn('fileInput is null in beforeEach');
    }
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
    it('should handle file selection', (done) => {
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
          this.onload({ target: { result: this.result } });
        }),
        onload: null,
        result: null
      };
      
      window.FileReader = jest.fn(() => mockFileReader);
      
      // Act
      fileHandler.handleFileSelect({ target: fileInput });
      
      // Assert
      expect(window.FileReader).toHaveBeenCalled();
      expect(mockFileReader.readAsText).toHaveBeenCalledWith(file);
      
      // Clean up
      window.FileReader = originalFileReader;
      done();
    });
    
    it('should handle no file selected', () => {
      // Arrange
      Object.defineProperty(fileInput, 'files', {
        value: [],
        configurable: true
      });
      
      // Act
      fileHandler.handleFileSelect({ target: fileInput });
      
      // Assert
      expect(mockUIManager.fileInfo.innerHTML).toBe('');
    });
  });

  describe('getFileExtension', () => {
    it('should return the correct file extension', () => {
      // This test doesn't need the DOM, so we can run it directly
      // Arrange
      const fileName = 'test.csv';
      
      // Act
      const extension = fileHandler.getFileExtension(fileName);
      
      // Assert
      expect(extension).toBe('csv');
    });
    
    it('should handle filenames without extension', () => {
      // This test doesn't need the DOM
      // Arrange
      const fileName = 'test';
      
      // Act
      const extension = fileHandler.getFileExtension(fileName);
      
      // Assert
      expect(extension).toBe('');
    });
    
    it('should handle filenames with multiple dots', () => {
      // This test doesn't need the DOM
      // Arrange
      const fileName = 'test.file.name.csv';
      
      // Act
      const extension = fileHandler.getFileExtension(fileName);
      
      // Assert
      expect(extension).toBe('csv');
    });
    
    it('should handle empty filename', () => {
      // This test doesn't need the DOM
      // Arrange
      const fileName = '';
      
      // Act
      const extension = fileHandler.getFileExtension(fileName);
      
      // Assert
      expect(extension).toBe('');
    });
  });
});
