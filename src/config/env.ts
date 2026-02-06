import 'dotenv/config';
import { z } from 'zod';

const e164PhoneRegex = /^\+[1-9]\d{1,14}$/;

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  SQUARE_APPLICATION_ID: z.string().min(1),
  SQUARE_ACCESS_TOKEN: z.string().min(1),
  SQUARE_ENVIRONMENT: z.enum(['sandbox', 'production']),
  SQUARE_WEBHOOK_SIGNATURE_KEY: z.string().min(1),
  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_PHONE_NUMBER: z.string().regex(e164PhoneRegex, 'TWILIO_PHONE_NUMBER must be in E.164 format'),
});

export type Env = z.infer<typeof envSchema>;

export function validatePhoneNumber(phone: string): boolean {
  return e164PhoneRegex.test(phone);
}

export const env = envSchema.parse(process.env);
