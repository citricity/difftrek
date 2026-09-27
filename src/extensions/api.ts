/**
 * What an extension's React half may rely on from Diff Trek.
 *
 * Imported by extensions as `@difftrek/extension`, so this file is the whole
 * of their view of the core: anything not exported here is not part of the
 * contract and may change without notice. Keep it small.
 */

import type { ComponentType } from 'react';
import type { FileDropEvent } from '../services/backend.ts';

export type { FileDropEvent };

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

/** A panel shown on a landing screen. */
export interface LandingContribution {
  /** The screens it appears on. */
  modes: readonly Mode[];
  component: ComponentType<LandingProps>;
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
