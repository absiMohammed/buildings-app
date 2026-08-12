// Presentation helpers shared across screens. These are pure and carry no
// mock data — they replace the formatters that used to live in src/mocks.

const dayMs = 24 * 60 * 60 * 1000;

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  ILS: '₪',
  JOD: 'JD ',
};

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? `${code} `;
}

export function fmtMoney(amount: number, currency = 'ILS'): string {
  const sym = currencySymbol(currency);
  return `${sym}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtMoneyCompact(amount: number, currency = 'ILS'): string {
  const sym = currencySymbol(currency);
  if (amount >= 1000) return `${sym}${(amount / 1000).toFixed(1)}k`;
  return `${sym}${amount.toFixed(0)}`;
}

// Module-level locale mirror, set by the LanguageProvider on load/switch.
// Keeps these pure helpers usable outside React (no hook needed) while
// still producing localized output.
let formatLocale: 'en' | 'ar' = 'ar';
export function setFormatLocale(locale: 'en' | 'ar'): void {
  formatLocale = locale;
}

/**
 * The app-wide date formatter — every user-visible date goes through here
 * (never raw `toLocaleDateString()`: that follows the DEVICE locale, not the
 * app language, and ISO `.slice(0, 10)` is not a date).
 */
export function fmtDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString(formatLocale === 'ar' ? 'ar' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/** Long-form date for headers/hero ("١٢ أغسطس" / "August 12"). */
export function fmtDateLong(iso: string | Date): string {
  return new Date(iso).toLocaleDateString(formatLocale === 'ar' ? 'ar' : 'en-US', {
    month: 'long',
    day: 'numeric',
  });
}

/** Short month name for chart axes, in the app language. */
export function fmtMonthShort(date: Date): string {
  return date.toLocaleDateString(formatLocale === 'ar' ? 'ar' : 'en-US', { month: 'short' });
}

export function relativeDay(iso: string): string {
  const diff = Math.round((new Date(iso).getTime() - Date.now()) / dayMs);
  if (formatLocale === 'ar') {
    if (diff === 0) return 'اليوم';
    if (diff === 1) return 'غداً';
    if (diff === -1) return 'أمس';
    if (diff > 0) return `بعد ${diff} يوم`;
    return `قبل ${Math.abs(diff)} يوم`;
  }
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff > 0) return `in ${diff}d`;
  return `${Math.abs(diff)}d ago`;
}
