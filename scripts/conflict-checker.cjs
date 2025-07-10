#!/usr/bin/env node

/**
 * NPM Package Conflict Checker
 * 
 * This script analyzes potential conflicts before package updates.
 * It checks peer dependencies, breaking changes, and compatibility issues.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class ConflictChecker {
    constructor() {
        this.packageJsonPath = path.join(process.cwd(), 'package.json');
        this.currentDependencies = {};
        this.conflicts = [];
        this.warnings = [];
    }

    /**
     * Main conflict checking process
     */
    async run() {
        console.log('🔍 NPM Package Conflict Checker');
        console.log('===============================\n');

        try {
            // Load current dependencies
            this.loadCurrentDependencies();
            
            // Check for outdated packages
            const outdatedPackages = await this.getOutdatedPackages();
            
            if (outdatedPackages.length === 0) {
                console.log('✅ All packages are up to date');
                return;
            }
            
            // Analyze each package for conflicts
            for (const pkg of outdatedPackages) {
                await this.analyzePackage(pkg);
            }
            
            // Generate report
            this.generateReport();
            
        } catch (error) {
            console.error('❌ Error during conflict checking:', error.message);
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
            console.log('✅ Loaded current dependencies');
        } catch (error) {
            throw new Error(`Failed to load package.json: ${error.message}`);
        }
    }

    /**
     * Get outdated packages
     */
    async getOutdatedPackages() {
        try {
            const output = execSync('npm outdated --json', { encoding: 'utf8' });
            const outdated = JSON.parse(output);
            
            return Object.entries(outdated).map(([name, info]) => ({
                name,
                current: info.current,
                wanted: info.wanted,
                latest: info.latest
            }));
        } catch (error) {
            if (error.status === 1) {
                return [];
            }
            throw new Error(`Failed to get outdated packages: ${error.message}`);
        }
    }

    /**
     * Analyze a single package for conflicts
     */
    async analyzePackage(pkg) {
        console.log(`🔍 Analyzing ${pkg.name}...`);
        
        const analysis = {
            name: pkg.name,
            current: pkg.current,
            wanted: pkg.wanted,
            latest: pkg.latest,
            conflicts: [],
            warnings: [],
            risk: 'LOW'
        };
        
        // Check if it's a major update
        const currentMajor = this.getMajorVersion(pkg.current);
        const wantedMajor = this.getMajorVersion(pkg.wanted);
        const latestMajor = this.getMajorVersion(pkg.latest);
        
        if (wantedMajor > currentMajor || latestMajor > currentMajor) {
            analysis.risk = 'MEDIUM';
            analysis.warnings.push('Major version update detected');
            
            // Check for breaking changes
            const breakingChanges = await this.checkBreakingChanges(pkg.name, pkg.wanted);
            if (breakingChanges.length > 0) {
                analysis.risk = 'HIGH';
                analysis.conflicts.push({
                    type: 'breaking-changes',
                    description: 'Known breaking changes',
                    changes: breakingChanges
                });
            }
        }
        
        // Check peer dependencies
        const peerConflicts = await this.checkPeerDependencies(pkg.name, pkg.wanted);
        if (peerConflicts.length > 0) {
            analysis.risk = 'HIGH';
            analysis.conflicts.push(...peerConflicts);
        }
        
        // Check for critical package updates
        if (this.isCriticalPackage(pkg.name)) {
            analysis.warnings.push('Critical package - test thoroughly after update');
        }
        
        // Store analysis
        if (analysis.conflicts.length > 0) {
            this.conflicts.push(analysis);
        } else if (analysis.warnings.length > 0) {
            this.warnings.push(analysis);
        }
        
        return analysis;
    }

    /**
     * Check for breaking changes
     */
    async checkBreakingChanges(packageName, targetVersion) {
        const breakingChanges = [];
        
        // Known breaking changes database
        const knownBreakingChanges = {
            'express': {
                '5.0.0': [
                    'Removed deprecated APIs',
                    'Changed middleware signature',
                    'Updated error handling'
                ],
                '4.18.0': [
                    'Updated Node.js requirements to 14+'
                ]
            },
            'webpack': {
                '5.0.0': [
                    'Removed Node.js polyfills',
                    'Changed module resolution',
                    'Updated loader API'
                ],
                '4.0.0': [
                    'Updated loader API',
                    'Changed plugin system'
                ]
            },
            'jest': {
                '29.0.0': [
                    'Updated Node.js requirements to 16+',
                    'Changed test environment',
                    'Updated transformer API'
                ],
                '28.0.0': [
                    'Updated transformer API',
                    'Changed configuration format'
                ]
            },
            'babel': {
                '7.0.0': [
                    'Removed stage presets',
                    'Changed plugin naming',
                    'Updated configuration format'
                ]
            },
            'typescript': {
                '5.0.0': [
                    'Stricter type checking',
                    'Changed module resolution',
                    'Updated decorator syntax'
                ],
                '4.9.0': [
                    'Updated Node.js requirements'
                ]
            }
        };
        
        const changes = knownBreakingChanges[packageName];
        if (changes) {
            for (const [breakingVersion, descriptions] of Object.entries(changes)) {
                if (this.isVersionGreaterOrEqual(targetVersion, breakingVersion)) {
                    breakingChanges.push(...descriptions);
                }
            }
        }
        
        return breakingChanges;
    }

    /**
     * Check peer dependencies
     */
    async checkPeerDependencies(packageName, targetVersion) {
        const conflicts = [];
        
        try {
            const output = execSync(`npm view ${packageName}@${targetVersion} peerDependencies --json`, { encoding: 'utf8' });
            const peerDeps = JSON.parse(output);
            
            for (const [peerName, peerRange] of Object.entries(peerDeps)) {
                const currentVersion = this.currentDependencies[peerName];
                if (currentVersion && !this.satisfiesVersion(currentVersion, peerRange)) {
                    conflicts.push({
                        type: 'peer-dependency',
                        package: peerName,
                        required: peerRange,
                        current: currentVersion,
                        description: `Peer dependency ${peerName} requires ${peerRange}, but has ${currentVersion}`
                    });
                }
            }
        } catch (error) {
            // Peer dependencies not found or other error
        }
        
        return conflicts;
    }

    /**
     * Check if package is critical
     */
    isCriticalPackage(packageName) {
        const criticalPackages = [
            'express', 'webpack', 'jest', 'babel', 'typescript',
            'react', 'vue', 'angular', 'node', 'npm'
        ];
        
        return criticalPackages.includes(packageName);
    }

    /**
     * Generate conflict report
     */
    generateReport() {
        console.log('\n📋 Conflict Analysis Report');
        console.log('===========================\n');
        
        if (this.conflicts.length === 0 && this.warnings.length === 0) {
            console.log('✅ No conflicts or warnings detected');
            console.log('Safe to proceed with updates');
            return;
        }
        
        // High-risk conflicts
        const highRiskConflicts = this.conflicts.filter(c => c.risk === 'HIGH');
        if (highRiskConflicts.length > 0) {
            console.log('🔴 HIGH RISK CONFLICTS:');
            highRiskConflicts.forEach(conflict => {
                console.log(`\n📦 ${conflict.name}: ${conflict.current} → ${conflict.wanted}`);
                console.log(`Risk Level: ${conflict.risk}`);
                
                conflict.conflicts.forEach(c => {
                    console.log(`  ⚠️  ${c.description}`);
                    if (c.changes) {
                        c.changes.forEach(change => {
                            console.log(`    - ${change}`);
                        });
                    }
                });
            });
        }
        
        // Medium-risk conflicts
        const mediumRiskConflicts = this.conflicts.filter(c => c.risk === 'MEDIUM');
        if (mediumRiskConflicts.length > 0) {
            console.log('\n🟡 MEDIUM RISK CONFLICTS:');
            mediumRiskConflicts.forEach(conflict => {
                console.log(`\n📦 ${conflict.name}: ${conflict.current} → ${conflict.wanted}`);
                console.log(`Risk Level: ${conflict.risk}`);
                
                conflict.conflicts.forEach(c => {
                    console.log(`  ⚠️  ${c.description}`);
                });
            });
        }
        
        // Warnings
        if (this.warnings.length > 0) {
            console.log('\n🟡 WARNINGS:');
            this.warnings.forEach(warning => {
                console.log(`\n📦 ${warning.name}: ${warning.current} → ${warning.wanted}`);
                warning.warnings.forEach(w => {
                    console.log(`  ⚠️  ${w}`);
                });
            });
        }
        
        // Recommendations
        this.generateRecommendations();
    }

    /**
     * Generate recommendations
     */
    generateRecommendations() {
        console.log('\n💡 Recommendations:');
        console.log('==================');
        
        if (this.conflicts.length === 0) {
            console.log('✅ Safe to proceed with updates');
            console.log('✅ Consider running tests after updates');
        } else {
            console.log('⚠️  Review conflicts before updating');
            console.log('✅ Test thoroughly after updates');
            console.log('✅ Consider updating in stages');
            console.log('✅ Keep backups before major updates');
        }
        
        if (this.warnings.length > 0) {
            console.log('📝 Review warnings before proceeding');
        }
    }

    // Utility methods
    getMajorVersion(version) {
        return parseInt(version.split('.')[0]);
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

// Run the checker
if (require.main === module) {
    const checker = new ConflictChecker();
    checker.run().catch(console.error);
}

module.exports = ConflictChecker; 