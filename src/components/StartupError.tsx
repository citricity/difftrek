import { AlertTriangle } from 'lucide-react';
import { useT } from '../i18n/index.ts';
import type { MessageKey } from '../i18n/index.ts';
import type { AppError } from '../types/index.ts';
import styles from './StartupError.module.css';

interface Props {
  error: AppError;
}

const TITLES: Partial<Record<AppError['kind'], MessageKey>> = {
  notARepository: 'startup.title.notARepository',
  gitUnavailable: 'startup.title.gitUnavailable',
  emptyRepository: 'startup.title.emptyRepository',
  permissionDenied: 'startup.title.permissionDenied',
  invalidRevision: 'startup.title.invalidRevision',
};

/**
 * Shown when Diff Trek could not start.
 *
 * The user-facing message stays one sentence; the diagnostic detail is
 * available but visually secondary.
 */
export function StartupError({ error }: Props) {
  const t = useT();

  return (
    <div className={styles.screen}>
      <AlertTriangle className={styles.icon} size={22} aria-hidden="true" />
      <span className={styles.title}>{t(TITLES[error.kind] ?? 'startup.title.fallback')}</span>
      <p className={styles.message}>{error.message}</p>
      {error.detail !== null && <pre className={styles.detail}>{error.detail}</pre>}
    </div>
  );
}
