import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  baseUrl: 'http://127.0.0.1:4000', // Use IP instead of localhost
  logEndpoint: '/api/logs',
  logsEndpoint: '/api/logs',
  testIterations: 3, // Reduced for testing
  maxConcurrentRequests: 3, // Reduced for testing
  timeout: 30000, // Increased to 30 seconds
  retryCount: 2, // Number of retries for failed requests
  retryDelay: 1000, // Delay between retries in ms
};

// Test data
const TEST_LOGS = [
  { level: 'info', message: 'Informational message', data: { app: 'test', value: 1 } },
  { level: 'warn', message: 'Warning message', data: { app: 'test', issue: 'low_disk_space' } },
  { level: 'error', message: 'Error message', data: { app: 'test', error: 'connection_failed', code: 500 } },
  { level: 'debug', message: 'Debug information', data: { app: 'test', debug: { requestId: uuidv4() } } },
];

// Retry wrapper with exponential backoff and jitter
async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    timeout = 30000,
    shouldRetry = () => true,
    onRetry = () => {}
  } = options;
  
  let lastError;
  let attempt = 0;
  
  while (attempt <= maxRetries) {
    attempt++;
    const startTime = Date.now();
    let timeoutId;
    
    try {
      // Create a promise that will reject if the operation times out
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Operation timed out after ${timeout}ms`));
        }, timeout);
      });
      
      // Race the operation against the timeout
      const result = await Promise.race([
        Promise.resolve(fn(attempt)),
        timeoutPromise
      ]);
      
      // Clear the timeout since we got a result
      clearTimeout(timeoutId);
      return result;
      
    } catch (error) {
      // Clear the timeout in case it's still pending
      if (timeoutId) clearTimeout(timeoutId);
      
      lastError = error;
      
      // Check if we should retry
      const shouldRetryError = shouldRetry(error, attempt);
      const isLastAttempt = attempt > maxRetries;
      
      if (!shouldRetryError || isLastAttempt) {
        break;
      }
      
      // Calculate delay with exponential backoff and jitter
      const baseDelay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay);
      const jitter = Math.random() * baseDelay * 0.2; // ±20% jitter
      const delay = Math.floor(baseDelay - (baseDelay * 0.1) + jitter);
      
      // Call the onRetry callback
      onRetry(error, attempt, delay);
      
      console.warn(`  ↳ Attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms... (${error.message})`);
      
      // Wait for the calculated delay
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // If we get here, all retries failed
  const error = new Error(`All ${maxRetries} retry attempts failed: ${lastError.message}`);
  error.originalError = lastError;
  error.attempts = attempt;
  throw error;
}

class LoggingTester {
  constructor() {
    this.client = axios.create({
      baseURL: CONFIG.baseUrl,
      timeout: 10000, // 10 seconds
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      maxRedirects: 0, // Don't follow redirects
      validateStatus: (status) => status < 500, // Reject only on server errors
    });
    
    // Add request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        const timestamp = new Date().toISOString();
        const method = config.method?.toUpperCase().padEnd(7);
        const url = config.url || '';
        console.log(`[${timestamp}] ${method} ${url}`);
        
        // Add cache-busting parameter to GET requests
        if (config.method?.toLowerCase() === 'get') {
          config.params = {
            ...config.params,
            _: Date.now(),
          };
        }
        
        return config;
      },
      (error) => {
        console.error('Request setup error:', error.message);
        return Promise.reject(error);
      }
    );
    
    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        const { status, statusText, config } = response;
        console.log(`[${new Date().toISOString()}] ${status} ${statusText} ${config.method?.toUpperCase()} ${config.url}`);
        return response;
      },
      (error) => {
        if (error.response) {
          // Server responded with a status code outside 2xx
          const { status, statusText, data } = error.response;
          console.error(`Response error: ${status} ${statusText}`, {
            url: error.config?.url,
            method: error.config?.method,
            data: error.config?.data,
            response: data,
          });
        } else if (error.request) {
          // Request was made but no response received
          console.error('No response received:', {
            url: error.config?.url,
            method: error.config?.method,
            timeout: error.config?.timeout,
            code: error.code,
            message: error.message,
          });
        } else {
          // Error setting up the request
          console.error('Request error:', {
            message: error.message,
            stack: error.stack,
          });
        }
        return Promise.reject(error);
      }
    );
    
    this.testResults = {
      startTime: Date.now(),
      tests: [],
      passed: 0,
      failed: 0,
      total: 0,
    };
    
    // Test configuration
    this.testConfig = {
      maxRetries: 3,
      retryDelay: 1000, // 1 second initial delay
      timeout: 10000, // 10 seconds per test
    };
  }

  async runTests() {
    console.log('🚀 Starting logging system tests...\n');
    
    try {
      // Test 1: Basic logging
      await this.testBasicLogging();
      
      // Test 2: Batch logging
      await this.testBatchLogging();
      
      // Test 3: Invalid logs
      await this.testInvalidLogs();
      
      // Test 4: Performance test
      await this.testPerformance();
      
      // Test 5: Retrieve logs
      await this.testRetrieveLogs();
      
      // Print summary
      this.printSummary();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
      process.exit(1);
    }
  }
  
  async testBasicLogging() {
    console.log('\n🔍 Testing basic logging functionality...');
    const testName = 'Basic Logging';
    const testStart = Date.now();
    let passedCount = 0;
    let failedCount = 0;
    const errors = [];
    
    // Test each log level
    for (const log of TEST_LOGS) {
      const logTestName = `Log ${log.level.toUpperCase()}`;
      const logStart = Date.now();
      let logError = null;
      
      try {
        // Use the enhanced withRetry function
        const response = await withRetry(
          async (attempt) => {
            const startTime = Date.now();
            try {
              const result = await this.client.post(CONFIG.logEndpoint, log);
              console.log(`  ↳ Attempt ${attempt} succeeded in ${Date.now() - startTime}ms`);
              return result;
            } catch (error) {
              console.error(`  ↳ Attempt ${attempt} failed: ${error.message}`);
              throw error; // Re-throw to let withRetry handle it
            }
          },
          {
            maxRetries: this.testConfig.maxRetries,
            initialDelay: this.testConfig.retryDelay,
            timeout: this.testConfig.timeout,
            shouldRetry: (error) => {
              // Don't retry 4xx errors (except 429 - Too Many Requests)
              if (error.response && error.response.status >= 400 && error.response.status < 500 && error.response.status !== 429) {
                return false;
              }
              return true;
            },
            onRetry: (error, attempt, delay) => {
              console.warn(`  ↳ Retry ${attempt} in ${delay}ms: ${error.message}`);
            }
          }
        );
        
        const passed = response.status === 200;
        if (passed) {
          passedCount++;
          console.log(`  ✓ ${logTestName}: ${log.message}`);
        } else {
          failedCount++;
          logError = `Unexpected status: ${response.status} ${response.statusText}`;
          console.error(`  ✗ ${logTestName}: ${logError}`);
        }
        
      } catch (error) {
        failedCount++;
        logError = error.response 
          ? `${error.response.status} ${error.response.statusText}: ${error.message}`
          : error.message;
        console.error(`  ✗ ${logTestName}: ${logError}`);
        errors.push(`${logTestName}: ${logError}`);
      } finally {
        // Record individual log test result
        this.recordResult({
          test: logTestName,
          passed: !logError,
          duration: Date.now() - logStart,
          error: logError || undefined,
          data: logError ? undefined : log
        });
      }
    }
    
    // Record overall test result
    const overallPassed = failedCount === 0;
    const testDuration = Date.now() - testStart;
    
    this.recordResult({
      test: testName,
      passed: overallPassed,
      duration: testDuration,
      details: {
        total: TEST_LOGS.length,
        passed: passedCount,
        failed: failedCount,
        errors: errors.length > 0 ? errors : undefined
      }
    });
    
    if (overallPassed) {
      console.log(`✅ ${testName}: All ${passedCount} logs processed successfully in ${testDuration}ms`);
    } else {
      console.error(`❌ ${testName}: ${failedCount} of ${TEST_LOGS.length} logs failed`);
      if (errors.length > 0) {
        console.error('  Errors:', errors.join('\n    '));
      }
    }
    
  }
  
  async testBatchLogging() {
    console.log('\n🔍 Testing batch logging...');
    const testName = 'Batch Logging';
    const testStart = Date.now();
    let logError = null;
    
    try {
      // Create a batch of test logs with unique identifiers
      const batchLogs = Array(5).fill().map((_, i) => ({
        level: ['info', 'warn', 'error', 'debug'][i % 4],
        message: `Batch log message ${i + 1}`,
        timestamp: new Date().toISOString(),
        data: { 
          batchId: uuidv4(), 
          index: i + 1,
          testRun: `test-${Date.now()}`
        }
      }));
      
      console.log(`  Sending batch of ${batchLogs.length} logs...`);
      
      // Send the batch with retry logic
      const response = await withRetry(
        async (attempt) => {
          const startTime = Date.now();
          try {
            const result = await this.client.post(
              CONFIG.logsEndpoint, 
              batchLogs,
              { timeout: this.testConfig.timeout * 2 } // Give more time for batch operations
            );
            console.log(`  ↳ Batch attempt ${attempt} succeeded in ${Date.now() - startTime}ms`);
            return result;
          } catch (error) {
            console.error(`  ↳ Batch attempt ${attempt} failed:`, error.message);
            throw error;
          }
        },
        {
          maxRetries: this.testConfig.maxRetries,
          initialDelay: this.testConfig.retryDelay,
          timeout: this.testConfig.timeout * 2, // Extended timeout for batch operations
          shouldRetry: (error) => {
            // Don't retry 4xx errors (except 429 - Too Many Requests)
            if (error.response && error.response.status >= 400 && error.response.status < 500 && error.response.status !== 429) {
              return false;
            }
            return true;
          },
          onRetry: (error, attempt, delay) => {
            console.warn(`  ↳ Batch retry ${attempt} in ${delay}ms: ${error.message}`);
          }
        }
      );
      
      const passed = response.status === 200;
      const testDuration = Date.now() - testStart;
      
      this.recordResult({
        test: testName,
        passed,
        duration: testDuration,
        details: {
          batchSize: batchLogs.length,
          status: response.status,
          responseTime: testDuration,
          firstLog: batchLogs[0],
          lastLog: batchLogs[batchLogs.length - 1]
        }
      });
      
      if (passed) {
        console.log(`✅ ${testName}: Successfully sent batch of ${batchLogs.length} logs in ${testDuration}ms`);
        return true;
      } else {
        logError = `Unexpected status: ${response.status} ${response.statusText}`;
        console.error(`❌ ${testName}: ${logError}`);
        return false;
      }
      
    } catch (error) {
      logError = error.response 
        ? `${error.response.status} ${error.response.statusText}: ${error.message}`
        : error.message;
      
      console.error(`❌ ${testName}: ${logError}`);
      
      this.recordResult({
        test: testName,
        passed: false,
        duration: Date.now() - testStart,
        error: logError,
        details: {
          error: error.toString(),
          stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
        }
      });
      
      return false;
    }
  }
  
  async testInvalidLogs() {
    console.log('\n🔍 Testing invalid log submissions...');
    const testName = 'Invalid Logs';
    const testStart = Date.now();
    let passedCount = 0;
    let failedCount = 0;
    const errors = [];
    
    const invalidLogs = [
      { level: 'info' }, // Missing message
      { message: 'No level' }, // Missing level
      { level: 'invalid', message: 'Invalid level' }, // Invalid level
      null, // Null log
      { level: 'info', message: 12345 }, // Invalid message type
    ];
    
    for (const [index, log] of invalidLogs.entries()) {
      const logTestName = `Invalid Log ${index + 1}`;
      const logStart = Date.now();
      let logError = null;
      
      try {
        const response = await withRetry(
          async (attempt) => {
            try {
              const result = await this.client.post(CONFIG.logEndpoint, log);
              // If we get here, the request succeeded when it should have failed
              throw new Error(`Expected error but got status ${result.status}`);
            } catch (error) {
              if (error.response && error.response.status === 400) {
                // This is the expected error for invalid logs
                return { status: 400, data: error.response.data };
              }
              // Re-throw other errors to be handled by the retry logic
              throw error;
            }
          },
          {
            maxRetries: this.testConfig.maxRetries,
            initialDelay: this.testConfig.retryDelay,
            timeout: this.testConfig.timeout,
            shouldRetry: (error) => {
              // Only retry on network errors or server errors
              return !error.response || error.response.status >= 500;
            },
            onRetry: (error, attempt, delay) => {
              console.warn(`  ↳ Retry ${attempt} in ${delay}ms: ${error.message}`);
            }
          }
        );
        
        if (response.status === 400) {
          passedCount++;
          console.log(`  ✓ ${logTestName}: Rejected invalid log (${JSON.stringify(log).substring(0, 50)}...)`);
        } else {
          failedCount++;
          logError = `Expected 400 status but got ${response.status}`;
          console.error(`  ✗ ${logTestName}: ${logError}`);
          errors.push(`${logTestName}: ${logError}`);
        }
        
      } catch (error) {
        failedCount++;
        logError = error.response 
          ? `${error.response.status} ${error.response.statusText}: ${error.message}`
          : error.message;
        console.error(`  ✗ ${logTestName}: ${logError}`);
        errors.push(`${logTestName}: ${logError}`);
      } finally {
        this.recordResult({
          test: logTestName,
          passed: !logError,
          duration: Date.now() - logStart,
          error: logError || undefined,
          data: logError ? undefined : { log, expected: 'reject' }
        });
      }
    }
    
    // Record overall test result
    const overallPassed = failedCount === 0;
    const testDuration = Date.now() - testStart;
    
    this.recordResult({
      test: testName,
      passed: overallPassed,
      duration: testDuration,
      details: {
        total: invalidLogs.length,
        passed: passedCount,
        failed: failedCount,
        errors: errors.length > 0 ? errors : undefined
      }
    });
    
    if (overallPassed) {
      console.log(`✅ ${testName}: All ${passedCount} invalid logs were properly rejected in ${testDuration}ms`);
    } else {
      console.error(`❌ ${testName}: ${failedCount} of ${invalidLogs.length} invalid logs were not properly rejected`);
      if (errors.length > 0) {
        console.error('  Errors:', errors.join('\n    '));
      }
    }
    
    return overallPassed;
  }
  
  async testPerformance() {
    console.log('\n⏱️  Testing performance...');
    
    const testStart = Date.now();
    const testName = 'Performance test';
    const requests = [];
    const results = [];
    
    // Helper function to send a single log with retry
    const sendLog = async (log, attempt = 0) => {
      const startTime = Date.now();
      
      try {
        const response = await this.client.post(CONFIG.logEndpoint, log);
        const duration = Date.now() - startTime;
        
        if (response.status !== 200) {
          throw new Error(`Unexpected status: ${response.status}`);
        }
        
        return { success: true, duration, status: response.status };
      } catch (error) {
        if (attempt < CONFIG.retryCount) {
          await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelay * (attempt + 1)));
          return sendLog(log, attempt + 1);
        }
        
        return { 
          success: false, 
          duration: Date.now() - startTime,
          error: error.message,
          status: error.response?.status 
        };
      }
    };
    
    // Create test logs
    const testLogs = Array(CONFIG.testIterations).fill().map((_, i) => ({
      level: ['info', 'warn', 'error', 'debug'][i % 4],
      message: `Performance test message ${i + 1}`,
      data: { 
        testId: uuidv4(), 
        iteration: i,
        timestamp: new Date().toISOString()
      },
    }));
    
    // Process logs in batches to limit concurrency
    for (let i = 0; i < testLogs.length; i += CONFIG.maxConcurrentRequests) {
      const batch = testLogs.slice(i, i + CONFIG.maxConcurrentRequests);
      const batchResults = await Promise.all(batch.map(log => sendLog(log)));
      results.push(...batchResults);
      
      // Show progress
      const completed = Math.min(i + batch.length, testLogs.length);
      const progress = ((completed / testLogs.length) * 100).toFixed(1);
      process.stdout.write(`\r  ↳ Progress: ${completed}/${testLogs.length} (${progress}%)`);
    }
    
    console.log(); // New line after progress
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const totalDuration = Date.now() - testStart;
    const avgDuration = successful.length > 0 
      ? successful.reduce((sum, r) => sum + r.duration, 0) / successful.length
      : 0;
    
    const successRate = (successful.length / results.length * 100).toFixed(1);
    const requestsPerSecond = (results.length / (totalDuration / 1000)).toFixed(2);
    
    this.recordResult({
      test: testName,
      passed: failed.length === 0,
      duration: totalDuration,
      details: {
        total: results.length,
        successful: successful.length,
        failed: failed.length,
        successRate: `${successRate}%`,
        avgDuration: `${avgDuration.toFixed(2)}ms`,
        requestsPerSecond: `${requestsPerSecond} req/s`,
        totalDuration: `${(totalDuration / 1000).toFixed(2)}s`,
      },
    });
    
    console.log(`  ✓ Completed ${results.length} requests (${failed.length} failed, ${successRate}% success)`);
    console.log(`  ↳ Avg. response time: ${avgDuration.toFixed(2)}ms`);
    console.log(`  ↳ Throughput: ${requestsPerSecond} requests/second`);
    
    if (failed.length > 0) {
      console.error('  ↳ Failed requests:', failed.map(f => ({
        status: f.status,
        error: f.error
      })));
    }
  }
  
  async testRetrieveLogs() {
    console.log('\n🔍 Testing log retrieval...');
    const testName = 'Retrieve logs';
    let lastError = null;
    
    try {
      // First, ensure we have some logs to retrieve
      const testLog = {
        level: 'info',
        message: 'Test log for retrieval',
        data: { testId: uuidv4(), purpose: 'log retrieval test' },
      };
      
      // Send a test log to ensure we have data
      await withRetry(async () => {
        const response = await this.client.post(CONFIG.logEndpoint, testLog);
        if (response.status !== 200) {
          throw new Error(`Failed to create test log: ${response.status}`);
        }
      });
      
      // Now try to retrieve logs with retry
      const result = await withRetry(async () => {
        try {
          const response = await this.client.get(CONFIG.logsEndpoint, {
            params: { _t: Date.now() } // Prevent caching
          });
          
          if (response.status !== 200) {
            throw new Error(`Unexpected status: ${response.status}`);
          }
          
          if (!Array.isArray(response.data)) {
            throw new Error('Expected an array of logs');
          }
          
          return response.data;
        } catch (error) {
          lastError = error;
          throw error;
        }
      });
      
      const logs = result || [];
      const passed = logs.length > 0;
      
      this.recordResult({
        test: testName,
        passed,
        duration: Date.now() - this.testResults.startTime,
        details: {
          count: logs.length,
          sample: logs.slice(0, 3), // Include first 3 logs as sample
          firstLog: logs[0] || null,
        },
      });
      
      if (passed) {
        console.log(`  ✓ Retrieved ${logs.length} log entries`);
        if (logs.length > 0) {
          console.log('  ↳ Most recent log:', JSON.stringify({
            level: logs[0].level,
            message: logs[0].message,
            timestamp: logs[0].timestamp,
            data: logs[0].data
          }, null, 2));
        }
      } else {
        console.error('  ✗ No logs retrieved or invalid format');
      }
      
    } catch (error) {
      const errorMessage = lastError?.message || error.message;
      this.recordResult({
        test: testName,
        passed: false,
        error: errorMessage,
        details: {
          status: lastError?.response?.status,
          data: lastError?.response?.data,
          stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
        }
      });
      
      console.error('  ✗ Failed to retrieve logs:', errorMessage);
      if (lastError?.response?.data) {
        console.error('   Response:', JSON.stringify(lastError.response.data, null, 2));
      }
    }
  }
  
  recordResult({ test, passed, duration, error, details }) {
    this.testResults.total++;
    if (passed) {
      this.testResults.passed++;
      if (duration !== undefined) {
        this.testResults.responseTimes.push(duration);
      }
    } else {
      this.testResults.failed++;
      this.testResults.errors.push({
        test,
        error: error || 'Unknown error',
        details,
      });
    }
  }
  
  printSummary() {
    console.log('\n📊 Test Summary');
    console.log('='.repeat(50));
    
    const { total, passed, failed, errors, responseTimes } = this.testResults;
    const passRate = (passed / total * 100).toFixed(2);
    const avgResponseTime = responseTimes.length > 0 
      ? (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(2) + 'ms'
      : 'N/A';
    
    console.log(`✅ Passed: ${passed}/${total} (${passRate}%)`);
    console.log(`❌ Failed: ${failed}/${total}`);
    console.log(`⏱️  Avg. Response Time: ${avgResponseTime}`);
    
    if (errors.length > 0) {
      console.log('\n🔴 Errors:');
      errors.forEach((err, i) => {
        console.log(`\n${i + 1}. ${err.test}`);
        console.log(`   Error: ${err.error}`);
        if (err.details) {
          console.log('   Details:', JSON.stringify(err.details, null, 2));
        }
      });
    }
    
    console.log('\n🎉 Test completed!');
    process.exit(failed > 0 ? 1 : 0);
  }
}

// Run the tests
const tester = new LoggingTester();
tester.runTests().catch(console.error);
