import twilio from 'twilio';
import { redis } from '../lib/redis';
import { env } from '../config/env';
import { logger } from '../lib/logger';

// Only create Twilio client if credentials look real
const twilioClient =
  env.TWILIO_ACCOUNT_SID.startsWith('AC') && env.TWILIO_ACCOUNT_SID.length > 20
    ? twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN)
    : null;

/**
 * Send SMS verification code to phone number
 * @param phoneNumber - Phone number in E.164 format
 */
export async function sendVerificationCode(phoneNumber: string): Promise<void> {
  try {
    // In test environment, use fixed code for predictable testing
    const code =
      env.NODE_ENV === 'test'
        ? '123456'
        : Math.floor(100000 + Math.random() * 900000).toString();

    // Store in Redis with 10-minute expiration
    await redis.setex(`sms:${phoneNumber}`, 600, code);

    // Skip actual SMS in development, test, or with fake credentials
    if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test' || !twilioClient) {
      logger.info({ phoneNumber, code }, 'SMS code (dev mode - not sent)');
      if (env.NODE_ENV !== 'test') {
        console.log(`\n📱 SMS Code for ${phoneNumber}: ${code}\n`);
      }
      return;
    }

    // Send real SMS in production
    await twilioClient.messages.create({
      body: `Your verification code is: ${code}`,
      from: env.TWILIO_PHONE_NUMBER,
      to: phoneNumber,
    });

    logger.info({ phoneNumber }, 'SMS verification code sent');
  } catch (error) {
    logger.error({ error, phoneNumber }, 'Failed to send SMS verification code');
    throw error;
  }
}

/**
 * Verify SMS code
 * @param phoneNumber - Phone number in E.164 format
 * @param code - Verification code
 * @returns true if code is valid, false otherwise
 */
export async function verifyCode(phoneNumber: string, code: string): Promise<boolean> {
  try {
    const storedCode = await redis.get(`sms:${phoneNumber}`);
    if (!storedCode || storedCode !== code) {
      logger.warn({ phoneNumber }, 'Invalid SMS verification code');
      return false;
    }
    
    // Delete code after successful verification
    await redis.del(`sms:${phoneNumber}`);
    logger.info({ phoneNumber }, 'SMS verification code verified');
    return true;
  } catch (error) {
    logger.error({ error, phoneNumber }, 'Failed to verify SMS code');
    throw error;
  }
}
