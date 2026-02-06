import twilio from 'twilio';
import { redis } from '../lib/redis';
import { env } from '../config/env';
import { logger } from '../lib/logger';

// Only create Twilio client if credentials look real
// Real Twilio Account SIDs start with 'AC' and are 34 characters long
const isRealTwilioCredentials = 
  env.TWILIO_ACCOUNT_SID.startsWith('AC') && 
  env.TWILIO_ACCOUNT_SID.length >= 34 &&
  env.TWILIO_AUTH_TOKEN.length >= 32;

const twilioClient = isRealTwilioCredentials
  ? twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN)
  : null;

/**
 * Send SMS verification code to phone number
 * @param phoneNumber - Phone number in E.164 format
 */
export async function sendVerificationCode(phoneNumber: string): Promise<void> {
  try {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store in Redis with 10-minute expiration
    await redis.setex(`sms:${phoneNumber}`, 600, code);
    
    // Skip actual SMS in development or with fake credentials
    if (env.NODE_ENV === 'development' || !twilioClient) {
      logger.info({ phoneNumber, code }, 'SMS code (dev mode - not sent)');
      // Print to console for easy testing
      console.log(`\n📱 SMS Code for ${phoneNumber}: ${code}\n`);
      return;
    }
    
    // Send real SMS in production with real credentials
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
