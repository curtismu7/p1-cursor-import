# IMPORTANT: User Import Functionality

## Critical Implementation Details

### Content-Type Header
- **MUST** be set to `application/vnd.pingone.import.users+json` for user imports
- Any other content type will be rejected with a 415 error
- This is a hard requirement from the PingOne API

### Request Body Format
- The request body **MUST** be a JSON object with a `users` array
- Each user object in the array must match the PingOne user schema
- Example:
  ```json
  {
    "users": [
      {
        "email": "user@example.com",
        "username": "user1",
        "name": {
          "given": "John",
          "family": "Doe"
        },
        "population": {
          "id": "population-id-here"
        },
        "enabled": true
      }
    ]
  }
  ```

### Server-Side Handling
- The server uses a special middleware to handle the raw request body
- This is necessary because the PingOne API is very specific about the request format
- The middleware is configured in `routes/pingone-proxy.js`

## Common Issues and Solutions

### 415 Unsupported Media Type
- **Cause**: Incorrect or missing Content-Type header
- **Solution**: Ensure the Content-Type is exactly `application/vnd.pingone.import.users+json`

### 400 Bad Request
- **Cause**: Malformed request body
- **Solution**: Verify the request body matches the required format exactly

### Server Crashes
- **Cause**: Unhandled errors in the import process
- **Solution**: Use the provided monitoring script to automatically restart the server

## Monitoring and Maintenance

### Server Monitoring
- Use `monitor-server.sh` to ensure the server stays running
- Logs are written to `logs/server.log` and `logs/monitor.log`

### Testing
- Run the test suite with: `npm test`
- The test suite includes tests for the user import functionality

## Changes That Should Never Be Made

1. **DO NOT** modify the Content-Type header for user imports
2. **DO NOT** change the request body format for user imports
3. **DO NOT** remove or modify the raw body parsing middleware
4. **DO NOT** change the error handling for 415 errors

If you need to make changes to the import functionality, please:
1. Update the test suite first
2. Get the changes reviewed
3. Test thoroughly before deploying
