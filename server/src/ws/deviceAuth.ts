import { timingSafeEqual } from 'crypto';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Validate the shared device token presented by a door/gate controller on
 * the WebSocket upgrade. Fail-closed: if DEVICE_WS_TOKEN is not configured,
 * NO device connection is accepted (better a non-functional gate than one
 * any stranger on the internet can join). Uses a constant-time comparison
 * so the token can't be recovered by timing the response.
 */
export function deviceTokenValid(provided: string | null | undefined): boolean {
  const expected = env.DEVICE_WS_TOKEN;
  if (!expected) {
    logger.warn('DEVICE_WS_TOKEN is not set — refusing all device WebSocket connections');
    return false;
  }
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
