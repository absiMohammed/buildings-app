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

export function relativeDay(iso: string): string {
  const diff = Math.round((new Date(iso).getTime() - Date.now()) / dayMs);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff > 0) return `in ${diff}d`;
  return `${Math.abs(diff)}d ago`;
}
