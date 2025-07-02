/**
 * API Module
 * Central export for all API-related functionality
 */

export { LocalAPIClient, localAPIClient } from '../local-api-client.js';
export { PingOneClient } from '../pingone-client.js';
export { APIFactory, apiFactory } from '../api-factory.js';

// Default export is the API factory
export default {
  LocalAPIClient,
  localAPIClient,
  PingOneClient,
  APIFactory,
  apiFactory
};
