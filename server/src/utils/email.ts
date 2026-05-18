import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// Stub: dev/test prints to logs. Swap in Resend/SES/SendGrid for prod.
export async function sendEmail({ to, subject, html, text }: SendArgs): Promise<void> {
  if (env.EMAIL_PROVIDER === 'console') {
    logger.info({ to, subject, text: text ?? html }, '[email:console]');
    return;
  }
  if (env.EMAIL_PROVIDER === 'resend') {
    if (!env.RESEND_API_KEY) {
      logger.warn('RESEND_API_KEY missing, falling back to console');
      logger.info({ to, subject }, '[email:console-fallback]');
      return;
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, html, text }),
    });
    if (!res.ok) {
      const body = await res.text();
      logger.error({ status: res.status, body }, 'Resend send failed');
    }
    return;
  }
  // SMTP could be wired here via nodemailer; left as exercise for prod.
  logger.warn({ provider: env.EMAIL_PROVIDER }, 'Unsupported email provider, skipping');
}

export function buildInviteUrl(token: string): string {
  return `${env.CLIENT_URL}/invite/accept?token=${encodeURIComponent(token)}`;
}

export function buildPasswordResetUrl(token: string): string {
  return `${env.CLIENT_URL}/reset-password?token=${encodeURIComponent(token)}`;
}
