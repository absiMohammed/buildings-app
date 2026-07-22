import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),

  MONGO_URI: z.string().default('mongodb://localhost:27017/building-app'),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('1h'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),

  // Shared secret the physical door/gate controllers present on the
  // /ws/door and /ws/gate WebSocket upgrade. When unset, device
  // connections are refused (fail-closed) rather than accepted openly.
  DEVICE_WS_TOKEN: z.string().min(16).optional(),

  EMAIL_PROVIDER: z.enum(['resend', 'smtp', 'console']).default('console'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Building App <noreply@example.com>'),

  // WhatsApp Cloud API (Meta). When token + phone-number id are unset, the
  // WhatsApp sender no-ops and just logs (like EMAIL_PROVIDER=console).
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_API_VERSION: z.string().default('v21.0'),
  // App name + download links included in the onboarding WhatsApp message.
  APP_NAME: z.string().default('Building App'),
  APP_STORE_URL: z.string().default(''),
  PLAY_STORE_URL: z.string().default(''),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./uploads'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),

  SEED_BUILDING_NAME: z.string().default('My Building'),
  SEED_ADMIN_EMAIL: z.string().email().default('admin@example.com'),
  SEED_ADMIN_PHONE: z.string().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(8).default('ChangeMe!123'),
  SEED_ADMIN_FIRST: z.string().default('Admin'),
  SEED_ADMIN_LAST: z.string().default('User'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
