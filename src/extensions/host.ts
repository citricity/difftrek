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
 */
function subscribe(start: () => Promise<() => void>): () => void {
  let stop: (() => void) | null = null;
  let cancelled = false;

  void start().then((unlisten) => {
    if (cancelled) unlisten();
    else stop = unlisten;
  });

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
      onFileDrop: (listener) => subscribe(() => onFileDrop(listener)),
      onMenuItem: (item, listener) =>
        subscribe(() =>
          onExtensionMenuItem((chosen) => {
            // Only this extension's own items: another's are none of its
            // business, even one with the same item name.
            if (chosen.extension === id && chosen.item === item) listener();
          }),
        ),
    }),
    [id, onReload],
  );
}
