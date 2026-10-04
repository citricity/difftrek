/**
 * What the toolbar says about the AI changelog.
 *
 * One chip, and only when there is something to say: the changelog no longer
 * describes the whole diff. Which change the reader is in, and the narrowing
 * of Previous/Next to one of them, belong to the change bar under the toolbar
 * rather than here — one concept, one home.
 */

import { MessageSquareDashed } from 'lucide-react';
import { changedSince, explained, isComplete } from '../../types/index.ts';
import type { MatchSummary } from '../../types/index.ts';
import { useT } from '../../i18n/index.ts';
import type { MessageKey, Translate } from '../../i18n/index.ts';
import styles from './NoteStatus.module.css';

interface Props {
  summary: MatchSummary;
}

export function NoteStatus({ summary }: Props) {
  const t = useT();

  // `isComplete` mirrors the rule the backend uses to choose between changelog
  // files, where a hunk nobody explained is no reason to reject one. The
  // reader's question here is different — does this account for everything on
  // screen — so an unexplained hunk counts against it.
  if (isComplete(summary) && summary.unexplained === 0) return null;

  const detail = explain(t, summary);

  return (
    <span className={styles.warning} title={detail}>
      <MessageSquareDashed size={13} aria-hidden="true" />
      {t('noteStatus.ratio', { explained: explained(summary), total: summary.total })}
      {/* The ratio alone is meaningless read aloud, and `title` is a mouse
          affordance — so the whole explanation is in the document too, where a
          screen reader will find it. */}
      <span className={styles.detail}>{detail}</span>
    </span>
  );
}

/**
 * The whole story, for the tooltip.
 *
 * Deliberately not phrased as a fault: code changing after the notes were
 * written is the normal way this happens, and it is usually the reader's own
 * later edit.
 */
function explain(t: Translate<MessageKey>, summary: MatchSummary): string {
  const lines = [
    t('noteStatus.explains', { explained: explained(summary), total: summary.total }),
  ];

  if (summary.unexplained > 0) {
    lines.push(t('noteStatus.unexplained', { count: summary.unexplained }));
  }

  const since = changedSince(summary);
  if (since > 0) {
    lines.push(t('noteStatus.changedSince', { count: since }));
  }

  if (summary.partial > 0) {
    lines.push(t('noteStatus.partial', { count: summary.partial }));
  }

  if (summary.staleNotes > 0) {
    lines.push(t('noteStatus.stale', { count: summary.staleNotes }));
  }

  lines.push(t('noteStatus.writeNew'));
  return lines.join('\n');
}
