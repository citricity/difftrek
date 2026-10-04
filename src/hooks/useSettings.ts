/**
 * User preferences.
 *
 * Loading never blocks the diff: the defaults render immediately and the stored
 * values replace them when they arrive, which is a change nobody sees unless
 * they had actually changed something.
 *
 * Saving is optimistic. The UI moves on the click, and the write happens
 * behind it — a preference that visibly lags the checkbox feels broken, and the
 * backend clamps rather than rejects, so the only surprise it can return is a
 * value slightly different from the one asked for.
 *
 * Settings belong to the app, not to a window, so what another window stores
 * is adopted here as it arrives.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSettings, onSettingsChanged, setSettings } from '../services/backend.ts';
import { AppError, DEFAULT_SETTINGS } from '../types/index.ts';
import type { Settings } from '../types/index.ts';

export interface SettingsState {
  settings: Settings;
  /** Null unless the last save failed, in which case the dialog says so. */
  error: string | null;
  update: (change: Partial<Settings>) => void;
}

export function useSettings(): SettingsState {
  const [settings, setLocal] = useState<Settings>(DEFAULT_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  /**
   * Which save is the current one.
   *
   * Saves are fired as they are asked for, and nothing promises they come back
   * in that order — a dragged sidebar can ask several times a second. An older
   * answer adopted last would put a width back that the reader has already
   * moved on from, and write it to disk besides. Only the latest is adopted;
   * the rest are left to land in the file in whatever order the backend
   * settles them, which is what the last request says anyway.
   */
  const latest = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /**
   * Whether something newer than the file as first read has been adopted: a
   * value another window stored, or a change made here.
   *
   * The first read is a snapshot, and it can be overtaken. Another window may
   * store new settings after the file was read but before the answer arrives;
   * applied then, the stale snapshot would put back what that window changed,
   * and nothing would correct it until the next change. So the snapshot only
   * applies while nothing newer has.
   */
  const superseded = useRef(false);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      // Listening first, so a change stored while the file is being read is
      // heard rather than lost between the two.
      try {
        const stop = await onSettingsChanged((stored) => {
          superseded.current = true;
          setLocal(stored);
        });
        // An unmount that came first is honoured as soon as the
        // subscription resolves.
        if (cancelled) stop();
        else unlisten = stop;
      } catch (thrown) {
        // Other windows' changes will not arrive, but this window still works.
        console.error('[difftrek] could not follow other windows’ settings', thrown);
      }

      try {
        const stored = await getSettings();
        if (alive.current && !superseded.current) setLocal(stored);
      } catch (thrown) {
        // Defaults are already on screen; there is nothing to tell the user.
        console.error('[difftrek] reading preferences failed', thrown);
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const update = useCallback((change: Partial<Settings>): void => {
    superseded.current = true;
    setLocal((previous) => {
      const next = { ...previous, ...change };

      const ticket = (latest.current += 1);

      void (async () => {
        try {
          const stored = await setSettings(next);
          if (!alive.current || ticket !== latest.current) return;

          setError(null);
          // What came back is what was stored, clamped; adopting it keeps the
          // dialog honest about a value the backend narrowed.
          setLocal(stored);
        } catch (thrown) {
          if (alive.current && ticket === latest.current) {
            setError(AppError.from(thrown).message);
          }
        }
      })();

      return next;
    });
  }, []);

  return { settings, error, update };
}
