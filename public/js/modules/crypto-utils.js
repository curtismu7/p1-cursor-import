class CryptoUtils {
    /**
     * Generate a cryptographic key for encryption/decryption
     * @param {string} password - The password to derive the key from
     * @returns {Promise<CryptoKey>} A CryptoKey object
     */
    static async generateKey(password) {
        const encoder = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveBits', 'deriveKey']
        );

        return window.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: new TextEncoder().encode('PingOneImportSalt'), // Should be unique per user in production
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Encrypt a string
     * @param {string} text - The text to encrypt
     * @param {CryptoKey} key - The encryption key
     * @returns {Promise<string>} Encrypted text as base64
     */
    static async encrypt(text, key) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        
        // Generate a random IV (Initialization Vector)
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        
        const encrypted = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            data
        );
        
        // Combine IV and encrypted data into a single array
        const result = new Uint8Array(iv.length + encrypted.byteLength);
        result.set(iv, 0);
        result.set(new Uint8Array(encrypted), iv.length);
        
        // Convert to base64 for storage
        return btoa(String.fromCharCode(...result));
    }

    /**
     * Decrypt a string
     * @param {string} encryptedBase64 - The encrypted text in base64 format
     * @param {CryptoKey} key - The decryption key
     * @returns {Promise<string>} Decrypted text
     */
    static async decrypt(encryptedBase64, key) {
        try {
            // Convert from base64 to Uint8Array
            const encryptedData = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
            
            // Extract the IV (first 12 bytes)
            const iv = encryptedData.slice(0, 12);
            const data = encryptedData.slice(12);
            
            const decrypted = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                key,
                data
            );
            
            return new TextDecoder().decode(decrypted);
        } catch (error) {
            console.error('Decryption failed:', error);
            throw new Error('Failed to decrypt data. The encryption key may be incorrect.');
        }
    }
}

// Export the class and a singleton instance
module.exports = { 
    CryptoUtils,
    cryptoUtils: new CryptoUtils() 
};
