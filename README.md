# PingOne User Import Tool

A modern web application for importing users into PingOne using the PingOne Admin API.

## Features

- Import users from CSV files into PingOne
- Clean, responsive UI built with PingOne Nano CSS and PingOne Icons
- Real-time CSV preview with validation
- Secure server-side API calls to avoid CORS issues
- Activity logging for all operations
- Support for large file processing with streaming
- Secure API key management using environment variables

## Prerequisites

- Node.js 16.x or later
- npm 8.x or later
- Modern web browser (Chrome, Firefox, Safari, Edge)
- PingOne account with Admin API access
- API credentials (Client ID and Secret) with appropriate permissions
- Environment ID where users will be imported

## Setup

1. Clone this repository:
   ```bash
   git clone https://github.com/your-username/PingOne-import.git
   cd PingOne-import
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   - Copy the example environment file:
     ```bash
     cp .env.example .env
     ```
   - Edit the `.env` file with your PingOne credentials:
     ```bash
     # Get these values from your PingOne Admin Console
     # 1. Go to your environment
     # 2. Navigate to Applications
     # 3. Create or select an application with 'Client Credentials' grant type
     # 4. Add 'PingOne API' scope to the application
     PINGONE_CLIENT_ID=your_client_id_here
     PINGONE_CLIENT_SECRET=your_client_secret_here
     PINGONE_ENVIRONMENT_ID=your_environment_id_here  # Find this in the URL when viewing your environment
     PINGONE_REGION=NorthAmerica  # Or your region (e.g., Europe, AsiaPacific)
     
     # Server Configuration
     PORT=4000
     NODE_ENV=development
     
     # Logging
     LOG_LEVEL=info  # Set to 'debug' for more verbose logging
     ```

   **Security Note:** Never commit the `.env` file to version control. It's already included in `.gitignore`.

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open your browser to [http://localhost:4000](http://localhost:4000)
   Then edit the `.env` file and add your PingOne API credentials.

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open `http://localhost:3000` in your web browser.

## Usage

1. **Configure Environment Variables**
   - Copy `.env.example` to `.env`
   - Add your PingOne API credentials to the `.env` file
   - Set the appropriate region and environment ID

2. **Start the Server**
   ```bash
   npm start
   # or for development with auto-reload:
   npm run dev
   ```

3. **Using the Web Interface**
   - Open `http://localhost:3000` in your browser
   - The application will now make all API calls through the server-side proxy
   - No need to enter API credentials in the browser - they are managed server-side

4. **Import Users**
   - Go to the Import page
   - Click "Choose CSV File" and select your CSV file
   - Review the preview to ensure data is parsed correctly
   - Click "Import Users" to start the import process

## CSV Format

The CSV file should have a header row with column names. Required columns are:

- `email` - User's email address
- `givenName` - User's first name
- `surname` - User's last name

Example CSV:

```csv
email,givenName,surname,phoneNumber
test1@example.com,John,Doe,+1234567890
test2@example.com,Jane,Smith,+1987654321
```

## API Configuration

To use this application, you'll need:

1. A PingOne environment ID
2. API credentials (Client ID and Secret) with the following scopes:
   - `users:read`
   - `users:create`
   - `users:update`

---

## API Endpoints: Settings & Logs

### Settings API (`/api/settings`)

- **GET `/api/settings`**
  - Returns the current settings (from `data/settings.json` or defaults).
  - **Response:**
    ```json
    {
      "success": true,
      "data": {
        "environmentId": "...",
        "apiClientId": "...",
        "populationId": "...",
        "region": "NorthAmerica"
      }
    }
    ```

- **POST `/api/settings`**
  - Updates the settings. Requires JSON body with at least `environmentId` and `apiClientId`.
  - If `region` is missing, defaults to `NorthAmerica`. If `apiSecret` is omitted but exists, it is preserved.
  - **Request Body Example:**
    ```json
    {
      "environmentId": "env-123",
      "apiClientId": "client-abc",
      "apiSecret": "supersecret",
      "populationId": "pop-xyz",
      "region": "Europe"
    }
    ```
  - **Response:**
    ```json
    {
      "success": true,
      "message": "Settings saved successfully",
      "data": {
        "environmentId": "env-123",
        "apiClientId": "client-abc",
        "populationId": "pop-xyz",
        "region": "Europe"
      }
    }
    ```

---

### Logs API (`/api/logs`)

- **POST `/api/logs/ui`**
  - Adds a UI log entry (kept in memory).
  - **Body:** `{ "level": "info", "message": "...", "data": { ... } }`
  - **Response:** `{ "success": true, "message": "UI log entry created", "id": "..." }`

- **GET `/api/logs/ui`**
  - Returns recent UI logs from memory.
  - Query params: `limit`, `level`
  - **Response:** `{ "success": true, "count": 1, "total": 1, "logs": [ ... ] }`

- **POST `/api/logs/disk`**
  - Appends a log entry to disk (`logs/client.log`).
  - **Body:** `{ "level": "info", "message": "...", "data": { ... } }`
  - **Response:** `{ "success": true, "message": "Disk log entry created", "id": "..." }`

- **GET `/api/logs/disk`**
  - Reads logs from disk.
  - Query params: `limit`, `level`
  - **Response:** `{ "success": true, "count": 1, "total": 1, "logs": [ ... ] }`

- **Legacy Endpoints**
  - `/api/logs/` (GET/POST): For backward compatibility, proxies to `/api/logs/disk`.

---

## Security

- API credentials are stored in the browser's localStorage (encrypted in modern browsers)
- No credentials are sent to any server other than PingOne's API endpoints
- For production use, consider implementing server-side authentication and token management

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Development

This is a client-side only application built with vanilla JavaScript. No build step is required.

### Project Structure

```
PingOne-import/
├── index.html          # Main HTML file
├── css/
│   └── styles.css     # Custom styles
├── js/
│   ├── app.js         # Main application entry point
│   └── modules/        # Application modules
│       ├── file-handler.js  # CSV file processing
│       ├── logger.js        # Logging functionality
│       ├── pingone-api.js   # PingOne API client
│       ├── settings-manager.js # Settings management
│       └── ui-manager.js    # UI management
└── README.md           # This file
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For support, please open an issue in the GitHub repository.
