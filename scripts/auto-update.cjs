#!/usr/bin/env node

/**
 * Automated NPM Package Updater
 * 
 * This script provides automated package updates with safety checks.
 * It can be run as a cron job or scheduled task.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class AutoUpdater {
    constructor() {
        this.packageJsonPath = path.join(process.cwd(), 'package.json');
        this.logPath = path.join(process.cwd(), 'update-log.json');
        this.backupPath = path.join(process.cwd(), 'package.json.backup');
        this.currentDependencies = {};
        this.safeUpdates = [];
        this.majorUpdates = [];
    }

    /**
     * Main update process
     */
    async run() {
        const startTime = new Date();
        console.log(`🔄 Auto-update started at ${startTime.toISOString()}`);

        try {
            // Load current dependencies
            this.loadCurrentDependencies();
            
            // Check for outdated packages
            await this.checkOutdatedPackages();
            
            // Apply safe updates only
            await this.applySafeUpdates();
            
            // Log the update
            this.logUpdate(startTime);
            
            console.log('✅ Auto-update completed successfully');
            
        } catch (error) {
            console.error('❌ Auto-update failed:', error.message);
            this.logError(error);
            process.exit(1);
        }
    }

    /**
     * Load current dependencies
     */
    loadCurrentDependencies() {
        try {
            const packageJson = JSON.parse(fs.readFileSync(this.packageJsonPath, 'utf8'));
            this.currentDependencies = {
                ...packageJson.dependencies,
                ...packageJson.devDependencies
            };
        } catch (error) {
            throw new Error(`Failed to load package.json: ${error.message}`);
        }
    }

    /**
     * Check for outdated packages
     */
    async checkOutdatedPackages() {
        try {
            const output = execSync('npm outdated --json', { encoding: 'utf8' });
            const outdated = JSON.parse(output);
            
            const packages = Object.entries(outdated).map(([name, info]) => ({
                name,
                current: info.current,
                wanted: info.wanted,
                latest: info.latest
            }));
            
            // Separate safe and major updates
            for (const pkg of packages) {
                const currentMajor = this.getMajorVersion(pkg.current);
                const wantedMajor = this.getMajorVersion(pkg.wanted);
                
                if (wantedMajor > currentMajor) {
                    this.majorUpdates.push(pkg);
                } else {
                    this.safeUpdates.push(pkg);
                }
            }
            
            console.log(`Found ${this.safeUpdates.length} safe updates and ${this.majorUpdates.length} major updates`);
            
        } catch (error) {
            if (error.status === 1) {
                console.log('All packages are up to date');
                return;
            }
            throw new Error(`Failed to check outdated packages: ${error.message}`);
        }
    }

    /**
     * Apply only safe updates
     */
    async applySafeUpdates() {
        if (this.safeUpdates.length === 0) {
            console.log('No safe updates available');
            return;
        }

        // Create backup
        this.createBackup();
        
        console.log(`Applying ${this.safeUpdates.length} safe updates...`);
        
        const packages = this.safeUpdates.map(u => `${u.name}@${u.wanted}`).join(' ');
        
        try {
            execSync(`npm install ${packages}`, { stdio: 'inherit' });
            console.log('Safe updates applied successfully');
        } catch (error) {
            console.error('Failed to apply safe updates:', error.message);
            this.restoreBackup();
            throw error;
        }
    }

    /**
     * Create backup of package.json
     */
    createBackup() {
        try {
            fs.copyFileSync(this.packageJsonPath, this.backupPath);
            console.log('Created backup of package.json');
        } catch (error) {
            console.warn('Failed to create backup:', error.message);
        }
    }

    /**
     * Restore backup if update fails
     */
    restoreBackup() {
        try {
            if (fs.existsSync(this.backupPath)) {
                fs.copyFileSync(this.backupPath, this.packageJsonPath);
                console.log('Restored package.json from backup');
            }
        } catch (error) {
            console.error('Failed to restore backup:', error.message);
        }
    }

    /**
     * Log the update
     */
    logUpdate(startTime) {
        const endTime = new Date();
        const logEntry = {
            timestamp: endTime.toISOString(),
            duration: endTime - startTime,
            safeUpdates: this.safeUpdates.map(u => ({
                name: u.name,
                from: u.current,
                to: u.wanted
            })),
            majorUpdates: this.majorUpdates.map(u => ({
                name: u.name,
                from: u.current,
                to: u.latest
            })),
            status: 'success'
        };

        this.writeLog(logEntry);
    }

    /**
     * Log error
     */
    logError(error) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            error: error.message,
            status: 'error'
        };

        this.writeLog(logEntry);
    }

    /**
     * Write to log file
     */
    writeLog(logEntry) {
        try {
            let logs = [];
            if (fs.existsSync(this.logPath)) {
                logs = JSON.parse(fs.readFileSync(this.logPath, 'utf8'));
            }
            
            logs.push(logEntry);
            
            // Keep only last 100 entries
            if (logs.length > 100) {
                logs = logs.slice(-100);
            }
            
            fs.writeFileSync(this.logPath, JSON.stringify(logs, null, 2));
        } catch (error) {
            console.warn('Failed to write log:', error.message);
        }
    }

    /**
     * Get major version number
     */
    getMajorVersion(version) {
        return parseInt(version.split('.')[0]);
    }
}

// Run the updater
if (require.main === module) {
    const updater = new AutoUpdater();
    updater.run().catch(console.error);
}

module.exports = AutoUpdater; 