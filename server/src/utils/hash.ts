import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

export const hashPassword = (plain: string): Promise<string> =>
  bcrypt.hash(plain, env.BCRYPT_COST);

export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);

export const sha256 = (input: string): string =>
  crypto.createHash('sha256').update(input).digest('hex');

export const randomToken = (bytes = 32): string =>
  crypto.randomBytes(bytes).toString('hex');
