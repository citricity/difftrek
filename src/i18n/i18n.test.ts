import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CATALOGUES,
  CORE_CATALOGUES,
  LAYERS,
  SUPPORTED_LOCALES,
  languageName,
} from './catalogues.ts';
import { normaliseLocale, resolveLocale } from './resolve.ts';
import {
  BASE_LOCALE,
  createTranslator,
  interpolate,
  placeholdersOf,
} from './translate.ts';
import type { Catalogue } from './translate.ts';

describe('translate', () => {
  const catalogues: Record<string, Catalogue> = {
    'en-GB': {
      a: 'colour',
      b: 'both',
      n: { one: '{count} file', other: '{count} files' },
    },
    'en-US': { a: 'color' },
    fr: { n: { one: '{count} fichier', other: '{count} fichiers' } },
  };

  it('falls back to the base, and then to the key', () => {
    const us = createTranslator('en-US', catalogues);
    expect(us('a')).toBe('color');
    expect(us('b')).toBe('both');
    expect(createTranslator('de', catalogues)('a')).toBe('colour');
    expect(us('nope')).toBe('nope');
  });

  it('picks plural forms by the language’s own rules', () => {
    const en = createTranslator('en-GB', catalogues);
    expect(en('n', { count: 1 })).toBe('1 file');
    expect(en('n', { count: 0 })).toBe('0 files');
    // French counts zero as singular.
    expect(createTranslator('fr', catalogues)('n', { count: 0 })).toBe('0 fichier');
  });

  it('formats numbers for the language and keeps unknown placeholders', () => {
    expect(interpolate('{n} lines', { n: 12345 }, 'en-GB')).toBe('12,345 lines');
    expect(interpolate('{n} Zeilen', { n: 12345 }, 'de')).toBe('12.345 Zeilen');
    expect(interpolate('Run {command} now', { other: 'x' })).toBe('Run {command} now');
  });
});

describe('resolveLocale', () => {
  // The same cases as `resolves_the_language_to_show` in
  // `crates/extension-api/src/i18n.rs`. Change both: the menu bar and the
  // window must agree.
  const SUPPORTED = ['en-GB', 'en-US', 'de', 'es', 'fr'];
  const cases: Array<[string, string[], string]> = [
    ['auto', ['en-US'], 'en-US'],
    ['auto', ['en-GB'], 'en-GB'],
    ['auto', ['en-AU'], 'en-GB'],
    ['auto', ['de-AT', 'en-US'], 'de'],
    ['auto', ['it-IT', 'fr-CA'], 'fr'],
    ['auto', ['it-IT'], 'en-GB'],
    ['auto', [], 'en-GB'],
    ['auto', ['es_ES.UTF-8'], 'es'],
    ['en-US', ['de-DE'], 'en-US'],
    ['de', ['en-US'], 'de'],
    ['en-us', [], 'en-US'],
    ['it', ['fr-FR'], 'fr'],
    ['it', [], 'en-GB'],
  ];

  it.each(cases)('%s with %j is %s', (preference, system, expected) => {
    expect(resolveLocale(preference, system, SUPPORTED)).toBe(expected);
  });

  it('normalises what operating systems report', () => {
    expect(normaliseLocale('en_GB.UTF-8')).toBe('en-GB');
    expect(normaliseLocale('de-de')).toBe('de-DE');
    expect(normaliseLocale('zh-hant-tw')).toBe('zh-Hant-TW');
    expect(normaliseLocale('sr_RS@latin')).toBe('sr-RS');
    expect(normaliseLocale('C')).toBeNull();
    expect(normaliseLocale('')).toBeNull();
  });
});

describe('the core catalogues', () => {
  const base = CORE_CATALOGUES[BASE_LOCALE];

  it('are every file in locales/, with the base first', () => {
    // From the root vitest runs in: under jsdom `import.meta.url` is not a file URL.
    const directory = join(process.cwd(), 'locales');
    const files = readdirSync(directory)
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.replace(/\.json$/, ''))
      .sort();

    expect([...SUPPORTED_LOCALES].sort()).toEqual(files);
    expect(SUPPORTED_LOCALES[0]).toBe(BASE_LOCALE);
  });

  it('each name their language in itself', () => {
    for (const tag of SUPPORTED_LOCALES) {
      expect(Object.keys(CORE_CATALOGUES[tag])).toContain('language.name');
    }
    expect(languageName('de')).toBe('Deutsch');
  });

  // Mirrors `check_catalogues` in the Rust module, which runs the same rules.
  it.each(SUPPORTED_LOCALES.filter((tag) => tag !== BASE_LOCALE))(
    '%s uses only the base’s keys and placeholders, and is complete unless a variant of it',
    (tag) => {
      const catalogue = CORE_CATALOGUES[tag];
      const variant = tag.split('-')[0] === BASE_LOCALE.split('-')[0];

      for (const [key, message] of Object.entries(catalogue)) {
        expect(base, `${tag}: ${key}`).toHaveProperty([key]);
        expect([...placeholdersOf(message)].sort(), `${tag}: ${key}`).toEqual(
          [...placeholdersOf(base[key])].sort(),
        );
      }

      if (!variant) {
        const missing = Object.keys(base).filter((key) => !(key in catalogue));
        expect(missing, `${tag} is missing keys`).toEqual([]);
      }
    },
  );
});

// Each extension's catalogues (`extensions/<id>/locales/`), when the build has
// any — the Pro build does. The same rules as the core's, checked against the
// core's base and the extension's own together, since a layer may reword a
// core message; and only in languages the core ships.
describe.each(LAYERS.map((layer) => [layer.extension, layer] as const))(
  'the %s layer',
  (_, layer) => {
    const own = layer.catalogues[BASE_LOCALE] ?? {};
    const base = { ...CORE_CATALOGUES[BASE_LOCALE], ...own };

    it('has a base catalogue, and only the core’s languages', () => {
      expect(layer.catalogues).toHaveProperty([BASE_LOCALE]);
      for (const tag of Object.keys(layer.catalogues)) {
        expect(SUPPORTED_LOCALES).toContain(tag);
      }
    });

    it.each(Object.keys(layer.catalogues).filter((tag) => tag !== BASE_LOCALE))(
      '%s matches the base',
      (tag) => {
        const catalogue = layer.catalogues[tag];
        for (const [key, message] of Object.entries(catalogue)) {
          expect(base, `${tag}: ${key}`).toHaveProperty([key]);
          expect([...placeholdersOf(message)].sort(), `${tag}: ${key}`).toEqual(
            [...placeholdersOf(base[key])].sort(),
          );
        }
        if (tag.split('-')[0] !== BASE_LOCALE.split('-')[0]) {
          expect(Object.keys(own).filter((key) => !(key in catalogue))).toEqual([]);
        }
      },
    );
  },
);

describe('layering', () => {
  it('puts every layer over the core, language by language', () => {
    for (const tag of SUPPORTED_LOCALES) {
      for (const layer of LAYERS) {
        for (const [key, message] of Object.entries(layer.catalogues[tag] ?? {})) {
          // The last layer to define a key wins; a single layer always does.
          if (LAYERS.length === 1) expect(CATALOGUES[tag][key]).toEqual(message);
        }
      }
      for (const [key, message] of Object.entries(CORE_CATALOGUES[tag])) {
        const reworded = LAYERS.some((layer) => key in (layer.catalogues[tag] ?? {}));
        if (!reworded) expect(CATALOGUES[tag][key]).toEqual(message);
      }
    }
  });
});
