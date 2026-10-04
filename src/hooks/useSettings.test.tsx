/**
 * Saving is optimistic and the answers can arrive in any order.
 *
 * A dragged sidebar asks several times a second, so an older answer adopted
 * last would put back a width the reader has already moved on from.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../types/index.ts';
import type { Settings } from '../types/index.ts';

const getSettings = vi.fn<() => Promise<Settings>>();
const setSettings = vi.fn<(settings: Settings) => Promise<Settings>>();

/** What another window storing settings would call. */
let changedElsewhere: ((settings: Settings) => void) | null = null;

vi.mock('../services/backend.ts', () => ({
  getSettings: () => getSettings(),
  setSettings: (settings: Settings) => setSettings(settings),
  onSettingsChanged: (handler: (settings: Settings) => void) => {
    changedElsewhere = handler;
    return Promise.resolve(() => undefined);
  },
}));

const { useSettings } = await import('./useSettings.ts');

beforeEach(() => {
  getSettings.mockResolvedValue(DEFAULT_SETTINGS);
  setSettings.mockReset();
  changedElsewhere = null;
});

describe('useSettings', () => {
  it('ignores an answer that is no longer the current one', async () => {
    // The first save answers last, as a slow write can.
    const answers: Array<(stored: Settings) => void> = [];
    setSettings.mockImplementation(
      () => new Promise<Settings>((resolve) => answers.push(resolve)),
    );

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(getSettings).toHaveBeenCalled());

    act(() => result.current.update({ noteSidebarWidth: 400 }));
    act(() => result.current.update({ noteSidebarWidth: 500 }));
    expect(result.current.settings.noteSidebarWidth).toBe(500);

    act(() => answers[1]({ ...DEFAULT_SETTINGS, noteSidebarWidth: 500 }));
    act(() => answers[0]({ ...DEFAULT_SETTINGS, noteSidebarWidth: 400 }));

    await waitFor(() => expect(result.current.settings.noteSidebarWidth).toBe(500));
  });

  it('adopts what the backend stored, which it may have clamped', async () => {
    setSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, noteSidebarWidth: 900 });

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(getSettings).toHaveBeenCalled());

    act(() => result.current.update({ noteSidebarWidth: 5000 }));
    await waitFor(() => expect(result.current.settings.noteSidebarWidth).toBe(900));
  });

  it('adopts what another window stored', async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(changedElsewhere).not.toBeNull());

    act(() =>
      changedElsewhere?.({ ...DEFAULT_SETTINGS, language: 'fr', wrap: 'auto' }),
    );

    expect(result.current.settings.language).toBe('fr');
    expect(result.current.settings.wrap).toBe('auto');
    // Taken as stored: echoing it back would only write the same file again.
    expect(setSettings).not.toHaveBeenCalled();
  });

  it('does not let a slow first read undo what another window stored meanwhile', async () => {
    // The file is read before the other window writes, and the answer arrives
    // after: it is the old settings, and must not win.
    let answer: (stored: Settings) => void = () => undefined;
    getSettings.mockImplementation(
      () => new Promise<Settings>((resolve) => (answer = resolve)),
    );

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(getSettings).toHaveBeenCalled());
    // Listening before reading is what lets this change be heard at all.
    expect(changedElsewhere).not.toBeNull();

    act(() => changedElsewhere?.({ ...DEFAULT_SETTINGS, language: 'de' }));
    // Awaited, so the hook has handled the answer before the check.
    await act(() => Promise.resolve(answer({ ...DEFAULT_SETTINGS, language: 'fr' })));

    expect(result.current.settings.language).toBe('de');
  });

  it('still takes the first read when nothing newer came first', async () => {
    getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, language: 'es' });

    const { result } = renderHook(() => useSettings());

    await waitFor(() => expect(result.current.settings.language).toBe('es'));
  });
});
