export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.m?js$': 'babel-jest',
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
};
