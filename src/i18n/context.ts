/**
 * Reading the active language.
 *
 * Without a provider — in a component test, say — everything reads the base
 * language, which is what the tests assert against.
 */

import { createContext, useContext } from 'react';
import { CATALOGUES } from './catalogues.ts';
import type { MessageKey } from './catalogues.ts';
import { BASE_LOCALE, createTranslator } from './translate.ts';
import type { Translate } from './translate.ts';

export interface I18n {
  /** The language tag in use, one this build ships. */
  locale: string;
  /** What the operating system prefers, in order, as it reported them. */
  systemLocales: readonly string[];
  t: Translate<MessageKey>;
}

const baseTranslator = createTranslator<MessageKey>(BASE_LOCALE, CATALOGUES);

export const I18nContext = createContext<I18n>({
  locale: BASE_LOCALE,
  systemLocales: [],
  t: baseTranslator,
});

export function useI18n(): I18n {
  return useContext(I18nContext);
}

/** The translator for the active language. */
export function useT(): Translate<MessageKey> {
  return useContext(I18nContext).t;
}

/** The active language's tag. */
export function useLocale(): string {
  return useContext(I18nContext).locale;
}

let activeTranslator: Translate<MessageKey> = baseTranslator;

/**
 * The translator for code that runs outside React — normalising a thrown
 * value into an error message, say. Kept in step by the provider.
 */
export function translate(key: MessageKey, args?: Parameters<Translate>[1]): string {
  return activeTranslator(key, args);
}

export function setActiveTranslator(t: Translate<MessageKey>): void {
  activeTranslator = t;
}
