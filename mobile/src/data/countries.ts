// Country dial codes for the phone-first login. Flag is derived from the
// ISO-3166 alpha-2 code via regional-indicator symbols (no image assets).

export interface Country {
  iso: string; // ISO 3166-1 alpha-2
  name: string;
  dial: string; // e.g. "+972"
  flag: string;
}

function flagOf(iso: string): string {
  const A = 0x1f1e6;
  const base = 'A'.charCodeAt(0);
  return String.fromCodePoint(
    ...iso.toUpperCase().split('').map((c) => A + (c.charCodeAt(0) - base)),
  );
}

const RAW: Array<[string, string, string]> = [
  // [iso, name, dial] — Middle East / common first, then a broad set.
  ['PS', 'Palestine', '+970'],
  ['IL', 'Israel', '+972'],
  ['JO', 'Jordan', '+962'],
  ['SA', 'Saudi Arabia', '+966'],
  ['AE', 'United Arab Emirates', '+971'],
  ['EG', 'Egypt', '+20'],
  ['QA', 'Qatar', '+974'],
  ['KW', 'Kuwait', '+965'],
  ['BH', 'Bahrain', '+973'],
  ['OM', 'Oman', '+968'],
  ['LB', 'Lebanon', '+961'],
  ['SY', 'Syria', '+963'],
  ['IQ', 'Iraq', '+964'],
  ['YE', 'Yemen', '+967'],
  ['TR', 'Türkiye', '+90'],
  ['US', 'United States', '+1'],
  ['GB', 'United Kingdom', '+44'],
  ['CA', 'Canada', '+1'],
  ['DE', 'Germany', '+49'],
  ['FR', 'France', '+33'],
  ['ES', 'Spain', '+34'],
  ['IT', 'Italy', '+39'],
  ['NL', 'Netherlands', '+31'],
  ['SE', 'Sweden', '+46'],
  ['NO', 'Norway', '+47'],
  ['CH', 'Switzerland', '+41'],
  ['BE', 'Belgium', '+32'],
  ['IE', 'Ireland', '+353'],
  ['PT', 'Portugal', '+351'],
  ['GR', 'Greece', '+30'],
  ['RU', 'Russia', '+7'],
  ['UA', 'Ukraine', '+380'],
  ['PL', 'Poland', '+48'],
  ['RO', 'Romania', '+40'],
  ['IN', 'India', '+91'],
  ['PK', 'Pakistan', '+92'],
  ['BD', 'Bangladesh', '+880'],
  ['ID', 'Indonesia', '+62'],
  ['MY', 'Malaysia', '+60'],
  ['SG', 'Singapore', '+65'],
  ['PH', 'Philippines', '+63'],
  ['CN', 'China', '+86'],
  ['JP', 'Japan', '+81'],
  ['KR', 'South Korea', '+82'],
  ['AU', 'Australia', '+61'],
  ['NZ', 'New Zealand', '+64'],
  ['ZA', 'South Africa', '+27'],
  ['NG', 'Nigeria', '+234'],
  ['KE', 'Kenya', '+254'],
  ['MA', 'Morocco', '+212'],
  ['DZ', 'Algeria', '+213'],
  ['TN', 'Tunisia', '+216'],
  ['LY', 'Libya', '+218'],
  ['SD', 'Sudan', '+249'],
  ['BR', 'Brazil', '+55'],
  ['MX', 'Mexico', '+52'],
  ['AR', 'Argentina', '+54'],
  ['CL', 'Chile', '+56'],
];

export const COUNTRIES: Country[] = RAW.map(([iso, name, dial]) => ({
  iso,
  name,
  dial,
  flag: flagOf(iso),
}));

export const DEFAULT_COUNTRY: Country =
  COUNTRIES.find((c) => c.iso === 'PS') ?? COUNTRIES[0]!;

export function findCountryByIso(iso: string): Country | undefined {
  return COUNTRIES.find((c) => c.iso === iso);
}
