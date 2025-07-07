module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(js|jsx|mjs)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(node-fetch|data-uri-to-buffer|fetch-blob|formdata-polyfill)/)',
  ],
  testMatch: [
    '**/test/**/*.test.js',
    '**/test/**/*.test.mjs',
  ],
  moduleFileExtensions: ['js', 'mjs', 'json'],
  verbose: true,
  testTimeout: 30000,
  setupFilesAfterEnv: ['<rootDir>/test/setup-tests.js'],
  testEnvironmentOptions: {
    url: 'http://localhost:4000'
  },
  globals: {
    'ts-jest': {
      useESM: true,
    },
  },
  preset: null,
};
