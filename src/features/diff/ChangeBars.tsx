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
 * its own slot, on whichever side that badge is (see `changeBarGeometry.ts`).
 * Pointer events pass straight through to the badges and code.
 */

import { memo } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import type { ChangeBarSegment } from '../../lib/changeBars.ts';
import { laneColour } from '../../lib/noteMarkers.ts';
import {
  BADGE_SIZE,
  crossesBadge,
  hookSide,
  hookStrokes,
  HOOK_HEIGHT,
  overflowPieces,
  slotLeft,
  stripes,
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
  /**
   * The logical change in focus, or null. While one is, every other bar fades:
   * the gutter then agrees with Previous/Next, which keep to that change, but
   * still shows where other intents share its hunks, and nothing moves.
   */
  focused?: string | null;
}

/** A bar's vertical extent, and the gaps it leaves for other badges. */
interface Extent {
  from: number;
  to: number;
  /** Where another change's badge sits in the bar's way, top and bottom. */
  gaps: [number, number][];
}

/**
 * Where one bar runs, in pixels.
 *
 * A badge is centred on its row's first visual line, so a bar that hangs from
 * its own badge starts at that badge's lower edge and stops at the upper edge
 * of its other one. A bar with no badge of its own on an end row — its letter
 * went into the row's `+n` — starts or stops clear of the badges the row does
 * show, rather than at the row's edge, which left a sliver beside them.
 */
function extentOf(
  segment: ChangeBarSegment,
  offsets: Float64Array,
  lineHeight: number,
): Extent {
  const { firstRow, lastRow, startBadge, endBadge, slot, layout } = segment;
  const badgeTop = (row: number) => offsets[row] + (lineHeight - BADGE_SIZE) / 2;
  const badgeBottom = (row: number) => badgeTop(row) + BADGE_SIZE;

  let from = startBadge === null ? offsets[firstRow] : badgeBottom(firstRow);
  let to = endBadge === null ? offsets[lastRow + 1] : badgeTop(lastRow);
  const gaps: [number, number][] = [];

  for (const { row, badges } of segment.crossings) {
    if (!crossesBadge(slot, badges, layout)) continue;

    if (row === firstRow && startBadge === null) {
      from = badgeBottom(row) + BADGE_CLEARANCE;
    } else if (row === lastRow && endBadge === null) {
      to = badgeTop(row) - BADGE_CLEARANCE;
    } else {
      gaps.push([badgeTop(row) - BADGE_CLEARANCE, badgeBottom(row) + BADGE_CLEARANCE]);
    }
  }

  return { from, to, gaps };
}

/** A straight run from `from` to `to`, broken at each gap. */
function piecesOf(from: number, to: number, gaps: readonly [number, number][]) {
  const pieces: [number, number][] = [];
  let at = from;
  for (const [gapTop, gapBottom] of [...gaps].sort((a, b) => a[0] - b[0])) {
    if (gapBottom <= at || gapTop >= to) continue;
    pieces.push([at, gapTop]);
    at = gapBottom;
  }
  pieces.push([at, to]);
  return pieces.filter(([pieceTop, pieceBottom]) => pieceBottom > pieceTop);
}

function ChangeBarsImpl({
  segments,
  offsets,
  lineHeight,
  top,
  bottom,
  labelOf,
  focused = null,
}: Props) {
  const bars: ReactElement[] = [];
  const colourOf = (change: string) => laneColour(labelOf(change));
  const faded = (changes: readonly string[]) =>
    focused !== null && !changes.includes(focused);
  const className = (base: string, changes: readonly string[]) =>
    faded(changes) ? `${base} ${styles.changeBarFaded}` : base;

  const overflow: { change: string; from: number; to: number }[] = [];
  const overflowGaps: [number, number][] = [];
  let overflowAt: { slot: number; layout: ChangeBarSegment['layout'] } | null = null;

  for (const segment of segments) {
    const { change, slot, layout, startBadge, endBadge, firstRow } = segment;
    const { from, to, gaps } = extentOf(segment, offsets, lineHeight);
    if (to <= from || to < top || from > bottom) continue;

    if (segment.overflow) {
      overflow.push({ change, from, to });
      overflowGaps.push(...gaps);
      overflowAt = { slot, layout };
      continue;
    }

    const left = slotLeft(slot, layout);
    const colour = { '--note-lane': colourOf(change) } as CSSProperties;
    const key = `${change}:${firstRow}`;

    // Where a hook takes over, the straight run stops a pixel inside it, so
    // the two never show a seam.
    let straightFrom = from;
    let straightTo = to;
    const strokes: CSSProperties[] = [];

    const startSide = startBadge === null ? null : hookSide(slot, startBadge, layout);
    if (startBadge !== null && startSide !== null) {
      strokes.push(...hookStrokes(slot, startBadge, startSide, 'bottom', from, layout));
      straightFrom = from - 1 + HOOK_HEIGHT - 1;
    }

    const endSide = endBadge === null ? null : hookSide(slot, endBadge, layout);
    if (endBadge !== null && endSide !== null) {
      strokes.push(...hookStrokes(slot, endBadge, endSide, 'top', to, layout));
      straightTo = to + 1 - HOOK_HEIGHT + 1;
    }

    strokes.forEach((style, index) => {
      bars.push(
        <div
          key={`${key}:hook${index}`}
          className={className(styles.changeBarHook, [change])}
          style={{ ...colour, ...style }}
        />,
      );
    });

    // The straight run, broken wherever another change's badge sits in its
    // way, so the bar reads as passing behind the letter rather than over it.
    for (const [pieceTop, pieceBottom] of piecesOf(straightFrom, straightTo, gaps)) {
      bars.push(
        <div
          key={`${key}:${pieceTop}`}
          className={className(styles.changeBar, [change])}
          style={{ ...colour, left, top: pieceTop, height: pieceBottom - pieceTop }}
        />,
      );
    }
  }

  // The overflow: one bar in the last slot, striped in the colours of the
  // changes it stands for, cut wherever that set changes.
  if (overflowAt !== null) {
    const left = slotLeft(overflowAt.slot, overflowAt.layout);

    for (const piece of overflowPieces(overflow)) {
      const background = stripes(piece.changes.map(colourOf));

      for (const [pieceTop, pieceBottom] of piecesOf(
        piece.from,
        piece.to,
        overflowGaps,
      )) {
        bars.push(
          <div
            key={`overflow:${pieceTop}`}
            className={className(
              `${styles.changeBar} ${styles.changeBarOverflow}`,
              piece.changes,
            )}
            style={{ left, top: pieceTop, height: pieceBottom - pieceTop, background }}
            data-changes={piece.changes.join(' ')}
          />,
        );
      }
    }
  }

  return (
    <div className={styles.changeBars} aria-hidden="true" data-testid="change-bars">
      {bars}
    </div>
  );
}

export const ChangeBars = memo(ChangeBarsImpl);
