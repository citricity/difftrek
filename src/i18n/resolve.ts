/**
 * Which language to show.
 *
 * Mirrors `resolve` and `normalise` in `crates/extension-api/src/i18n.rs`:
 * the shell resolves the same setting against the same system languages to
 * build its menu, and the two must agree or the menu bar and the window would
 * speak different languages. Both are tested against the same cases.
 */

import { BASE_LOCALE } from './translate.ts';

/** The setting's value for following the operating system. */
export const AUTO_LANGUAGE = 'auto';

/**
 * Turns what an operating system reports into a BCP 47 tag: `en_GB.UTF-8`
 * becomes `en-GB`. `C` and `POSIX` mean no preference and come back null.
 */
export function normaliseLocale(raw: string): string | null {
  const tag = (raw.split(/[.@]/)[0] ?? '').trim().replace(/_/g, '-');
  if (tag === '' || /^(c|posix)$/i.test(tag)) return null;

  const [language, ...rest] = tag.split('-');
  if (!/^[A-Za-z]{2,3}$/.test(language)) return null;

  const subtags = rest
    .filter((part) => part !== '')
    .map((part) => {
      if (part.length === 2) return part.toUpperCase();
      if (part.length === 4) return part[0].toUpperCase() + part.slice(1).toLowerCase();
      return part;
    });

  return [language.toLowerCase(), ...subtags].join('-');
}

/**
 * The language to show, from the setting and the system's preferred
 * languages, in order.
 *
 * An explicit choice wins when this build ships it; anything else — `auto`,
 * or a language since removed — follows the system. Each system language is
 * tried exactly and then by its language alone, so `de-AT` finds `de` and
 * `en-AU` the first English listed (British). Failing that, the base.
 */
export function resolveLocale(
  preference: string,
  system: readonly string[],
  supported: readonly string[],
): string {
  const exact = (tag: string) =>
    supported.find((candidate) => candidate.toLowerCase() === tag.toLowerCase());

  if (preference !== AUTO_LANGUAGE) {
    const found = exact(preference);
    if (found !== undefined) return found;
  }

  for (const raw of system) {
    const candidate = normaliseLocale(raw);
    if (candidate === null) continue;

    const found = exact(candidate);
    if (found !== undefined) return found;

    const language = candidate.split('-')[0];
    const sameLanguage = supported.find((tag) => tag.split('-')[0] === language);
    if (sameLanguage !== undefined) return sameLanguage;
  }

  return BASE_LOCALE;
}
