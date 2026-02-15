import crypto from 'crypto';
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16;
/**
 * Derive encryption key from JWT_SECRET using PBKDF2
 */
function getEncryptionKey() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET not configured');
    }
    return crypto.pbkdf2Sync(secret, 'pos-token-encryption-salt', 100000, KEY_LENGTH, 'sha256');
}
/**
 * Encrypt sensitive data (POS tokens)
 * Returns format: iv:authTag:encryptedData (all base64)
 */
export function encrypt(plaintext) {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();
    return [
        iv.toString('base64'),
        authTag.toString('base64'),
        encrypted
    ].join(':');
}
/**
 * Decrypt sensitive data
 */
export function decrypt(ciphertext) {
    const key = getEncryptionKey();
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
    }
    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
//# sourceMappingURL=crypto.js.map