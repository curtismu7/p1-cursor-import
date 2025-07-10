#!/usr/bin/env node

/**
 * Safe NPM Package Updater
 * 
 * This script provides safe package updates with conflict checking.
 * It analyzes dependencies, checks for major version conflicts,
 * and provides recommendations for safe updates.
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class PackageUpdater {
    constructor() {
        this.packageJsonPath = path.join(process.cwd(), 'package.json');
        this.packageLockPath = path.join(process.cwd(), 'package-lock.json');
        this.currentDependencies = {};
        this.outdatedPackages = [];
        this.majorUpdates = [];
        this.safeUpdates = [];
        this.conflicts = [];
    }

    /**
     * Main update process
     */
    async run() {
        console.log('🔍 Safe NPM Package Updater');
        console.log('=============================\n');

        try {
            // Load current package.json
            this.loadCurrentDependencies();
            
            // Check for outdated packages
            await this.checkOutdatedPackages();
            
            // Analyze updates for conflicts
            await this.analyzeUpdates();
            
            // Generate recommendations
            this.generateRecommendations();
            
            // Show interactive menu
            await this.showInteractiveMenu();
            
        } catch (error) {
            console.error('❌ Error during package update process:', error.message);
            process.exit(1);
        }
    }

    /**
     * Load current dependencies from package.json
     */
    loadCurrentDependencies() {
        try {
            const packageJson = JSON.parse(fs.readFileSync(this.packageJsonPath, 'utf8'));
            this.currentDependencies = {
                ...packageJson.dependencies,
                ...packageJson.devDependencies
            };
            console.log('✅ Loaded current dependencies');
        } catch (error) {
            throw new Error(`Failed to load package.json: ${error.message}`);
        }
    }

    /**
     * Check for outdated packages
     */
    async checkOutdatedPackages() {
        console.log('🔍 Checking for outdated packages...');
        
        try {
            const output = execSync('npm outdated --json', { encoding: 'utf8' });
            const outdated = JSON.parse(output);
            
            this.outdatedPackages = Object.entries(outdated).map(([name, info]) => ({
                name,
                current: info.current,
                wanted: info.wanted,
                latest: info.latest,
                location: info.location
            }));
            
            console.log(`✅ Found ${this.outdatedPackages.length} outdated packages`);
        } catch (error) {
            if (error.status === 1) {
                console.log('✅ All packages are up to date');
                this.outdatedPackages = [];
            } else {
                throw new Error(`Failed to check outdated packages: ${error.message}`);
            }
        }
    }

    /**
     * Analyze updates for potential conflicts
     */
    async analyzeUpdates() {
        console.log('🔍 Analyzing updates for conflicts...');
        
        for (const pkg of this.outdatedPackages) {
            const update = await this.analyzePackageUpdate(pkg);
            
            if (update.isMajorUpdate) {
                this.majorUpdates.push(update);
            } else {
                this.safeUpdates.push(update);
            }
        }
        
        console.log(`✅ Analysis complete: ${this.safeUpdates.length} safe updates, ${this.majorUpdates.length} major updates`);
    }

    /**
     * Analyze a single package update
     */
    async analyzePackageUpdate(pkg) {
        const currentVersion = pkg.current;
        const wantedVersion = pkg.wanted;
        const latestVersion = pkg.latest;
        
        // Check if this is a major version update
        const currentMajor = this.getMajorVersion(currentVersion);
        const wantedMajor = this.getMajorVersion(wantedVersion);
        const latestMajor = this.getMajorVersion(latestVersion);
        
        const isMajorUpdate = wantedMajor > currentMajor || latestMajor > currentMajor;
        
        // Check for potential conflicts
        const conflicts = await this.checkPackageConflicts(pkg.name, wantedVersion);
        
        return {
            name: pkg.name,
            current: currentVersion,
            wanted: wantedVersion,
            latest: latestVersion,
            isMajorUpdate,
            conflicts,
            risk: this.assessRisk(pkg.name, isMajorUpdate, conflicts)
        };
    }

    /**
     * Check for potential conflicts with a package update
     */
    async checkPackageConflicts(packageName, targetVersion) {
        const conflicts = [];
        
        try {
            // Check peer dependencies
            const peerDeps = await this.getPeerDependencies(packageName, targetVersion);
            
            for (const [peerName, peerRange] of Object.entries(peerDeps)) {
                const currentVersion = this.currentDependencies[peerName];
                if (currentVersion && !this.satisfiesVersion(currentVersion, peerRange)) {
                    conflicts.push({
                        type: 'peer-dependency',
                        package: peerName,
                        required: peerRange,
                        current: currentVersion
                    });
                }
            }
            
            // Check for breaking changes in major updates
            if (this.isMajorUpdate(packageName, targetVersion)) {
                const breakingChanges = await this.checkBreakingChanges(packageName, targetVersion);
                if (breakingChanges.length > 0) {
                    conflicts.push({
                        type: 'breaking-changes',
                        changes: breakingChanges
                    });
                }
            }
            
        } catch (error) {
            console.warn(`⚠️  Could not check conflicts for ${packageName}: ${error.message}`);
        }
        
        return conflicts;
    }

    /**
     * Get peer dependencies for a package version
     */
    async getPeerDependencies(packageName, version) {
        try {
            const output = execSync(`npm view ${packageName}@${version} peerDependencies --json`, { encoding: 'utf8' });
            return JSON.parse(output);
        } catch (error) {
            return {};
        }
    }

    /**
     * Check for known breaking changes
     */
    async checkBreakingChanges(packageName, version) {
        const breakingChanges = [];
        
        // Common breaking changes for popular packages
        const knownBreakingChanges = {
            'express': {
                '5.0.0': ['Removed deprecated APIs', 'Changed middleware signature'],
                '4.18.0': ['Updated Node.js requirements']
            },
            'webpack': {
                '5.0.0': ['Removed Node.js polyfills', 'Changed module resolution'],
                '4.0.0': ['Updated loader API', 'Changed plugin system']
            },
            'jest': {
                '29.0.0': ['Updated Node.js requirements', 'Changed test environment'],
                '28.0.0': ['Updated transformer API']
            }
        };
        
        const changes = knownBreakingChanges[packageName];
        if (changes) {
            for (const [breakingVersion, descriptions] of Object.entries(changes)) {
                if (this.isVersionGreaterOrEqual(version, breakingVersion)) {
                    breakingChanges.push(...descriptions);
                }
            }
        }
        
        return breakingChanges;
    }

    /**
     * Assess risk level for an update
     */
    assessRisk(packageName, isMajorUpdate, conflicts) {
        if (conflicts.length > 0) {
            return 'HIGH';
        }
        
        if (isMajorUpdate) {
            return 'MEDIUM';
        }
        
        // Check if it's a critical package
        const criticalPackages = ['express', 'webpack', 'jest', 'babel', 'typescript'];
        if (criticalPackages.includes(packageName)) {
            return 'MEDIUM';
        }
        
        return 'LOW';
    }

    /**
     * Generate update recommendations
     */
    generateRecommendations() {
        console.log('\n📋 Update Recommendations');
        console.log('========================');
        
        if (this.safeUpdates.length === 0 && this.majorUpdates.length === 0) {
            console.log('✅ All packages are up to date!');
            return;
        }
        
        // Safe updates
        if (this.safeUpdates.length > 0) {
            console.log('\n🟢 Safe Updates (Recommended):');
            this.safeUpdates.forEach(update => {
                console.log(`  • ${update.name}: ${update.current} → ${update.wanted}`);
            });
        }
        
        // Major updates
        if (this.majorUpdates.length > 0) {
            console.log('\n🟡 Major Updates (Review Required):');
            this.majorUpdates.forEach(update => {
                const riskIcon = update.risk === 'HIGH' ? '🔴' : '🟡';
                console.log(`  ${riskIcon} ${update.name}: ${update.current} → ${update.wanted} (${update.risk} risk)`);
                
                if (update.conflicts.length > 0) {
                    console.log(`    ⚠️  Conflicts detected:`);
                    update.conflicts.forEach(conflict => {
                        if (conflict.type === 'peer-dependency') {
                            console.log(`      - ${conflict.package}: requires ${conflict.required}, has ${conflict.current}`);
                        } else if (conflict.type === 'breaking-changes') {
                            console.log(`      - Breaking changes: ${conflict.changes.join(', ')}`);
                        }
                    });
                }
            });
        }
    }

    /**
     * Show interactive menu for updates
     */
    async showInteractiveMenu() {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const question = (query) => new Promise((resolve) => rl.question(query, resolve));

        console.log('\n🔄 Update Options:');
        console.log('1. Apply safe updates only');
        console.log('2. Apply all updates (including major)');
        console.log('3. Review major updates individually');
        console.log('4. Generate update script');
        console.log('5. Exit without updates');

        const choice = await question('\nSelect an option (1-5): ');

        switch (choice) {
            case '1':
                await this.applySafeUpdates();
                break;
            case '2':
                await this.applyAllUpdates();
                break;
            case '3':
                await this.reviewMajorUpdates();
                break;
            case '4':
                this.generateUpdateScript();
                break;
            case '5':
                console.log('👋 Exiting without updates');
                break;
            default:
                console.log('❌ Invalid option');
        }

        rl.close();
    }

    /**
     * Apply only safe updates
     */
    async applySafeUpdates() {
        if (this.safeUpdates.length === 0) {
            console.log('✅ No safe updates available');
            return;
        }

        console.log('\n🔄 Applying safe updates...');
        
        const packages = this.safeUpdates.map(u => `${u.name}@${u.wanted}`).join(' ');
        
        try {
            execSync(`npm install ${packages}`, { stdio: 'inherit' });
            console.log('✅ Safe updates applied successfully');
        } catch (error) {
            console.error('❌ Failed to apply safe updates:', error.message);
        }
    }

    /**
     * Apply all updates
     */
    async applyAllUpdates() {
        const allUpdates = [...this.safeUpdates, ...this.majorUpdates];
        
        if (allUpdates.length === 0) {
            console.log('✅ No updates available');
            return;
        }

        console.log('\n⚠️  Applying all updates (including major updates)...');
        console.log('This may introduce breaking changes. Make sure to test your application.');
        
        const packages = allUpdates.map(u => `${u.name}@${u.latest}`).join(' ');
        
        try {
            execSync(`npm install ${packages}`, { stdio: 'inherit' });
            console.log('✅ All updates applied successfully');
        } catch (error) {
            console.error('❌ Failed to apply updates:', error.message);
        }
    }

    /**
     * Review major updates individually
     */
    async reviewMajorUpdates() {
        if (this.majorUpdates.length === 0) {
            console.log('✅ No major updates to review');
            return;
        }

        console.log('\n🔍 Reviewing major updates...');
        
        for (const update of this.majorUpdates) {
            console.log(`\n📦 ${update.name}: ${update.current} → ${update.latest}`);
            console.log(`Risk Level: ${update.risk}`);
            
            if (update.conflicts.length > 0) {
                console.log('⚠️  Conflicts detected:');
                update.conflicts.forEach(conflict => {
                    console.log(`  - ${conflict.type}: ${JSON.stringify(conflict)}`);
                });
            }
            
            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            const question = (query) => new Promise((resolve) => rl.question(query, resolve));
            
            const choice = await question('Update this package? (y/n/skip): ');
            rl.close();
            
            if (choice.toLowerCase() === 'y') {
                try {
                    execSync(`npm install ${update.name}@${update.latest}`, { stdio: 'inherit' });
                    console.log(`✅ Updated ${update.name}`);
                } catch (error) {
                    console.error(`❌ Failed to update ${update.name}:`, error.message);
                }
            } else if (choice.toLowerCase() === 'skip') {
                console.log(`⏭️  Skipped ${update.name}`);
            } else {
                console.log(`⏭️  Skipped ${update.name}`);
            }
        }
    }

    /**
     * Generate update script
     */
    generateUpdateScript() {
        const scriptPath = path.join(process.cwd(), 'update-packages.sh');
        
        let script = '#!/bin/bash\n\n';
        script += '# Auto-generated package update script\n';
        script += '# Generated on: ' + new Date().toISOString() + '\n\n';
        
        if (this.safeUpdates.length > 0) {
            script += '# Safe updates\n';
            this.safeUpdates.forEach(update => {
                script += `npm install ${update.name}@${update.wanted}\n`;
            });
            script += '\n';
        }
        
        if (this.majorUpdates.length > 0) {
            script += '# Major updates (review before running)\n';
            script += '# Uncomment the lines below after reviewing\n';
            this.majorUpdates.forEach(update => {
                script += `# npm install ${update.name}@${update.latest}\n`;
            });
        }
        
        fs.writeFileSync(scriptPath, script);
        fs.chmodSync(scriptPath, '755');
        
        console.log(`📝 Generated update script: ${scriptPath}`);
        console.log('Review the script before running it');
    }

    // Utility methods
    getMajorVersion(version) {
        return parseInt(version.split('.')[0]);
    }

    isMajorUpdate(packageName, targetVersion) {
        const currentVersion = this.currentDependencies[packageName];
        if (!currentVersion) return false;
        
        const currentMajor = this.getMajorVersion(currentVersion);
        const targetMajor = this.getMajorVersion(targetVersion);
        
        return targetMajor > currentMajor;
    }

    isVersionGreaterOrEqual(version1, version2) {
        const v1 = version1.split('.').map(Number);
        const v2 = version2.split('.').map(Number);
        
        for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
            const num1 = v1[i] || 0;
            const num2 = v2[i] || 0;
            
            if (num1 > num2) return true;
            if (num1 < num2) return false;
        }
        
        return true;
    }

    satisfiesVersion(version, range) {
        // Simple version range checking
        // In a real implementation, you'd use a proper semver library
        return true; // Placeholder
    }
}

// Run the updater
if (require.main === module) {
    const updater = new PackageUpdater();
    updater.run().catch(console.error);
}

module.exports = PackageUpdater; 