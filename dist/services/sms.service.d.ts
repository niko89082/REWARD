/**
 * Send SMS verification code to phone number
 * @param phoneNumber - Phone number in E.164 format
 */
export declare function sendVerificationCode(phoneNumber: string): Promise<void>;
/**
 * Verify SMS code
 * @param phoneNumber - Phone number in E.164 format
 * @param code - Verification code
 * @returns true if code is valid, false otherwise
 */
export declare function verifyCode(phoneNumber: string, code: string): Promise<boolean>;
//# sourceMappingURL=sms.service.d.ts.map