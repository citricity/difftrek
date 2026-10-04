import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Ref } from 'react';
import { X } from 'lucide-react';
import {
  getGitAliasStatus,
  installGitAlias,
  onGitAliasRequested,
} from '../../services/backend.ts';
import { rich, useT } from '../../i18n/index.ts';
import { AppError } from '../../types/index.ts';
import type { GitAliasStatus } from '../../types/index.ts';
import styles from './GitAliasDialog.module.css';

type Stage =
  | { name: 'closed' }
  | { name: 'loading' }
  /** Showing what will run, waiting for the user to agree. */
  | { name: 'confirm'; status: GitAliasStatus; installing: boolean }
  | { name: 'done'; status: GitAliasStatus; already: boolean }
  | { name: 'failed'; message: string };

/** For a screen that offers installing as a button, not only from the menu. */
export interface GitAliasDialogHandle {
  open: () => void;
}

interface Props {
  ref?: Ref<GitAliasDialogHandle>;
  /** Told of every status the dialog reads or installs. */
  onStatusChange?: (status: GitAliasStatus) => void;
}

/**
 * Installs the `git dt` alias, after asking.
 *
 * Changing someone's global Git configuration is not something to do on a
 * click alone, so the dialog first reads what would happen — the exact command,
 * the executable it points at, any `dt` alias it would replace, and any reason
 * this copy of Diff Trek is a poor thing to point at — and runs nothing until
 * the user presses Install.
 *
 * The status is read afresh on every opening, since the configuration can
 * change between them. A native `<dialog>`, like Settings.
 */
export function GitAliasDialog({ ref, onStatusChange }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const t = useT();
  const [stage, setStage] = useState<Stage>({ name: 'closed' });
  const open = stage.name !== 'closed';

  // Held in a ref so a parent passing a fresh callback each render does not
  // resubscribe to the menu or reopen the dialog.
  const statusListener = useRef(onStatusChange);
  useEffect(() => {
    statusListener.current = onStatusChange;
  }, [onStatusChange]);

  /**
   * The request whose answer the dialog is waiting for.
   *
   * Every read, install and close takes a new number, and an answer is only
   * applied if nothing has happened since it was asked for. Otherwise a slow
   * read could reopen a dialog the user has already dismissed with Escape, or
   * overwrite a newer answer — an earlier "not installed" landing after the
   * install that followed it.
   */
  const request = useRef(0);

  const start = useCallback(() => {
    const ticket = ++request.current;
    setStage({ name: 'loading' });
    getGitAliasStatus().then(
      (status) => {
        if (ticket !== request.current) return;
        statusListener.current?.(status);
        setStage(
          status.installed
            ? { name: 'done', status, already: true }
            : { name: 'confirm', status, installing: false },
        );
      },
      (thrown: unknown) => {
        if (ticket !== request.current) return;
        setStage({ name: 'failed', message: AppError.from(thrown).message });
      },
    );
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    onGitAliasRequested(start).then(
      (off) => {
        if (cancelled) off();
        else unlisten = off;
      },
      (thrown: unknown) => {
        console.error('[difftrek] could not subscribe to the git dt menu item', thrown);
      },
    );

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [start]);

  useImperativeHandle(ref, () => ({ open: start }), [start]);

  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;

    // jsdom has neither `showModal` nor `close`; the attribute stands in.
    if (open && !element.open) {
      if (typeof element.showModal === 'function') element.showModal();
      else element.setAttribute('open', '');
    }
    if (!open && element.open) {
      if (typeof element.close === 'function') element.close();
      else element.removeAttribute('open');
    }
  }, [open]);

  const close = useCallback(() => {
    request.current++;
    setStage({ name: 'closed' });
  }, []);

  const install = useCallback(() => {
    setStage((previous) =>
      previous.name === 'confirm' ? { ...previous, installing: true } : previous,
    );
    const ticket = ++request.current;
    installGitAlias().then(
      (status) => {
        // The alias was written whether or not anyone is still watching, so
        // the listener hears about it even if the dialog has been dismissed.
        statusListener.current?.(status);
        if (ticket === request.current)
          setStage({ name: 'done', status, already: false });
      },
      (thrown: unknown) => {
        if (ticket !== request.current) return;
        setStage({ name: 'failed', message: AppError.from(thrown).message });
      },
    );
  }, []);

  const gitDt = <code>git dt</code>;

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="git-alias-title"
      onClose={close}
    >
      <header className={styles.header}>
        <h2 id="git-alias-title" className={styles.title}>
          {rich(t('gitAlias.title'), { command: gitDt })}
        </h2>
        <button
          type="button"
          className={styles.close}
          onClick={close}
          aria-label={t('gitAlias.close')}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </header>

      <div className={styles.body}>
        {stage.name === 'loading' && (
          <p className={styles.muted}>{t('gitAlias.checking')}</p>
        )}

        {stage.name === 'confirm' && (
          <>
            <p>
              {rich(t('gitAlias.explanation'), {
                command: gitDt,
                rangeExample: <code>git dt main...HEAD</code>,
              })}
            </p>

            <p className={styles.label}>{t('gitAlias.willRun')}</p>
            <pre className={styles.code}>{stage.status.command}</pre>

            {stage.status.existing !== null && (
              <>
                <p className={styles.label}>
                  {rich(t('gitAlias.replaces'), { command: gitDt })}
                </p>
                <pre className={styles.code}>{stage.status.existing}</pre>
              </>
            )}

            {stage.status.warning !== null && (
              <p className={styles.warning} role="note">
                {stage.status.warning}
              </p>
            )}
          </>
        )}

        {stage.name === 'done' && (
          <>
            <p className={styles.success}>
              {rich(t(stage.already ? 'gitAlias.alreadySetUp' : 'gitAlias.installed'), {
                command: gitDt,
              })}
            </p>
            <p>
              {rich(t('gitAlias.usage'), {
                command: gitDt,
                commitExample: <code>git dt HEAD~1</code>,
                rangeExample: <code>git dt main...HEAD</code>,
              })}
            </p>
            {stage.status.warning !== null && (
              <p className={styles.warning} role="note">
                {stage.status.warning}
              </p>
            )}
          </>
        )}

        {stage.name === 'failed' && (
          <p className={styles.error} role="alert">
            {stage.message}
          </p>
        )}
      </div>

      <footer className={styles.footer}>
        {stage.name === 'confirm' ? (
          <>
            <button
              type="button"
              className={styles.button}
              onClick={close}
              disabled={stage.installing}
            >
              {t('gitAlias.cancel')}
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.primary}`}
              onClick={install}
              disabled={stage.installing}
              autoFocus
            >
              {t(stage.installing ? 'gitAlias.installing' : 'gitAlias.install')}
            </button>
          </>
        ) : stage.name === 'failed' ? (
          <>
            <button type="button" className={styles.button} onClick={close}>
              {t('gitAlias.close')}
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.primary}`}
              onClick={start}
            >
              {t('gitAlias.tryAgain')}
            </button>
          </>
        ) : (
          <button
            type="button"
            className={`${styles.button} ${styles.primary}`}
            onClick={close}
            disabled={stage.name === 'loading'}
          >
            {t('gitAlias.close')}
          </button>
        )}
      </footer>
    </dialog>
  );
}
