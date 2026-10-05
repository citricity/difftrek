/**
 * What an extension's React half may rely on from Diff Trek.
 *
 * Imported by extensions as `@difftrek/extension`, so this file is the whole
 * of their view of the core: anything not exported here is not part of the
 * contract and may change without notice. Keep it small.
 */

import type { ComponentType } from 'react';
import { useLocale, useT as useCoreT } from '../i18n/context.ts';
import type { MessageKey } from '../i18n/catalogues.ts';
import type { MessageArgs, Translate } from '../i18n/translate.ts';
import type { FileDropEvent } from '../services/backend.ts';

export type { FileDropEvent };
export type { MessageArgs, Translate };
export { rich } from '../i18n/rich.tsx';

/**
 * Words, in the language the interface is in.
 *
 * An extension's own words go in `extensions/<id>/locales/<tag>.json` — one
 * flat JSON object per language the core ships, `en-GB` at least — and are
 * layered over the core's: the same `t` reads both, so the extension can use
 * the core's words as well as its own, and may reword the core's. Its Rust
 * half embeds the same files and layers them with `i18n::add_layer`, so its
 * error messages come out in the same language.
 *
 * Messages are strings with `{name}` placeholders, or plural forms such as
 * `{ "one": "{count} folder", "other": "{count} folders" }`. Name the
 * extension's keys after it (`dirCompare.title`) so they cannot collide with
 * the core's or another extension's by accident.
 *
 * Pass the extension's own keys as the type argument to have them checked:
 * `useT<keyof typeof import('../locales/en-GB.json')>()`.
 */
export function useT<Key extends string = never>(): Translate<Key | MessageKey> {
  return useCoreT() as Translate<Key | MessageKey>;
}

/** The interface's language tag, such as `en-GB` or `de`. */
export { useLocale };

/**
 * What Diff Trek has open.
 *
 * `none` is the screen shown outside a repository — the natural place to offer
 * something to compare instead. `git` is a repository with nothing to show:
 * panels for it appear beneath the "No unstaged changes" message.
 */
export type Mode = 'git' | 'none';

/** The services Diff Trek provides to one extension. */
export interface ExtensionHost {
  /** Which extension this host serves. */
  readonly id: string;
  /**
   * Calls one of this extension's own Rust commands. The Rust half is a Tauri
   * plugin named after the extension, so `invoke('open', …)` from
   * `dir-compare` reaches `plugin:dir-compare|open`, and nothing else.
   * Rejects with an `AppError`.
   */
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  /**
   * Reloads the document from whatever the backend now has open. Called after
   * a command has opened a new source.
   */
  reload(): void;
  /**
   * Subscribes to files and folders dragged onto the window from the
   * operating system, with their full paths — which the browser's own drag
   * and drop never reveals. `x` and `y` are CSS pixels, ready for
   * `document.elementFromPoint`. Returns the unsubscribe.
   */
  onFileDrop(listener: (event: FileDropEvent) => void): () => void;
}

export interface LandingProps {
  host: ExtensionHost;
  mode: Mode;
}

/** What a landing screen's band says: the screen's title, and a line under it. */
export interface LandingHeading {
  title: string;
  intro?: string;
}

/** A panel shown on a landing screen. */
export interface LandingContribution {
  /** The screens it appears on. */
  modes: readonly Mode[];
  component: ComponentType<LandingProps>;
  /**
   * Names the screen when this is its first panel: the title and intro shown
   * large in the band across the top. A hook, so it can translate with
   * `useT`. Without one — or if it throws — the band keeps Diff Trek's own
   * heading. Only the full landing screen has a band; on the empty-diff
   * screen it is not called.
   */
  useHeading?: () => LandingHeading;
}

/** The React half of an extension: its default export. */
export interface Extension {
  /** Matches the folder name, `extension.json` and the Tauri plugin name. */
  id: string;
  landing?: LandingContribution;
}

/** Identity function that gives an extension's definition its type. */
export function defineExtension(extension: Extension): Extension {
  return extension;
}
