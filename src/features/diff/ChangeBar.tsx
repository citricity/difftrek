/**
 * The logical change the reader is in, under the toolbar.
 *
 * A gutter badge says *which* change a hunk belongs to; only this says *what*
 * the change is, which is the part worth reading. It appears whenever the
 * changelog has a logical change to name and takes no toolbar slot to reveal:
 * there is nothing to disclose, because a reader with a changelog open always
 * wants it.
 *
 * Two walks live here, and they are kept visibly apart. Beside the badge,
 * stepping from change to change — the badge names the change, so the arrows
 * that swap it sit next to it. At the far end, stepping through the hunks of
 * the change in view, which never leaves it. Each has a word before its
 * counter and its own glyph, because two identical "n / m ⌃ ⌄" groups in one
 * strip are only told apart by hovering.
 *
 * Deliberately lighter than the toolbar above it — smaller text, muted, page
 * background — so the two do not read as two title bars.
 */

import {
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  Crosshair,
  List,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { laneColour } from '../../lib/noteMarkers.ts';
import { useT } from '../../i18n/index.ts';
import styles from './ChangeBar.module.css';

interface Props {
  /** The current change's label, or null when the cursor is in no change. */
  label: string | null;
  description: string | null;
  /** One-based position among the changes, or null with no current change. */
  position: number | null;
  total: number;
  /** Whether the reader is on a hunk at all, which the empty text turns on. */
  onHunk: boolean;
  focused: boolean;
  canGoNext: boolean;
  canGoPrevious: boolean;
  /** One-based position among the current change's hunks, if on one of them. */
  hunkPosition: number | null;
  /** How many hunks the current change covers; 0 with no current change. */
  hunkTotal: number;
  canGoNextHunk: boolean;
  canGoPreviousHunk: boolean;
  onOpenContents: () => void;
  /** Show the current change's description in full. */
  onOpenChange: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onNextHunk: () => void;
  onPreviousHunk: () => void;
  onToggleFocus: () => void;
}

export function ChangeBar({
  label,
  description,
  position,
  total,
  onHunk,
  focused,
  canGoNext,
  canGoPrevious,
  hunkPosition,
  hunkTotal,
  canGoNextHunk,
  canGoPreviousHunk,
  onOpenContents,
  onOpenChange,
  onNext,
  onPrevious,
  onNextHunk,
  onPreviousHunk,
  onToggleFocus,
}: Props) {
  const t = useT();
  const lane = label === null ? undefined : laneColour(label);

  return (
    <div className={`${styles.bar} ${focused ? styles.barFocused : ''}`}>
      <button
        type="button"
        className={styles.contents}
        onClick={onOpenContents}
        title={t('changeBar.allLogicalChanges')}
        aria-label={t('changeBar.allLogicalChanges')}
        aria-haspopup="dialog"
      >
        <span
          className={`${styles.mark} ${label === null ? styles.empty : ''}`}
          style={{ '--note-lane': lane } as CSSProperties}
          aria-hidden="true"
        >
          {label ?? '–'}
        </span>
        <List size={12} aria-hidden="true" />
      </button>

      <div className={styles.walk}>
        <span className={styles.position} aria-live="polite">
          <span className={styles.word}>{t('changeBar.change')}</span> {position ?? '–'}{' '}
          / {total}
        </span>

        <div className={styles.group}>
          <button
            type="button"
            className={styles.button}
            onClick={onPrevious}
            disabled={!canGoPrevious}
            title={t('changeBar.previousChangeTitle')}
            aria-label={t('changeBar.previousChange')}
          >
            <ChevronsUp size={14} aria-hidden="true" />
          </button>

          <button
            type="button"
            className={styles.button}
            onClick={onNext}
            disabled={!canGoNext}
            title={t('changeBar.nextChangeTitle')}
            aria-label={t('changeBar.nextChange')}
          >
            <ChevronsDown size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* The change's own words, cut to whatever the window can spare. Some
          run to several sentences, so a click shows them whole — in a dialog
          with nothing else in it, since the walking is all done out here. */}
      {label === null ? (
        <span className={`${styles.description} ${styles.muted}`}>
          {onHunk
            ? t('changeBar.notInChange')
            : t('changeBar.changeCount', { count: total })}
        </span>
      ) : (
        <button
          type="button"
          className={`${styles.description} ${styles.descriptionButton}`}
          onClick={onOpenChange}
          title={t('changeBar.readDescription')}
          aria-haspopup="dialog"
        >
          {description}
        </button>
      )}

      <div className={styles.walk}>
        <span className={styles.position} aria-live="polite">
          <span className={styles.word}>{t('changeBar.hunk')}</span>{' '}
          {hunkPosition ?? '–'} / {label === null ? '–' : hunkTotal}
        </span>

        <div className={styles.group}>
          <button
            type="button"
            className={styles.button}
            onClick={onPreviousHunk}
            disabled={!canGoPreviousHunk}
            title={t('changeBar.previousHunkTitle')}
            aria-label={t('changeBar.previousHunk')}
          >
            <ChevronUp size={14} aria-hidden="true" />
          </button>

          <button
            type="button"
            className={styles.button}
            onClick={onNextHunk}
            disabled={!canGoNextHunk}
            title={t('changeBar.nextHunkTitle')}
            aria-label={t('changeBar.nextHunk')}
          >
            <ChevronDown size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      <button
        type="button"
        className={`${styles.focus} ${focused ? styles.focusOn : ''}`}
        onClick={onToggleFocus}
        disabled={label === null}
        aria-pressed={focused}
        // The arrows beside it already walk this change; what focusing adds is
        // the rest of the window — the toolbar's arrows, n / p and following
        // the scroll — so that is what the tip says.
        title={focused ? t('changeBar.stopFocusingTitle') : t('changeBar.focusTitle')}
        aria-label={focused ? t('changeBar.stopFocusing') : t('changeBar.focus')}
      >
        <Crosshair size={13} aria-hidden="true" />
      </button>
    </div>
  );
}
