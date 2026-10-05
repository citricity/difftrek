/**
 * The React halves of the extensions compiled into this build.
 *
 * Found by Vite at build time, not at runtime: whatever sits in
 * `extensions/<id>/ui/` when the app is built is bundled in, and an empty
 * folder yields an empty list. The Rust halves are linked the same way by
 * `scripts/extensions.mjs`. The leading `/` in the pattern is Vite's project
 * root, not the filesystem's.
 */

import type { Extension, Mode } from './api.ts';

const modules = import.meta.glob<{ default: Extension }>(
  '/extensions/*/ui/index.{ts,tsx}',
  { eager: true },
);

/** What `scripts/extensions.mjs` accepts as an id: a Tauri plugin name. */
const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * The extensions whose declared id matches the folder they came from, in
 * folder order so the order is stable between builds.
 *
 * The id is what `host.invoke` addresses — `plugin:<id>|<command>` — so it has
 * to be the one the build linked for that folder. An extension declaring some
 * other id would otherwise reach another plugin's commands; one that does is
 * left out, and says why.
 */
export function collect(
  found: Readonly<Record<string, { default: Extension }>>,
): Extension[] {
  return Object.keys(found)
    .sort()
    .flatMap((path) => {
      const folder = /^\/extensions\/([^/]+)\/ui\//.exec(path)?.[1];
      const extension = found[path].default;

      if (folder === undefined || !ID_PATTERN.test(folder) || extension.id !== folder) {
        console.error(
          `[difftrek] ignoring the extension in ${path}: its id is "${extension.id}", ` +
            `but it must be its folder's name, "${folder ?? '?'}"`,
        );
        return [];
      }

      return [extension];
    });
}

export const extensions: readonly Extension[] = collect(modules);

/** The extensions contributing a panel to the landing screen for `mode`. */
export function landingExtensions(
  mode: Mode,
  from: readonly Extension[] = extensions,
): Extension[] {
  return from.filter((extension) => extension.landing?.modes.includes(mode) === true);
}

/** The extensions contributing a component mounted for the whole window. */
export function appExtensions(from: readonly Extension[] = extensions): Extension[] {
  return from.filter((extension) => extension.app !== undefined);
}
