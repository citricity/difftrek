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

vi.mock('../services/backend.ts', () => ({
  getSettings: () => getSettings(),
  setSettings: (settings: Settings) => setSettings(settings),
}));

const { useSettings } = await import('./useSettings.ts');

beforeEach(() => {
  getSettings.mockResolvedValue(DEFAULT_SETTINGS);
  setSettings.mockReset();
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
});
