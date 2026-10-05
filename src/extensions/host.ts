/**
 * The host an extension's components are given. Shared by landing panels and
 * app components, so every part of an extension sees the same services.
 */

import { useMemo } from 'react';
import {
  invokeExtension,
  onExtensionMenuItem,
  onFileDrop,
} from '../services/backend.ts';
import type { ExtensionHost } from './api.ts';

/**
 * Turns an asynchronous subscription into a synchronous unsubscribe: one that
 * arrives before the subscription has resolved is honoured as soon as it does.
 *
 * A subscription that fails — the webview lacking the event permission, say —
 * leaves the extension's listener never called, so it is logged as the core's
 * own menu subscriptions are, rather than left as an unhandled rejection.
 */
function subscribe(start: () => Promise<() => void>, what: string): () => void {
  let stop: (() => void) | null = null;
  let cancelled = false;

  start().then(
    (unlisten) => {
      if (cancelled) unlisten();
      else stop = unlisten;
    },
    (thrown: unknown) => {
      console.error(`[difftrek] could not subscribe to ${what}`, thrown);
    },
  );

  return () => {
    cancelled = true;
    stop?.();
  };
}

/** The services Diff Trek provides to the extension `id`. */
export function useExtensionHost(id: string, onReload: () => void): ExtensionHost {
  return useMemo<ExtensionHost>(
    () => ({
      id,
      invoke: <T>(command: string, args?: Record<string, unknown>) =>
        invokeExtension<T>(id, command, args),
      reload: onReload,
      onFileDrop: (listener) =>
        subscribe(() => onFileDrop(listener), `file drops for ${id}`),
      onMenuItem: (item, listener) =>
        subscribe(
          () =>
            onExtensionMenuItem((chosen) => {
              // Only this extension's own items: another's are none of its
              // business, even one with the same item name.
              if (chosen.extension === id && chosen.item === item) listener();
            }),
          `the ${id} menu item ${item}`,
        ),
    }),
    [id, onReload],
  );
}
