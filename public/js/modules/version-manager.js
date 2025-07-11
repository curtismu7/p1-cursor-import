export class VersionManager {
    constructor() {
        this.version = '4.9'; // Update this with each new version
        console.log(`Version Manager initialized with version ${this.version}`);
    }

    getVersion() {
        return this.version;
    }

    getFormattedVersion() {
        return `v${this.version}`;
    }

    updateTitle() {
        // Update the main title
        const title = document.querySelector('h1');
        if (title) {
            // Remove any existing version number
            const baseTitle = title.textContent.replace(/\s*\(v\d+\.\d+\.\d+\)\s*$/, '').trim();
            title.textContent = `${baseTitle} (${this.getFormattedVersion()})`;
        }

        // Update the document title
        document.title = `PingOne User Import ${this.getFormattedVersion()}`;

        // Update the import button text
        this.updateImportButton();

        // Update the top version badge
        this.updateTopVersionBadge();

        // Add version badge to the UI
        this.addVersionBadge();
    }
    
    updateImportButton() {
        const importButton = document.getElementById('start-import-btn');
        if (importButton) {
            const baseText = importButton.textContent.replace(/\s*\(v\d+\.\d+\.\d+\)\s*$/, '').trim();
            importButton.innerHTML = `<i class="pi pi-upload"></i> ${baseText} (${this.getFormattedVersion()})`;
        }
    }

    updateTopVersionBadge() {
        const versionText = document.getElementById('version-text');
        if (versionText) {
            versionText.textContent = this.getFormattedVersion();
        }
    }

    addVersionBadge() {
        // Check if badge already exists
        if (document.getElementById('version-badge')) {
            return;
        }

        // Create version badge
        const badge = document.createElement('div');
        badge.id = 'version-badge';
        badge.textContent = this.getFormattedVersion();
        badge.style.position = 'fixed';
        badge.style.bottom = '10px';
        badge.style.right = '10px';
        badge.style.backgroundColor = '#333';
        badge.style.color = 'white';
        badge.style.padding = '2px 6px';
        badge.style.borderRadius = '3px';
        badge.style.fontSize = '12px';
        badge.style.fontFamily = 'monospace';
        badge.style.zIndex = '1000';
        
        document.body.appendChild(badge);
    }
}

// ES Module export
