import { useCallback, useEffect, useRef, useState } from 'react';
import { GitCompare, SquareTerminal } from 'lucide-react';
import { getGitAliasStatus } from '../../services/backend.ts';
import { AppError } from '../../types/index.ts';
import type { GitAliasStatus } from '../../types/index.ts';
import { GitAliasDialog } from './GitAliasDialog.tsx';
import type { GitAliasDialogHandle } from './GitAliasDialog.tsx';
import { rich, useT } from '../../i18n/index.ts';
import styles from './NotARepository.module.css';

/**
 * What `git dt` looks like from here.
 *
 * `other` is a `dt` alias that launches something else — usually another copy
 * of Diff Trek, moved or reinstalled since — so the call to action becomes an
 * update rather than an install.
 */
type Alias = 'checking' | 'installed' | 'other' | 'missing' | 'no-git';

function aliasFrom(status: GitAliasStatus): Alias {
  if (status.installed) return 'installed';
  return status.existing !== null ? 'other' : 'missing';
}

interface Props {
  /**
   * Set when an extension offers something to compare on the same screen, so
   * this is not the only way in. The screen then stops saying Diff Trek only
   * works from Git — it no longer does — and shows nothing at all unless there
   * is something worth doing: Git is installed and `git dt` is missing or
   * points at another copy.
   */
  alongside?: boolean;
}

/**
 * Shown when Diff Trek is opened outside a Git repository.
 *
 * That is not a failure so much as the normal result of opening the app from
 * Applications or the Dock, so it gets guidance rather than an error and a
 * line of Git's stderr. What the guidance is depends on whether `git dt` is
 * set up: without it, installing the command is the one thing worth doing
 * here; with it, the screen explains how Diff Trek is meant to be opened.
 */
export function NotARepository({ alongside = false }: Props) {
  const [alias, setAlias] = useState<Alias>('checking');
  const dialog = useRef<GitAliasDialogHandle>(null);
  /**
   * Set once the dialog has reported a status. Anything it reports is newer
   * than the read this screen started on mount, so that read, if it is still
   * outstanding, must not overwrite it.
   */
  const heardFromDialog = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const stale = () => cancelled || heardFromDialog.current;

    getGitAliasStatus().then(
      (status) => {
        if (!stale()) setAlias(aliasFrom(status));
      },
      (thrown: unknown) => {
        console.error('[difftrek] could not read the git dt alias', thrown);
        if (stale()) return;
        // With no Git there is nothing to install the command into. Alone,
        // the screen still offers it, and the dialog explains what is wrong;
        // alongside another way in, there is nothing to say.
        const noGit = AppError.from(thrown).kind === 'gitUnavailable';
        setAlias(noGit && alongside ? 'no-git' : 'missing');
      },
    );

    return () => {
      cancelled = true;
    };
  }, [alongside]);

  // Installing from the dialog, or from the menu, changes what this screen says.
  const handleStatusChange = useCallback((status: GitAliasStatus) => {
    heardFromDialog.current = true;
    setAlias(aliasFrom(status));
  }, []);

  const openDialog = useCallback(() => dialog.current?.open(), []);

  const t = useT();
  const gitDt = <code>git dt</code>;
  const action = alias === 'other' ? 'update' : 'install';

  if (alongside) {
    return (
      <>
        {(alias === 'missing' || alias === 'other') && (
          // One quiet line: the panel above is what this screen is for now.
          <section className={styles.alongside}>
            <SquareTerminal className={styles.icon} size={16} aria-hidden="true" />
            <h2 className={styles.alongsideTitle}>
              {rich(t(`gitAlias.screen.alongside.${action}.title`), { command: gitDt })}
            </h2>
            <p className={styles.alongsideMessage}>
              {t(`gitAlias.screen.alongside.${action}.message`)}
            </p>
            <button
              type="button"
              className={styles.alongsideButton}
              onClick={openDialog}
              aria-label={t(`gitAlias.screen.${action}.button`, { command: 'git dt' })}
            >
              {t(`gitAlias.screen.alongside.${action}.button`)}
            </button>
          </section>
        )}
        {/* Mounted whatever the state, so the menu item still opens it. */}
        <GitAliasDialog ref={dialog} onStatusChange={handleStatusChange} />
      </>
    );
  }

  return (
    <div className={styles.screen}>
      {alias === 'checking' && (
        <p className={styles.message} role="status">
          {rich(t('gitAlias.screen.checking'), { command: gitDt })}
        </p>
      )}

      {alias === 'installed' && (
        <>
          <GitCompare className={styles.icon} size={22} aria-hidden="true" />
          <h1 className={styles.title}>{t('gitAlias.screen.openFromGit.title')}</h1>
          <p className={styles.message}>
            {rich(t('gitAlias.screen.openFromGit.message'), {
              cd: <code>cd</code>,
              command: gitDt,
            })}
          </p>
          <p className={styles.message}>
            {rich(t('gitAlias.screen.openFromGit.lastCommit'), {
              command: <code>git dt HEAD</code>,
            })}
          </p>
        </>
      )}

      {(alias === 'missing' || alias === 'other') && (
        <>
          <SquareTerminal className={styles.icon} size={22} aria-hidden="true" />
          <h1 className={styles.title}>
            {rich(t(`gitAlias.screen.${action}.title`), { command: gitDt })}
          </h1>
          <p className={styles.message}>
            {rich(t(`gitAlias.screen.${action}.message`), { command: gitDt })}
          </p>
          <button type="button" className={styles.button} onClick={openDialog}>
            {rich(t(`gitAlias.screen.${action}.button`), { command: gitDt })}
          </button>
        </>
      )}

      <GitAliasDialog ref={dialog} onStatusChange={handleStatusChange} />
    </div>
  );
}
