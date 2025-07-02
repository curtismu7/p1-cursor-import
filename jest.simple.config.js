export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(js|jsx|mjs)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(node-fetch|data-uri-to-buffer|fetch-blob|formdata-polyfill)/)',
  ],
  testMatch: [
    '**/test/**/*.test.js',
  ],
  moduleFileExtensions: ['js', 'mjs', 'json'],
  verbose: true,
  testTimeout: 30000,
  setupFiles: ['<rootDir>/test/setup.js'],
  setupFilesAfterEnv: ['<rootDir>/test/setup-tests.js'],
};
