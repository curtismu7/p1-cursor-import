# Auto-Update System for NPM Packages

This document describes the automated package update system implemented for the PingOne User Import Tool.

## Overview

The auto-update system provides safe, automated updates for NPM packages with conflict checking and risk assessment. It includes multiple tools for different update scenarios:

- **Interactive Updater**: Full-featured updater with conflict analysis
- **Automated Updater**: Simple automated updates for cron jobs
- **Conflict Checker**: Pre-update conflict analysis
- **Cron Job Script**: Shell script for scheduled updates

## Available Scripts

### 1. Interactive Package Updater (`scripts/package-updater.js`)

A comprehensive updater with interactive features:

```bash
npm run update:check
# or
node scripts/package-updater.js
```

**Features:**
- Interactive menu for update options
- Conflict detection and analysis
- Risk assessment for each package
- Breaking changes detection
- Peer dependency checking
- Individual package review
- Update script generation

**Options:**
1. Apply safe updates only
2. Apply all updates (including major)
3. Review major updates individually
4. Generate update script
5. Exit without updates

### 2. Automated Updater (`scripts/auto-update.js`)

Simple automated updater for cron jobs:

```bash
npm run update:auto
# or
node scripts/auto-update.js
```

**Features:**
- Automatic safe updates only
- Backup creation before updates
- Automatic rollback on failure
- Detailed logging
- No user interaction required

### 3. Conflict Checker (`scripts/conflict-checker.js`)

Pre-update conflict analysis:

```bash
npm run update:conflicts
# or
node scripts/conflict-checker.js
```

**Features:**
- Comprehensive conflict analysis
- Breaking changes detection
- Peer dependency checking
- Risk assessment
- Detailed reports
- Recommendations

### 4. Safe Update Command (`npm run update:safe`)

Combines conflict checking with auto-update:

```bash
npm run update:safe
```

This runs the conflict checker first, then the auto-updater if no high-risk conflicts are found.

### 5. Cron Job Script (`scripts/cron-updater.sh`)

Shell script for scheduled updates:

```bash
# Make executable
chmod +x scripts/cron-updater.sh

# Run manually
./scripts/cron-updater.sh

# Add to crontab (example: daily at 2 AM)
# 0 2 * * * /path/to/project/scripts/cron-updater.sh
```

## Configuration

### Environment Variables

The scripts can be configured using environment variables:

```bash
# Update frequency (for cron jobs)
UPDATE_FREQUENCY=daily

# Log level
LOG_LEVEL=info

# Backup retention
BACKUP_RETENTION_DAYS=7

# Test after update
RUN_TESTS_AFTER_UPDATE=true

# Rebuild after update
REBUILD_AFTER_UPDATE=true
```

### Package.json Scripts

The following scripts are available in package.json:

```json
{
  "scripts": {
    "update:check": "node scripts/package-updater.js",
    "update:auto": "node scripts/auto-update.js",
    "update:conflicts": "node scripts/conflict-checker.js",
    "update:safe": "npm run update:conflicts && npm run update:auto"
  }
}
```

## Risk Assessment

The system categorizes updates into risk levels:

### 🔴 HIGH RISK
- Breaking changes detected
- Peer dependency conflicts
- Critical package major updates

### 🟡 MEDIUM RISK
- Major version updates
- Critical package updates
- Known breaking changes

### 🟢 LOW RISK
- Minor/patch updates
- Non-critical packages
- No conflicts detected

## Conflict Detection

The system checks for various types of conflicts:

### 1. Breaking Changes
- Known breaking changes for popular packages
- Major version updates
- API changes

### 2. Peer Dependencies
- Required peer dependencies
- Version compatibility
- Missing dependencies

### 3. Critical Packages
- Framework updates (Express, Webpack, etc.)
- Build tool updates
- Testing framework updates

## Logging and Monitoring

### Log Files

- `update-log.json`: JSON log of all updates
- `update-cron.log`: Cron job execution logs
- `package.json.backup`: Backup before updates

### Log Format

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "duration": 15000,
  "safeUpdates": [
    {
      "name": "lodash",
      "from": "4.17.21",
      "to": "4.17.22"
    }
  ],
  "majorUpdates": [
    {
      "name": "express",
      "from": "4.18.0",
      "to": "4.18.1"
    }
  ],
  "status": "success"
}
```

## Cron Job Setup

### 1. Edit Crontab

```bash
crontab -e
```

### 2. Add Update Job

```bash
# Daily at 2 AM
0 2 * * * /path/to/project/scripts/cron-updater.sh

# Weekly on Sunday at 3 AM
0 3 * * 0 /path/to/project/scripts/cron-updater.sh

# Every 6 hours
0 */6 * * * /path/to/project/scripts/cron-updater.sh
```

### 3. Monitor Logs

```bash
# Check cron logs
tail -f /path/to/project/update-cron.log

# Check update logs
cat /path/to/project/update-log.json
```

## Best Practices

### 1. Testing
- Always test after updates
- Run your application's test suite
- Verify functionality manually

### 2. Backups
- Keep backups before major updates
- Use version control (Git)
- Document breaking changes

### 3. Monitoring
- Monitor logs regularly
- Set up alerts for failures
- Review update reports

### 4. Gradual Updates
- Update in stages for major changes
- Test each stage thoroughly
- Rollback if issues arise

## Troubleshooting

### Common Issues

1. **Lock File Exists**
   ```bash
   rm /path/to/project/update-cron.lock
   ```

2. **Permission Denied**
   ```bash
   chmod +x scripts/*.js scripts/*.sh
   ```

3. **Node.js Not Found**
   - Update `NODE_PATH` in cron script
   - Use absolute paths

4. **Update Fails**
   - Check logs for errors
   - Restore from backup
   - Review conflicts

### Debug Mode

Run with verbose logging:

```bash
DEBUG=* node scripts/package-updater.js
```

## Security Considerations

1. **Backup Strategy**
   - Keep multiple backups
   - Test restore procedures
   - Use version control

2. **Access Control**
   - Limit cron job permissions
   - Use dedicated user account
   - Monitor file permissions

3. **Network Security**
   - Use private npm registry if needed
   - Verify package integrity
   - Monitor for suspicious packages

## Advanced Configuration

### Custom Breaking Changes

Add custom breaking changes to `scripts/conflict-checker.js`:

```javascript
const knownBreakingChanges = {
  'your-package': {
    '2.0.0': ['Breaking change description'],
    '1.5.0': ['Another breaking change']
  }
};
```

### Custom Critical Packages

Modify the critical packages list:

```javascript
const criticalPackages = [
  'your-critical-package',
  'another-important-package'
];
```

### Custom Update Logic

Extend the update classes for custom logic:

```javascript
class CustomUpdater extends PackageUpdater {
  async customUpdateLogic() {
    // Your custom logic here
  }
}
```

## Support

For issues or questions:

1. Check the logs for error messages
2. Review the conflict reports
3. Test manually with `npm run update:check`
4. Restore from backup if needed

## Future Enhancements

Potential improvements:

1. **Remote Configuration**: Fetch settings from remote service
2. **Rollback Automation**: Automatic rollback on test failures
3. **Notification System**: Email/Slack notifications for updates
4. **Dependency Graph Analysis**: Advanced conflict detection
5. **Update Scheduling**: More sophisticated scheduling options
6. **Performance Monitoring**: Track update impact on performance 