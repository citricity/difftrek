/**
 * The React halves of the extensions compiled into this build.
 *
 * Found by Vite at build time, not at runtime: whatever sits in
 * `extensions/<id>/ui/` when the app is built is bundled in, and an empty
 * folder yields an empty list. The Rust halves are linked the same way by
 * `scripts/extensions.mjs`.
 */

import type { Extension, Mode } from './api.ts';

const modules = import.meta.glob<{ default: Extension }>(
  '/extensions/*/ui/index.{ts,tsx}',
  { eager: true },
);

/** Every extension, in folder order, so the order is stable between builds. */
export const extensions: readonly Extension[] = Object.keys(modules)
  .sort()
  .map((path) => modules[path].default);

/** The extensions contributing a panel to the landing screen for `mode`. */
export function landingExtensions(
  mode: Mode,
  from: readonly Extension[] = extensions,
): Extension[] {
  return from.filter((extension) => extension.landing?.modes.includes(mode) === true);
}
