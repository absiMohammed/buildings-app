import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setLocaleDirection } from '../components/theme';
import { format, isRTL, STRINGS, type Locale, type StringKey } from './strings';

const STORAGE_KEY = 'ba_locale';
const DEFAULT_LOCALE: Locale = 'ar';

interface I18nCtx {
  locale: Locale;
  setLocale(l: Locale): Promise<void>;
  t(key: StringKey): string;
  /** Looks up a key and interpolates `{{var}}` placeholders. */
  tf(key: StringKey, vars?: Record<string, string | number>): string;
  isRTL: boolean;
}

const Ctx = createContext<I18nCtx | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stored = (await AsyncStorage.getItem(STORAGE_KEY)) as Locale | null;
        const resolved: Locale = stored === 'en' || stored === 'ar' ? stored : DEFAULT_LOCALE;
        setLocaleDirection(isRTL(resolved));
        setLocaleState(resolved);
        I18nManager.allowRTL(true);
        if (I18nManager.isRTL !== isRTL(resolved)) {
          // Future restarts will pick up the right layout direction.
          I18nManager.forceRTL(isRTL(resolved));
        }
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const setLocale = useCallback(async (l: Locale) => {
    setLocaleDirection(isRTL(l));
    setLocaleState(l);
    await AsyncStorage.setItem(STORAGE_KEY, l);
    if (I18nManager.isRTL !== isRTL(l)) {
      I18nManager.forceRTL(isRTL(l));
      // forceRTL only takes effect after the app process is recreated.
      Alert.alert(
        STRINGS[l].language_restart_required,
        STRINGS[l].language_restart_body
      );
    }
  }, []);

  const t = useCallback(
    (key: StringKey): string => {
      const table = STRINGS[locale] ?? STRINGS.en;
      return table[key] ?? STRINGS.en[key] ?? key;
    },
    [locale]
  );

  const tf = useCallback(
    (key: StringKey, vars?: Record<string, string | number>): string => format(t(key), vars),
    [t]
  );

  const value = useMemo<I18nCtx>(
    () => ({ locale, setLocale, t, tf, isRTL: isRTL(locale) }),
    [locale, setLocale, t, tf]
  );

  // Avoid rendering until we've loaded the stored locale — otherwise the
  // first frame might flash English then re-render in Arabic.
  if (!ready) return null;

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useI18n must be used inside LanguageProvider');
  return c;
}

// Convenience: only the t() function, when nothing else is needed.
export function useT(): (key: StringKey) => string {
  return useI18n().t;
}
