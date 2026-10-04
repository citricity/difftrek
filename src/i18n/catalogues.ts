/**
 * The catalogues: every `locales/<tag>.json` at the repository root, with each
 * extension's own `extensions/<id>/locales/<tag>.json` layered over them.
 *
 * The core's files are embedded into the Rust side by `include_str!` in
 * `crates/extension-api/src/i18n.rs`, and an extension's into its own crate,
 * which is what lets the menu, the error messages and the interface share one
 * set of words. Found here by Vite at build time, so adding a language is
 * adding a file — plus a line in that Rust list, which a test there insists
 * on.
 *
 * An extension's catalogue is a layer, not a dictionary of its own: merged
 * over the core's for the same language, it adds the extension's words and
 * may reword the core's, and one `t` reads both. The Rust side layers them
 * the same way (`i18n::add_layer`).
 */

import type base from '../../locales/en-GB.json';
import { BASE_LOCALE } from './translate.ts';
import type { Catalogue } from './translate.ts';

/** Every key the core knows: the base catalogue is complete by definition. */
export type MessageKey = keyof typeof base;

const modules = import.meta.glob<Catalogue>('/locales/*.json', {
  eager: true,
  import: 'default',
});

const layerModules = import.meta.glob<Catalogue>('/extensions/*/locales/*.json', {
  eager: true,
  import: 'default',
});

function tagOf(path: string): string {
  return path.replace(/^.*\//, '').replace(/\.json$/, '');
}

/** The core's own catalogues by language tag, as named by their files. */
export const CORE_CATALOGUES: Readonly<Record<string, Catalogue>> = Object.fromEntries(
  Object.entries(modules).map(([path, catalogue]) => [tagOf(path), catalogue]),
);

/** One extension's catalogues, as found in `extensions/<id>/locales/`. */
export interface Layer {
  extension: string;
  catalogues: Readonly<Record<string, Catalogue>>;
}

/** Each extension's catalogues, in folder order — the order they are layered. */
export const LAYERS: readonly Layer[] = (() => {
  const byExtension = new Map<string, Record<string, Catalogue>>();
  for (const path of Object.keys(layerModules).sort()) {
    const extension = /^\/extensions\/([^/]+)\//.exec(path)?.[1];
    if (extension === undefined) continue;
    const catalogues = byExtension.get(extension) ?? {};
    catalogues[tagOf(path)] = layerModules[path];
    byExtension.set(extension, catalogues);
  }
  return [...byExtension].map(([extension, catalogues]) => ({ extension, catalogues }));
})();

/**
 * What the interface reads: the core's catalogues with every layer merged
 * over them, language by language. Only the core's languages: an extension's
 * catalogue in a language the core lacks would leave everything around it in
 * the base language, so it does not make one (and a test says so).
 */
export const CATALOGUES: Readonly<Record<string, Catalogue>> = Object.fromEntries(
  Object.entries(CORE_CATALOGUES).map(([tag, core]) => [
    tag,
    Object.assign(
      {},
      core,
      ...LAYERS.map((layer) => layer.catalogues[tag] ?? {}),
    ) as Catalogue,
  ]),
);

/** The languages this build ships, the base first and the rest by tag. */
export const SUPPORTED_LOCALES: readonly string[] = [
  BASE_LOCALE,
  ...Object.keys(CORE_CATALOGUES)
    .filter((tag) => tag !== BASE_LOCALE)
    .sort(),
];

/**
 * A language's name in itself — "Deutsch", not "German" — as its own catalogue
 * gives it. That is how a language picker lists them, so that someone who
 * cannot read the current language can still find their own.
 */
export function languageName(tag: string): string {
  const name = CORE_CATALOGUES[tag]?.['language.name'];
  return typeof name === 'string' ? name : tag;
}
