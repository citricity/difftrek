import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Settings2, X } from 'lucide-react';
import { onSettingsRequested } from '../../services/backend.ts';
import type { SettingsState } from '../../hooks/useSettings.ts';
import {
  AUTO_LANGUAGE,
  SUPPORTED_LOCALES,
  languageName,
  resolveLocale,
  useI18n,
} from '../../i18n/index.ts';
import { MAX_WRAP_LENGTH, MIN_WRAP_LENGTH } from '../../types/index.ts';
import type { Settings, WrapMode } from '../../types/index.ts';
import styles from './SettingsDialog.module.css';

interface Props {
  /** The whole of `useSettings`: the values, the last save error, the setter. */
  state: SettingsState;
}

/**
 * Settings.
 *
 * Named as macOS 13 and later name it — the menu item, this dialog, the Rust
 * module and `settings.json` all agree on the word.
 *
 * A native `<dialog>` rather than a framework one: `showModal` already gives
 * the focus trap, the backdrop, the inert background and Escape to close, and
 * `CLAUDE.md` asks for native elements wherever they are practical. It also
 * keeps the interface deliberately small — complex preference screens are
 * listed there as out of scope.
 */
export function SettingsDialog({ state }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const wrapId = useId();
  const lengthId = useId();
  const viewId = useId();
  const notesId = useId();
  const languageId = useId();

  const { settings, error, update } = state;

  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;

    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  // The same dialog is opened from the application menu (⌘, on macOS), which
  // is where a desktop user will look for it first.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    onSettingsRequested(() => setOpen(true)).then(
      (off) => {
        // The effect can be torn down before the subscription resolves, in
        // which case there is nothing to keep and it has to be undone
        // immediately.
        if (cancelled) off();
        else unlisten = off;
      },
      (thrown: unknown) => {
        // Rejected when the webview lacks the event permission (see
        // src-tauri/capabilities). The menu item then silently does nothing,
        // so at least say why.
        console.error('[difftrek] could not subscribe to the Settings menu', thrown);
      },
    );

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Escape and the backdrop close the dialog without going through the button,
  // so the element is the source of truth for whether it is open.
  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  /**
   * The wrap length is edited as text rather than bound straight to a number.
   *
   * Typing "80" over "120" passes through the empty string, and a controlled
   * number input would either reject the keystroke or snap to a clamped value
   * mid-edit. So the field holds whatever is typed and only commits when it
   * parses.
   */
  const [draft, setDraft] = useState<string | null>(null);

  const i18n = useI18n();
  const { t } = i18n;

  /** What Automatic means on this machine, named in the option itself. */
  const automatic = resolveLocale(AUTO_LANGUAGE, i18n.systemLocales, SUPPORTED_LOCALES);

  /**
   * A stored language this build does not ship — written by a newer version,
   * say — is kept rather than overwritten, and shown as itself so the select
   * is never blank. It is followed as Automatic until a build ships it.
   */
  const unknownLanguage =
    settings.language !== AUTO_LANGUAGE &&
    !SUPPORTED_LOCALES.includes(settings.language)
      ? settings.language
      : null;

  /**
   * The column only means something to fixed-column wrapping, so it is
   * disabled otherwise rather than hidden: the value is still shown, because
   * it is still stored and comes back into effect when that mode is chosen.
   * A half-typed draft is dropped with it, since a disabled field never blurs
   * to commit it.
   */
  const lengthDisabled = settings.wrap !== 'column';
  const length = lengthDisabled
    ? String(settings.wrapLength)
    : (draft ?? String(settings.wrapLength));

  const commitLength = useCallback(
    (value: string) => {
      const parsed = Number.parseInt(value, 10);
      setDraft(null);

      if (Number.isFinite(parsed) && parsed !== settings.wrapLength) {
        update({ wrapLength: parsed });
      }
    },
    [settings.wrapLength, update],
  );

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(true)}
        aria-label={t('settings.title')}
        title={t('settings.title')}
      >
        <Settings2 size={15} aria-hidden="true" />
      </button>

      <dialog ref={dialog} className={styles.dialog} onClose={handleClose}>
        <header className={styles.header}>
          <h2 className={styles.title}>{t('settings.title')}</h2>
          <button
            type="button"
            className={styles.close}
            onClick={handleClose}
            aria-label={t('settings.close')}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </header>

        <div className={styles.body}>
          <div className={styles.field}>
            <label htmlFor={languageId} className={styles.label}>
              {t('settings.language.label')}
              <span className={styles.hint}>{t('settings.language.hint')}</span>
            </label>
            {/* Each language is named in itself, and marked as such, so that
                someone who cannot read the current one can still find theirs
                and a screen reader pronounces it properly. */}
            <select
              id={languageId}
              className={styles.select}
              value={settings.language}
              onChange={(event) => update({ language: event.target.value })}
            >
              <option value={AUTO_LANGUAGE}>
                {t('settings.language.auto', { language: languageName(automatic) })}
              </option>
              {SUPPORTED_LOCALES.map((tag) => (
                <option key={tag} value={tag} lang={tag}>
                  {languageName(tag)}
                </option>
              ))}
              {unknownLanguage !== null && (
                <option value={unknownLanguage}>{unknownLanguage}</option>
              )}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor={wrapId} className={styles.label}>
              {t('settings.wrap.label')}
              <span className={styles.hint}>
                {t(`settings.wrap.hint.${settings.wrap}`)}
              </span>
            </label>
            <select
              id={wrapId}
              className={styles.select}
              value={settings.wrap}
              onChange={(event) => {
                setDraft(null);
                update({ wrap: event.target.value as WrapMode });
              }}
            >
              <option value="off">{t('settings.wrap.option.off')}</option>
              <option value="auto">{t('settings.wrap.option.auto')}</option>
              <option value="column">{t('settings.wrap.option.column')}</option>
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor={lengthId} className={styles.label}>
              {t('settings.wrapLength.label')}
              <span className={styles.hint}>
                {lengthDisabled
                  ? t('settings.wrapLength.hint.disabled')
                  : t('settings.wrapLength.hint.range', {
                      min: MIN_WRAP_LENGTH,
                      max: MAX_WRAP_LENGTH,
                    })}
              </span>
            </label>
            <input
              id={lengthId}
              type="number"
              className={styles.number}
              min={MIN_WRAP_LENGTH}
              max={MAX_WRAP_LENGTH}
              disabled={lengthDisabled}
              value={length}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={(event) => commitLength(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitLength(event.currentTarget.value);
              }}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor={viewId} className={styles.label}>
              {t('settings.viewMode.label')}
              <span className={styles.hint}>{t('settings.viewMode.hint')}</span>
            </label>
            <select
              id={viewId}
              className={styles.select}
              value={settings.defaultViewMode}
              onChange={(event) =>
                update({
                  defaultViewMode: event.target.value as Settings['defaultViewMode'],
                })
              }
            >
              <option value="unified">{t('settings.viewMode.option.unified')}</option>
              <option value="split">{t('settings.viewMode.option.split')}</option>
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor={notesId} className={styles.label}>
              {t('settings.notes.label')}
              <span className={styles.hint}>
                {t(`settings.notes.hint.${settings.notePlacement}`)}
              </span>
            </label>
            <select
              id={notesId}
              className={styles.select}
              value={settings.notePlacement}
              onChange={(event) =>
                update({
                  notePlacement: event.target.value as Settings['notePlacement'],
                })
              }
            >
              <option value="overlay">{t('settings.notes.option.overlay')}</option>
              <option value="sidebar">{t('settings.notes.option.sidebar')}</option>
              <option value="topbar">{t('settings.notes.option.topbar')}</option>
            </select>
          </div>

          {error !== null && <p className={styles.error}>{error}</p>}
        </div>
      </dialog>
    </>
  );
}
