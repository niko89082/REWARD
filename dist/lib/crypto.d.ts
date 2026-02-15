/**
 * Encrypt sensitive data (POS tokens)
 * Returns format: iv:authTag:encryptedData (all base64)
 */
export declare function encrypt(plaintext: string): string;
/**
 * Decrypt sensitive data
 */
export declare function decrypt(ciphertext: string): string;
//# sourceMappingURL=crypto.d.ts.map