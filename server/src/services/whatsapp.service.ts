import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// Meta expects the recipient in E.164 without the leading '+'.
function normalizeTo(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}

export function whatsappEnabled(): boolean {
  return Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
}

/**
 * Send a plain-text WhatsApp message via the Meta Cloud API. Returns true on
 * success. When WhatsApp isn't configured it logs and returns false (no throw),
 * so callers can fire reminders unconditionally without guarding.
 *
 * Note: outside the 24-hour customer-service window Meta only delivers
 * pre-approved message templates, not free-form text. Reminders triggered by
 * cron will therefore need approved templates in production — wire those in
 * once the business number and templates are set up.
 */
export async function sendWhatsApp(to: string | undefined | null, body: string): Promise<boolean> {
  if (!to) return false;
  const recipient = normalizeTo(to);
  if (!recipient) return false;

  if (!whatsappEnabled()) {
    logger.info({ to: recipient, body }, '[whatsapp:disabled] would send message');
    return false;
  }

  try {
    const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'text',
        text: { body },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      logger.warn({ status: res.status, detail }, 'WhatsApp send failed');
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err }, 'WhatsApp send error');
    return false;
  }
}

/** Fan out one message to many recipients; individual failures are ignored. */
export async function sendWhatsAppBulk(recipients: Array<string | undefined | null>, body: string): Promise<void> {
  await Promise.all(recipients.map((to) => sendWhatsApp(to, body)));
}

/**
 * Compose + send the onboarding WhatsApp to a freshly-created user: login
 * number, temporary password, and app download links. Bilingual (AR + EN).
 * Fire-and-forget — never throws, so it can't fail user creation.
 *
 * NB: Meta only delivers free-form text inside the 24h customer-service
 * window; a first unsolicited message to a new number needs an APPROVED
 * template. Configure WHATSAPP_* + a template to deliver in production.
 */
/** Compose the bilingual onboarding text (login, temp password, app links). */
export function buildOnboardingMessage(args: { name?: string; phone: string; password?: string }): string {
  const app = env.APP_NAME;
  const links = [
    env.APP_STORE_URL ? `iOS: ${env.APP_STORE_URL}` : null,
    env.PLAY_STORE_URL ? `Android: ${env.PLAY_STORE_URL}` : null,
    env.CLIENT_URL ? `Web: ${env.CLIENT_URL}` : null,
  ].filter(Boolean);
  const hello = args.name?.trim() ? ` ${args.name.trim()}` : '';
  return [
    `مرحباً${hello} 👋`,
    `تم إنشاء حسابك في ${app}.`,
    `رقم الدخول: ${args.phone}`,
    args.password ? `كلمة المرور المؤقتة: ${args.password}` : null,
    '',
    `Welcome${hello}! Your ${app} account is ready.`,
    `Login (mobile): ${args.phone}`,
    args.password ? `Temporary password: ${args.password}` : null,
    links.length ? '' : null,
    ...links,
  ]
    .filter((l) => l !== null)
    .join('\n');
}

/**
 * A wa.me click-to-chat link that opens WhatsApp with the message pre-filled
 * to the recipient — the "mock" delivery: the admin taps it and sends from
 * their own WhatsApp, no Cloud API / template approval required.
 */
export function waMeLink(to: string, text: string): string {
  const digits = to.replace(/[^0-9]/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export async function sendOnboarding(args: {
  to: string;
  name?: string;
  phone: string;
  password?: string;
}): Promise<void> {
  try {
    await sendWhatsApp(args.to, buildOnboardingMessage(args));
  } catch {
    /* never blocks user creation */
  }
}
