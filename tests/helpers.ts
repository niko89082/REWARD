import type { FastifyInstance } from 'fastify';
import { redis } from '../src/lib/redis';

/**
 * Generate unique email for tests to avoid conflicts
 */
export function uniqueEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}@example.com`;
}

/**
 * Generate unique phone for tests (E.164 format: +1 followed by 10 digits)
 */
export function uniquePhone(): string {
  const n = Math.floor(10000000 + Math.random() * 90000000);
  return `+1555${n}`;
}

/**
 * Ensure merchant is authenticated - handles "already exists" by falling back to login
 * Returns { merchantToken, merchantId }
 */
export async function ensureMerchantAuth(
  app: FastifyInstance,
  email: string,
  password: string,
  name: string
): Promise<{ merchantToken: string; merchantId: string }> {
  const signupRes = await app.inject({
    method: 'POST',
    url: '/api/merchant/auth/signup',
    payload: { email, password, name },
  });

  if (signupRes.statusCode === 201) {
    const body = JSON.parse(signupRes.body);
    return {
      merchantToken: body.token,
      merchantId: body.merchant.id,
    };
  }

  if (signupRes.statusCode === 409) {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/merchant/auth/login',
      payload: { email, password },
    });
    if (loginRes.statusCode === 200) {
      const body = JSON.parse(loginRes.body);
      return {
        merchantToken: body.token,
        merchantId: body.merchant.id,
      };
    }
    throw new Error(`Login failed after signup conflict: ${loginRes.body}`);
  }

  throw new Error(`Signup failed: ${signupRes.body}`);
}

/**
 * Set SMS verification code in Redis for a phone number (for testing verify flow)
 */
export async function setTestSmsCode(phoneNumber: string, code: string): Promise<void> {
  await redis.setex(`sms:${phoneNumber}`, 600, code);
}
