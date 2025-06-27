/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: '<rootDir>/test/custom-test-env.js',
  moduleFileExtensions: ['js'],
  testMatch: ['**/test/**/*.test.js'],
  collectCoverageFrom: [
    'public/js/**/*.js',
    '!**/node_modules/**',
    '!**/vendor/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  setupFiles: ['<rootDir>/test/setupTests.js'],
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(uuid|whatwg-url)/)'
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/public/js/$1',
  },
  testEnvironmentOptions: {
    url: 'http://localhost',
  },
  globals: {
    TextEncoder: require('util').TextEncoder,
    TextDecoder: require('util').TextDecoder,
  },
};
