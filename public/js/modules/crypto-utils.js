// File: crypto-utils.js
// Description: Cryptographic utilities for secure data handling
// 
// This module provides encryption and decryption functionality for
// sensitive data like API secrets and user credentials. Uses the
// Web Crypto API for secure cryptographic operations.
// 
// Features:
// - PBKDF2 key derivation for secure key generation
// - AES-GCM encryption for authenticated encryption
// - Base64 encoding for storage compatibility
// - Error handling for decryption failures

/**
 * Cryptographic Utilities Class
 * 
 * Provides secure encryption and decryption using the Web Crypto API.
 * Uses PBKDF2 for key derivation and AES-GCM for authenticated encryption.
 * All methods are static for easy use throughout the application.
 */
class CryptoUtils {
    /**
     * Generate a cryptographic key for encryption/decryption
     * 
     * Uses PBKDF2 key derivation to create a secure key from a password.
     * The key is suitable for AES-GCM encryption operations.
     * 
     * @param {string} password - The password to derive the key from
     * @returns {Promise<CryptoKey>} A CryptoKey object for encryption/decryption
     */
    static async generateKey(password) {
        // Convert password to key material using PBKDF2
        const encoder = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveBits', 'deriveKey']
        );

        // Derive the actual encryption key using PBKDF2
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
     * Encrypt a string using AES-GCM
     * 
     * Encrypts text using AES-GCM with a random initialization vector (IV).
     * The IV is prepended to the encrypted data for secure storage.
     * Returns the result as base64-encoded string.
     * 
     * @param {string} text - The text to encrypt
     * @param {CryptoKey} key - The encryption key
     * @returns {Promise<string>} Encrypted text as base64 string
     */
    static async encrypt(text, key) {
        // Convert text to UTF-8 bytes
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        
        // Generate a random IV (Initialization Vector) for security
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        
        // Encrypt the data using AES-GCM
        const encrypted = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            data
        );
        
        // Combine IV and encrypted data into a single array
        // IV is prepended for secure storage and retrieval
        const result = new Uint8Array(iv.length + encrypted.byteLength);
        result.set(iv, 0);
        result.set(new Uint8Array(encrypted), iv.length);
        
        // Convert to base64 for storage compatibility
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
            // Don't log the error here - let the calling code handle it
            throw error;
        }
    }
}

// Export the class and a singleton instance
export { CryptoUtils };
export const cryptoUtils = new CryptoUtils();
