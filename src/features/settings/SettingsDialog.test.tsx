/**
 * The Settings dialog's dependent field: the wrap column only applies to
 * fixed-column wrapping, and says so by being disabled otherwise.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsDialog } from './SettingsDialog.tsx';
import {
  CORE_CATALOGUES,
  SUPPORTED_LOCALES,
  createTranslator,
} from '../../i18n/index.ts';
import type { MessageKey } from '../../i18n/index.ts';
import { I18nContext } from '../../i18n/context.ts';
import { DEFAULT_SETTINGS } from '../../types/index.ts';
import type { WrapMode } from '../../types/index.ts';

function renderWith(wrap: WrapMode) {
  const update = vi.fn();
  render(
    <SettingsDialog
      state={{
        settings: { ...DEFAULT_SETTINGS, wrap, wrapLength: 90 },
        error: null,
        update,
      }}
    />,
  );
  const column = screen.getByLabelText<HTMLInputElement>(/Fixed column/);
  const mode = screen.getByLabelText<HTMLSelectElement>(/Wrap long lines/);
  return { update, column, mode };
}

describe('SettingsDialog', () => {
  it('enables the column when wrapping at a fixed column', () => {
    expect(renderWith('column').column.disabled).toBe(false);
  });

  it.each<WrapMode>(['auto', 'off'])(
    'disables the column when wrapping is %s',
    (wrap) => {
      const { column } = renderWith(wrap);
      expect(column.disabled).toBe(true);
      // Still shown: the value is stored and comes back with fixed-column mode.
      expect(column.value).toBe('90');
    },
  );

  it('asks for the new mode when the dropdown changes', () => {
    const { mode, update } = renderWith('column');
    fireEvent.change(mode, { target: { value: 'auto' } });
    expect(update).toHaveBeenCalledWith({ wrap: 'auto' });
  });

  it('moves the notes into a sidebar when asked', () => {
    const { update } = renderWith('off');
    const placement = screen.getByLabelText<HTMLSelectElement>(/AI changelog notes/);

    expect(placement.value).toBe('overlay');
    fireEvent.change(placement, { target: { value: 'sidebar' } });
    expect(update).toHaveBeenCalledWith({ notePlacement: 'sidebar' });

    fireEvent.change(placement, { target: { value: 'topbar' } });
    expect(update).toHaveBeenCalledWith({ notePlacement: 'topbar' });
  });

  it('offers Automatic, naming what it resolves to, then each language in itself', () => {
    const { update } = renderWith('off');
    const language = screen.getByLabelText<HTMLSelectElement>(/Language/);
    const options = Array.from(language.options);

    expect(language.value).toBe('auto');
    // No system languages in a test, so Automatic lands on the base.
    expect(options[0].textContent).toBe('Automatic (English (UK))');
    expect(options.slice(1).map((option) => option.value)).toEqual([
      ...SUPPORTED_LOCALES,
    ]);
    expect(options.find((option) => option.value === 'de')?.textContent).toBe(
      'Deutsch',
    );
    expect(options.find((option) => option.value === 'de')?.lang).toBe('de');

    fireEvent.change(language, { target: { value: 'de' } });
    expect(update).toHaveBeenCalledWith({ language: 'de' });
  });

  it('keeps a stored language this build does not ship', () => {
    render(
      <SettingsDialog
        state={{
          settings: { ...DEFAULT_SETTINGS, language: 'it' },
          error: null,
          update: vi.fn(),
        }}
      />,
    );
    expect(screen.getByLabelText<HTMLSelectElement>(/Language/).value).toBe('it');
  });

  it('speaks the language it is given', () => {
    render(
      <I18nContext.Provider
        value={{
          locale: 'de',
          systemLocales: ['de-DE'],
          t: createTranslator<MessageKey>('de', CORE_CATALOGUES),
        }}
      >
        <SettingsDialog
          state={{ settings: DEFAULT_SETTINGS, error: null, update: vi.fn() }}
        />
      </I18nContext.Provider>,
    );

    const language = screen.getByLabelText<HTMLSelectElement>(/Sprache/);
    expect(language.options[0].textContent).toBe('Automatisch (Deutsch)');
  });
});
