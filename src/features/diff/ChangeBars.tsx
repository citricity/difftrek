/**
 * The bars joining each logical change's badges, down the notes column.
 *
 * Drawn as one layer over the rows rather than a piece of every row, for two
 * reasons. A bar passes over rows that have no notes column of their own —
 * expanders, and whatever else lies between two hunks of one intent — and
 * drawing it per row would mean teaching each of them about lanes. And the
 * layer is pinned like the full-width bars (see `.pinned`), so it stays put
 * when long lines are scrolled sideways, just as the gutter does.
 *
 * The layer sits above the rows, so a bar stops at the edge of each badge
 * instead of running under it, and sweeps across to a badge that is not over
 * its own slot, on whichever side that badge is (see `changeBarGeometry.ts`). Pointer events pass straight through to the badges and code.
 */

import { memo } from 'react';
import type { CSSProperties } from 'react';
import type { ChangeBarSegment } from '../../lib/changeBars.ts';
import { laneColour } from '../../lib/noteMarkers.ts';
import {
  BADGE_SIZE,
  crossesBadge,
  hookSide,
  hookStrokes,
  HOOK_HEIGHT,
  slotLeft,
} from './changeBarGeometry.ts';
import styles from './DiffRows.module.css';

/** Room left either side of a badge a bar steps around. */
const BADGE_CLEARANCE = 1;

interface Props {
  segments: readonly ChangeBarSegment[];
  offsets: Float64Array;
  lineHeight: number;
  /** The slice of the document being rendered, in pixels. */
  top: number;
  bottom: number;
  labelOf: (change: string) => string;
}

function ChangeBarsImpl({
  segments,
  offsets,
  lineHeight,
  top,
  bottom,
  labelOf,
}: Props) {
  const bars = [];

  for (const segment of segments) {
    const { change, slot, firstRow, lastRow, startBadge, endBadge } = segment;

    // A badge is centred on its row's first visual line, so a bar that hangs
    // from one starts at its lower edge and stops at the upper edge of the
    // other. Without a badge, the bar covers the row to its edge.
    const badgeOffset = (lineHeight + BADGE_SIZE) / 2;
    const from =
      startBadge === null ? offsets[firstRow] : offsets[firstRow] + badgeOffset;
    const to =
      endBadge === null
        ? offsets[lastRow + 1]
        : offsets[lastRow] + lineHeight - badgeOffset;

    if (to <= from || to < top || from > bottom) continue;

    const left = slotLeft(slot);
    const colour = { '--note-lane': laneColour(labelOf(change)) } as CSSProperties;
    const key = `${change}:${firstRow}`;
    const strokes: CSSProperties[] = [];

    // Where a hook takes over, the straight run stops a pixel inside it, so
    // the two never show a seam.
    let straightFrom = from;
    let straightTo = to;

    const startSide = startBadge === null ? null : hookSide(slot, startBadge);
    if (startBadge !== null && startSide !== null) {
      strokes.push(...hookStrokes(slot, startBadge, startSide, 'bottom', from));
      straightFrom = from - 1 + HOOK_HEIGHT - 1;
    }

    const endSide = endBadge === null ? null : hookSide(slot, endBadge);
    if (endBadge !== null && endSide !== null) {
      strokes.push(...hookStrokes(slot, endBadge, endSide, 'top', to));
      straightTo = to + 1 - HOOK_HEIGHT + 1;
    }

    strokes.forEach((style, index) => {
      bars.push(
        <div
          key={`${key}:hook${index}`}
          className={styles.changeBarHook}
          style={{ ...colour, ...style }}
        />,
      );
    });

    // The straight run, broken wherever another change's badge sits in its
    // way, so the bar reads as passing behind the letter rather than over it.
    let pieceFrom = straightFrom;
    const pieces: [number, number][] = [];
    for (const { row, badges } of segment.crossings) {
      if (!crossesBadge(slot, badges)) continue;
      const badgeTop = offsets[row] + (lineHeight - BADGE_SIZE) / 2;
      pieces.push([pieceFrom, badgeTop - BADGE_CLEARANCE]);
      pieceFrom = badgeTop + BADGE_SIZE + BADGE_CLEARANCE;
    }
    pieces.push([pieceFrom, straightTo]);

    for (const [pieceTop, pieceBottom] of pieces) {
      if (pieceBottom <= pieceTop) continue;
      bars.push(
        <div
          key={`${key}:${pieceTop}`}
          className={styles.changeBar}
          style={{ ...colour, left, top: pieceTop, height: pieceBottom - pieceTop }}
        />,
      );
    }
  }

  return (
    <div className={styles.changeBars} aria-hidden="true" data-testid="change-bars">
      {bars}
    </div>
  );
}

export const ChangeBars = memo(ChangeBarsImpl);
