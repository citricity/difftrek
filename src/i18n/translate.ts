/**
 * Turning a key and some arguments into words.
 *
 * Mirrors `crates/extension-api/src/i18n.rs`, which reads the very same
 * `locales/*.json` files: a message is a string with `{name}` placeholders, or
 * an object of plural forms keyed by CLDR category (`one`, `other`, …) and
 * chosen by the `count` argument. A message missing from the language asked
 * for falls back to the base language, and one missing even there comes back
 * as its key — ugly enough to be noticed, never a crash.
 */

/** One message: plain text, or plural forms keyed by CLDR category. */
export type Message = string | Readonly<Partial<Record<Intl.LDMLPluralRule, string>>>;

/** A whole catalogue: every message in one language, by key. */
export type Catalogue = Readonly<Record<string, Message>>;

/** Arguments for placeholders. Numbers are formatted for the language. */
export type MessageArgs = Readonly<Record<string, string | number>>;

/** The language every catalogue is complete in, and the last resort. */
export const BASE_LOCALE = 'en-GB';

/** Formats a message: looks the key up, picks a plural form, fills it in. */
export type Translate<Key extends string = string> = (
  key: Key,
  args?: MessageArgs,
) => string;

const pluralRules = new Map<string, Intl.PluralRules>();
const numberFormats = new Map<string, Intl.NumberFormat>();

function rulesFor(locale: string): Intl.PluralRules {
  let rules = pluralRules.get(locale);
  if (rules === undefined) {
    rules = new Intl.PluralRules(locale);
    pluralRules.set(locale, rules);
  }
  return rules;
}

function numberFormatFor(locale: string): Intl.NumberFormat {
  let format = numberFormats.get(locale);
  if (format === undefined) {
    format = new Intl.NumberFormat(locale);
    numberFormats.set(locale, format);
  }
  return format;
}

/**
 * Replaces each `{name}` with its argument. Unknown names are left as they
 * are, so a mistake shows on screen rather than silently vanishing.
 */
export function interpolate(
  template: string,
  args: MessageArgs | undefined,
  locale: string = BASE_LOCALE,
): string {
  if (args === undefined) return template;

  return template.replace(/\{([^{}]*)\}/g, (whole, name: string) => {
    const value = args[name];
    if (value === undefined) return whole;
    return typeof value === 'number' ? numberFormatFor(locale).format(value) : value;
  });
}

/**
 * A translator for one language over a set of catalogues.
 *
 * `catalogues` maps language tags to catalogues; the base must be among them.
 * Exposed to extensions too, through `@difftrek/extension`, so their own
 * catalogues follow the same rules as the core's.
 */
export function createTranslator<Key extends string = string>(
  locale: string,
  catalogues: Readonly<Record<string, Catalogue>>,
): Translate<Key> {
  const chain = [catalogues[locale], catalogues[BASE_LOCALE]].filter(
    (catalogue): catalogue is Catalogue => catalogue !== undefined,
  );

  return (key, args) => {
    let message: Message | undefined;
    for (const catalogue of chain) {
      // Not `Object.hasOwn`: the macOS webview target is Safari 15.0.
      if (Object.prototype.hasOwnProperty.call(catalogue, key)) {
        message = catalogue[key];
        break;
      }
    }

    if (message === undefined) return key;

    if (typeof message === 'string') return interpolate(message, args, locale);

    const count = Number(args?.count ?? 0);
    const category = rulesFor(locale).select(count);
    const form = message[category] ?? message.other;
    return form === undefined ? key : interpolate(form, args, locale);
  };
}

/** The placeholder names a message uses, across all its plural forms. */
export function placeholdersOf(message: Message): Set<string> {
  const texts = typeof message === 'string' ? [message] : Object.values(message);
  const names = new Set<string>();
  for (const text of texts) {
    if (text === undefined) continue;
    for (const match of text.matchAll(/\{([^{}]*)\}/g)) names.add(match[1]);
  }
  return names;
}
