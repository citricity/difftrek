import { GitBranch, GitCompare } from 'lucide-react';
import { useT } from '../../i18n/index.ts';
import type { MessageKey, Translate } from '../../i18n/index.ts';
import type { ComparisonInfo, RepositoryInfo } from '../../types/index.ts';
import styles from './RepositoryHeader.module.css';

interface Props {
  repository: RepositoryInfo | null;
  summary: { files: number; additions: number; deletions: number };
}

/** What a commit or range resolved to, for the chip's tooltip. */
function describeComparison(
  t: Translate<MessageKey>,
  { base, target }: ComparisonInfo,
): string {
  return base === null
    ? t('repository.comparison.firstCommit', { target })
    : t('repository.comparison.range', { base, target });
}

/**
 * Repository identity and change totals.
 *
 * Renders as soon as the repository resolves, before any diff has been read —
 * this is the "useful immediately" part of startup.
 *
 * Launched with a commit or range, the branch chip gives way to one naming it:
 * the branch says where the working tree is, which is not what is on screen.
 */
export function RepositoryHeader({ repository, summary }: Props) {
  const t = useT();

  if (repository === null) {
    return (
      <div className={styles.header}>
        <span className={styles.skeleton} />
      </div>
    );
  }

  return (
    <div className={styles.header}>
      <span className={styles.name}>{repository.name}</span>

      {repository.comparison !== null ? (
        <span
          className={styles.branch}
          title={describeComparison(t, repository.comparison)}
        >
          <GitCompare size={12} aria-hidden="true" />
          <span className={styles.branchName}>{repository.comparison.label}</span>
        </span>
      ) : (
        <span className={styles.branch}>
          <GitBranch size={12} aria-hidden="true" />
          {repository.detached ? (
            <span className={styles.branchName}>
              <Detached
                text={t('repository.detachedAt')}
                head={repository.head ?? t('repository.unknownHead')}
              />
            </span>
          ) : (
            <span className={styles.branchName}>
              {repository.branch ?? t('repository.noBranch')}
            </span>
          )}
        </span>
      )}

      {summary.files > 0 && (
        <span className={styles.summary}>
          <span>{t('repository.files', { count: summary.files })}</span>
          {summary.additions > 0 && (
            <span className={styles.additions}>+{summary.additions}</span>
          )}
          {summary.deletions > 0 && (
            <span className={styles.deletions}>&minus;{summary.deletions}</span>
          )}
        </span>
      )}
    </div>
  );
}

/**
 * "detached at abc1234", with the words muted and the commit not.
 *
 * The message keeps `{head}` where the language puts it, so the muted part may
 * come before it, after it, or both.
 */
function Detached({ text, head }: { text: string; head: string }) {
  const [before, after = ''] = text.split('{head}');
  return (
    <>
      {before !== '' && <span className={styles.detached}>{before}</span>}
      {head}
      {after !== '' && <span className={styles.detached}>{after}</span>}
    </>
  );
}
