# PingOne User Management Tool

A comprehensive web application for managing users in PingOne Identity Platform. This tool provides import, export, modify, and delete functionality for PingOne users with a modern, responsive interface.

## 📚 Quick Setup

**New to this application?** Start with our comprehensive [Setup Guide](SETUP.md) for detailed installation and configuration instructions.

## 🚀 Features

### Core Functionality
- **Import Users**: Bulk import users from CSV files into PingOne
- **Export Users**: Export users from PingOne to CSV format with customizable fields
- **Modify Users**: Update existing users with CSV data, including "Create if not exists" option
- **Delete Users**: Bulk delete users from PingOne using CSV files
- **Real-time Progress**: Live progress tracking for all operations
- **Batch Processing**: Intelligent batching to avoid API rate limits
- **Error Handling**: Comprehensive error handling with detailed reporting

### User Interface
- **Modern UI**: Clean, responsive interface with Bootstrap styling
- **Progress Screens**: Non-auto-closing progress windows with manual close buttons
- **Sequential Filenames**: Automatic sequential numbering for export files
- **Settings Management**: Easy configuration of PingOne credentials
- **Activity Logs**: Real-time logging of all operations
- **Connection Status**: Live PingOne connection status indicator

### Advanced Features
- **Rate Limiting**: Built-in rate limiting (50 requests/second) to respect PingOne API limits
- **Retry Logic**: Automatic retry for transient failures
- **Field Mapping**: Intelligent mapping between CSV fields and PingOne API fields
- **Immutable Field Handling**: Proper handling of immutable fields (like `enabled`)
- **Population Management**: Support for multiple populations
- **Password Generation**: Optional automatic password generation for new users

## 📋 Prerequisites

- **Node.js**: 16.x or later
- **npm**: 8.x or later
- **Modern Browser**: Chrome, Firefox, Safari, Edge
- **PingOne Account**: With Admin API access
- **API Credentials**: Client ID and Secret with appropriate permissions
- **Environment ID**: Where users will be managed

## 🛠️ Setup

### 1. Clone and Install
```bash
git clone https://github.com/your-username/PingOne-import.git
cd PingOne-import
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory:

```bash
# PingOne Configuration
PINGONE_CLIENT_ID=your_client_id_here
PINGONE_CLIENT_SECRET=your_client_secret_here
PINGONE_ENVIRONMENT_ID=your_environment_id_here
PINGONE_REGION=NorthAmerica  # Or: Europe, AsiaPacific, Canada, Australia

# Server Configuration
PORT=4000
NODE_ENV=development

# Logging
LOG_LEVEL=info  # Set to 'debug' for verbose logging
```

**Security Note:** Never commit the `.env` file to version control. It's already included in `.gitignore`.

### 3. Get PingOne Credentials
1. Log into your PingOne Admin Console
2. Navigate to your environment
3. Go to Applications → Create Application
4. Choose "Client Credentials" grant type
5. Add "PingOne API" scope to the application
6. Copy the Client ID and Secret

### 4. Start the Application
```bash
npm start
# or for development with auto-reload:
npm run dev
```

### 5. Access the Application
Open [http://localhost:4000](http://localhost:4000) in your browser.

## 📖 Usage

### Import Users
1. **Prepare CSV File**: Create a CSV with user data
2. **Upload File**: Use the Import page to upload your CSV
3. **Review Preview**: Check the parsed data before importing
4. **Configure Options**: Set population, enabled status, password generation
5. **Start Import**: Click "Import Users" and monitor progress

### Export Users
1. **Select Population**: Choose which population to export from
2. **Choose Fields**: Select basic, custom, or all fields
3. **Export**: Click "Export Users" to download CSV
4. **Sequential Files**: Files are automatically numbered (e.g., `pingone-users-export-2025-07-07-001.csv`)

### Modify Users
1. **Prepare CSV**: Create CSV with user modifications
2. **Upload File**: Use the Modify page to upload CSV
3. **Configure Options**: 
   - Enable "Create if not exists" to create missing users
   - Set default population and enabled status
   - Choose password generation for new users
4. **Start Modification**: Click "Modify Users" and monitor progress

### Delete Users
1. **Prepare CSV**: Create CSV with usernames or emails to delete
2. **Upload File**: Use the Delete page to upload CSV
3. **Confirm**: Review the users to be deleted
4. **Start Deletion**: Click "Delete Users" and monitor progress

## 📄 CSV Formats

### Import CSV Format
Required columns:
- `email` - User's email address
- `firstName` or `givenName` - User's first name
- `lastName` or `surname` - User's last name

Optional columns:
- `username` - Custom username (defaults to email)
- `enabled` - Account status (true/false)
- `populationId` - Population ID
- `phoneNumber` - Phone number
- `title` - Job title
- `department` - Department

Example:
```csv
email,firstName,lastName,username,enabled,title,department
john.doe@example.com,John,Doe,johndoe,true,Developer,Engineering
jane.smith@example.com,Jane,Smith,janesmith,true,Manager,Product
```

### Modify CSV Format
Same as Import format, but only include fields you want to modify:
```csv
email,firstName,lastName,title,department
john.doe@example.com,John,Updated,Senior Developer,Engineering
jane.smith@example.com,Jane,Smith,Product Manager,Product
```

### Delete CSV Format
Include either username or email:
```csv
username,email
johndoe,john.doe@example.com
janesmith,jane.smith@example.com
```

## 🔧 API Endpoints

### Core Endpoints
- `GET /api/health` - Server health and PingOne connection status
- `GET /api/settings` - Get current settings
- `PUT /api/settings` - Update settings
- `POST /api/import` - Import users from CSV
- `POST /api/export-users` - Export users to CSV
- `POST /api/modify` - Modify users from CSV
- `POST /api/delete` - Delete users from CSV

### PingOne Proxy Endpoints
- `GET /api/pingone/environments/{envId}/users` - List users
- `POST /api/pingone/environments/{envId}/users` - Create user
- `PUT /api/pingone/environments/{envId}/users/{userId}` - Update user
- `DELETE /api/pingone/environments/{envId}/users/{userId}` - Delete user
- `GET /api/pingone/populations` - List populations

### Logging Endpoints
- `POST /api/logs/info` - Log info message
- `POST /api/logs/error` - Log error message
- `POST /api/logs/warning` - Log warning message
- `GET /api/logs/ui` - Get UI logs
- `GET /api/logs/disk` - Get disk logs

## ⚙️ Configuration

### Environment Variables
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `PINGONE_CLIENT_ID` | PingOne Client ID | Yes | - |
| `PINGONE_CLIENT_SECRET` | PingOne Client Secret | Yes | - |
| `PINGONE_ENVIRONMENT_ID` | PingOne Environment ID | Yes | - |
| `PINGONE_REGION` | PingOne Region | No | NorthAmerica |
| `PORT` | Server port | No | 4000 |
| `NODE_ENV` | Environment | No | development |
| `LOG_LEVEL` | Logging level | No | info |

### Rate Limiting
- **API Requests**: 50 requests/second (PingOne limit)
- **Batch Size**: 10 users per batch (configurable)
- **Delay Between Batches**: 1 second (configurable)

## 🔒 Security Features

- **Server-side API calls**: No credentials in browser
- **Encrypted storage**: API secrets stored encrypted
- **Environment variables**: Secure credential management
- **CORS protection**: Proper CORS headers
- **Input validation**: Comprehensive data validation
- **Error sanitization**: No sensitive data in error messages

## 🐛 Troubleshooting

### Common Issues

**"Authentication Failed"**
- Check your Client ID and Secret
- Verify the API credentials have correct scopes
- Ensure the Environment ID is correct

**"Rate Limit Exceeded"**
- The application automatically handles rate limiting
- Wait a moment and try again
- Check the progress logs for details

**"User not found" during Modify**
- Enable "Create if not exists" option
- Check that usernames/emails exist in PingOne
- Verify CSV format is correct

**"Field is immutable"**
- Some fields like `enabled` cannot be modified
- The application will skip these fields and show warnings

### Logs
- **UI Logs**: Real-time logs in the browser
- **Server Logs**: Check `logs/combined.log` and `logs/error.log`
- **Debug Mode**: Set `LOG_LEVEL=debug` for verbose logging

## 🧪 Testing

Run the test suite:
```bash
npm test
```

Run specific tests:
```bash
npm run test:unit
npm run test:integration
npm run test:e2e
```

## 📝 Development

### Project Structure
```
├── public/           # Frontend assets
│   ├── js/          # JavaScript modules
│   ├── css/         # Stylesheets
│   └── index.html   # Main HTML file
├── routes/          # API routes
├── server/          # Server modules
├── test/            # Test files
├── logs/            # Log files
└── data/            # Settings and data files
```

### Key Technologies
- **Backend**: Node.js, Express.js
- **Frontend**: Vanilla JavaScript, Bootstrap
- **File Processing**: Multer, CSV parsing
- **Logging**: Winston
- **Testing**: Jest, Supertest

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For issues and questions:
1. Check the troubleshooting section above
2. Review the logs for error details
3. Create an issue on GitHub with:
   - Description of the problem
   - Steps to reproduce
   - Log files (with sensitive data removed)
   - Environment details

## 🔄 Changelog

### Version 4.1.0
- ✅ Added Modify functionality with "Create if not exists" option
- ✅ Fixed immutable field handling (enabled status)
- ✅ Added sequential filename generation for exports
- ✅ Improved progress screens with manual close buttons
- ✅ Enhanced error handling and user feedback
- ✅ Added comprehensive logging system
- ✅ Fixed API secret encryption and decryption
- ✅ Improved rate limiting and batch processing
- ✅ Added population management support
- ✅ Enhanced CSV validation and field mapping

### Version 4.0.0
- ✅ Complete rewrite with modern architecture
- ✅ Server-side API proxy for security
- ✅ Real-time progress tracking
- ✅ Comprehensive error handling
- ✅ Export functionality with customizable fields
- ✅ Delete functionality with CSV support
- ✅ Settings management interface
- ✅ Activity logging system

---

**Note**: This tool is designed for PingOne Identity Platform. Ensure you have appropriate permissions and follow your organization's security policies when using this tool.
