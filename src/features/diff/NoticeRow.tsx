import { memo } from 'react';
import type { CSSProperties } from 'react';
import { AlertCircle, Binary, FileText } from 'lucide-react';
import { useT } from '../../i18n/index.ts';
import type { MessageKey, Translate } from '../../i18n/index.ts';
import type { NoticeKind } from '../../lib/rows.ts';
import type { DocumentFile } from '../../types/index.ts';
import styles from './DiffRows.module.css';

interface Props {
  file: DocumentFile;
  notice: NoticeKind;
  onLoadFully: () => void;
  onExpand: () => void;
  /** Absolute position within the document canvas, set by the virtualiser. */
  style: CSSProperties;
}

function describe(
  t: Translate<MessageKey>,
  file: DocumentFile,
  notice: NoticeKind,
): string {
  switch (notice) {
    case 'binary':
      return t('rows.notice.binary');
    case 'truncated':
      return t('rows.notice.truncated');
    case 'empty':
      return t('rows.notice.empty');
    case 'collapsed':
      return t('rows.notice.collapsed');
    case 'error':
      return file.error ?? t('rows.notice.error');
  }
}

/** Stands in for a file body we are deliberately not rendering. */
function NoticeRowImpl({ file, notice, onLoadFully, onExpand, style }: Props) {
  const t = useT();
  const Icon =
    notice === 'binary' ? Binary : notice === 'error' ? AlertCircle : FileText;

  return (
    <div className={`${styles.row} ${styles.notice}`} style={style} role="row">
      <Icon size={14} aria-hidden="true" />
      <span className={styles.noticeText}>{describe(t, file, notice)}</span>

      {notice === 'truncated' && (
        <button type="button" className={styles.noticeAction} onClick={onLoadFully}>
          {t('rows.notice.loadAnyway')}
        </button>
      )}

      {notice === 'error' && (
        <button type="button" className={styles.noticeAction} onClick={onLoadFully}>
          {t('rows.notice.retry')}
        </button>
      )}

      {notice === 'collapsed' && (
        <button type="button" className={styles.noticeAction} onClick={onExpand}>
          {t('rows.notice.expand')}
        </button>
      )}
    </div>
  );
}

export const NoticeRow = memo(NoticeRowImpl);
