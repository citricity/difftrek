/**
 * The language the interface is in, for every component below.
 *
 * Resolved from the Language setting and the operating system's preferred
 * languages, which the shell reports (the webview's own `navigator.languages`
 * reflects the languages the app bundle declares, not necessarily the user's).
 * Until the system languages arrive, the setting alone decides — which for
 * `auto` means the base language for the first moment of a first launch.
 */

import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getSystemLocales } from '../services/backend.ts';
import { CATALOGUES, SUPPORTED_LOCALES } from './catalogues.ts';
import type { MessageKey } from './catalogues.ts';
import { I18nContext, setActiveTranslator } from './context.ts';
import type { I18n } from './context.ts';
import { resolveLocale } from './resolve.ts';
import { createTranslator } from './translate.ts';

interface Props {
  /** The Language setting: `auto`, or a language tag. */
  preference: string;
  children: ReactNode;
}

export function I18nProvider({ preference, children }: Props) {
  const [systemLocales, setSystemLocales] = useState<readonly string[]>([]);

  useEffect(() => {
    let alive = true;
    void getSystemLocales().then((locales) => {
      if (alive) setSystemLocales(locales);
    });
    return () => {
      alive = false;
    };
  }, []);

  const value = useMemo<I18n>(() => {
    const locale = resolveLocale(preference, systemLocales, SUPPORTED_LOCALES);
    return {
      locale,
      systemLocales,
      t: createTranslator<MessageKey>(locale, CATALOGUES),
    };
  }, [preference, systemLocales]);

  // Before paint, so nothing is announced or hyphenated in the old language,
  // and so code outside React (error fallbacks) speaks the new one at once.
  useLayoutEffect(() => {
    document.documentElement.lang = value.locale;
    setActiveTranslator(value.t);
  }, [value]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
