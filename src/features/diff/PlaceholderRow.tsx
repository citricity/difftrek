import { memo } from 'react';
import type { CSSProperties } from 'react';
import { skeletonLines } from '../../lib/skeleton.ts';
import styles from './DiffRows.module.css';

interface Props {
  /** Absolute position and nothing else; the height follows from `lines`. */
  style: CSSProperties;
  fileId: string;
  path: string;
  /** Rows tall, as the model laid it out — see `placeholderLines`. */
  lines: number;
}

/**
 * A file whose diff is on its way, drawn as shimmering lines of code.
 *
 * Each skeleton line is one row tall and starts where code would, after the
 * gutter, so the block reads as the hunk it stands in for rather than as a
 * generic spinner, and the document shifts less when the real rows arrive.
 */
function PlaceholderRowImpl({ style, fileId, path, lines }: Props) {
  return (
    <div
      className={`${styles.row} ${styles.placeholder}`}
      style={style}
      role="row"
      aria-busy="true"
      aria-label={`Loading ${path}`}
    >
      {skeletonLines(fileId, lines).map((line, index) => (
        <div key={index} className={styles.skeletonLine} aria-hidden="true">
          <span
            className={styles.skeletonText}
            style={{ marginLeft: `${line.indent}ch`, width: `${line.width}%` }}
          />
        </div>
      ))}
    </div>
  );
}

export const PlaceholderRow = memo(PlaceholderRowImpl);
