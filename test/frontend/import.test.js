import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { ImportWizard } from '../../public/js/components/ImportWizard';
import { importService } from '../../public/js/services/import.service';

// Mock the import service
jest.mock('../../public/js/services/import.service', () => ({
  importService: {
    startImport: jest.fn().mockResolvedValue({}),
    subscribe: jest.fn(),
    unsubscribe: jest.fn()
  }
}));

describe('ImportWizard', () => {
  let mockCallback;
  
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Setup mock subscription
    importService.subscribe.mockImplementation((callback) => {
      mockCallback = callback;
      return jest.fn(); // Return unsubscribe function
    });
  });

  it('renders the initial step', () => {
    render(<ImportWizard />);
    
    // Check if the component renders
    expect(screen.getByText('Import Users')).toBeInTheDocument();
    expect(screen.getByText('1. Configure')).toHaveClass('active');
    
    // Check if file input is present
    expect(screen.getByLabelText(/upload file/i)).toBeInTheDocument();
    
    // Check if import type selector is present
    expect(screen.getByLabelText(/import type/i)).toBeInTheDocument();
    
    // Check if start button is present but disabled initially
    const startButton = screen.getByText('Start Import');
    expect(startButton).toBeInTheDocument();
    expect(startButton).toBeDisabled();
  });

  it('enables start button when file is uploaded', () => {
    render(<ImportWizard />);
    
    // Simulate file selection
    const file = new File(['test'], 'test.csv', { type: 'text/csv' });
    const fileInput = screen.getByLabelText(/upload file/i);
    
    fireEvent.change(fileInput, { 
      target: { 
        files: [file] 
      } 
    });
    
    // Check if start button is enabled
    const startButton = screen.getByText('Start Import');
    expect(startButton).not.toBeDisabled();
  });

  it('starts import when form is submitted', async () => {
    render(<ImportWizard />);
    
    // Simulate file selection
    const file = new File(['email,firstName,lastName\ntest@example.com,Test,User'], 'test.csv', { type: 'text/csv' });
    const fileInput = screen.getByLabelText(/upload file/i);
    fireEvent.change(fileInput, { target: { files: [file] } });
    
    // Click start button
    fireEvent.click(screen.getByText('Start Import'));
    
    // Verify service was called with correct parameters
    await waitFor(() => {
      expect(importService.startImport).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User'
          })
        ]),
        'auto' // default import type
      );
    });
  });

  it('shows progress when import starts', () => {
    render(<ImportWizard />);
    
    // Simulate import started
    mockCallback({ 
      status: 'processing', 
      progress: 50,
      processed: 5,
      total: 10
    });
    
    // Check if progress is displayed
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('Processing 5 of 10 users...')).toBeInTheDocument();
  });

  it('shows success message when import completes', () => {
    render(<ImportWizard />);
    
    // Simulate import completion
    mockCallback({ 
      status: 'completed',
      progress: 100,
      processed: 10,
      total: 10,
      success: 10,
      failed: 0
    });
    
    // Check if success message is displayed
    expect(screen.getByText('Import completed successfully')).toBeInTheDocument();
    expect(screen.getByText('10 users imported successfully')).toBeInTheDocument();
  });

  it('shows error message when import fails', () => {
    render(<ImportWizard />);
    
    // Simulate import failure
    mockCallback({ 
      status: 'failed',
      error: 'Server error',
      processed: 5,
      total: 10,
      success: 3,
      failed: 2
    });
    
    // Check if error message is displayed
    expect(screen.getByText('Import failed')).toBeInTheDocument();
    expect(screen.getByText('Server error')).toBeInTheDocument();
    expect(screen.getByText('3 succeeded, 2 failed')).toBeInTheDocument();
  });
});
