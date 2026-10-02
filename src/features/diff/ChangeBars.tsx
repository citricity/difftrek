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
 * instead of running under it, and hooks across to a badge that is not over
 * its own slot. Pointer events pass straight through to the badges and code.
 */

import { memo } from 'react';
import type { CSSProperties } from 'react';
import type { ChangeBarSegment } from '../../lib/changeBars.ts';
import { laneColour } from '../../lib/noteMarkers.ts';
import styles from './DiffRows.module.css';

/*
 * Geometry, in pixels. These match `.notes`, `.lane` and `.badge` in
 * DiffRows.module.css; the badges are laid out by flexbox there, and placed
 * by arithmetic here, so both have to change together.
 */
/** `.notes`'s left padding: where the first badge starts. */
const NOTES_PADDING = 2;
/** `.badge`'s size, and the `.lane` gap between two badges. */
const BADGE_SIZE = 15;
const BADGE_GAP = 2;
/** A bar's width, and how far apart side-by-side bars sit. */
const BAR_WIDTH = 3;
const SLOT_PITCH = 5;
/** The first slot, centred under the first badge. */
const FIRST_SLOT = NOTES_PADDING + (BADGE_SIZE - BAR_WIDTH) / 2;
/** How tall the curve is where a bar sweeps across to its badge. */
const HOOK_HEIGHT = 8;
/**
 * The radius the stroke takes round the badge's far corner, a little more than
 * the badge's own 3px. The corner is drawn 3px on the near edge and 1px down
 * the side, exactly over the badge's outline, so the curve tapers from the
 * bar's weight into the badge's.
 */
const CORNER = 5;

/*
 * The last slot ends at FIRST_SLOT + (MAX_BAR_SLOTS - 1) * SLOT_PITCH +
 * BAR_WIDTH = 36px, which is `--change-bars-width` in tokens.css: the expander
 * keeps its buttons past it.
 */

function slotLeft(slot: number): number {
  return FIRST_SLOT + slot * SLOT_PITCH;
}

function badgeLeft(index: number): number {
  return NOTES_PADDING + index * (BADGE_SIZE + BADGE_GAP);
}

/**
 * Whether a bar has to sweep across to reach its badge: the badge sits wholly
 * beside the bar's slot rather than over it. A wider label (AA) makes a badge
 * a little wider than this assumes, which moves the sweep's end a pixel or two;
 * it still lands on the badge.
 */
function needsHook(slot: number, badge: number | null): badge is number {
  return badge !== null && badgeLeft(badge) >= slotLeft(slot) + BAR_WIDTH;
}

/**
 * The two strokes that carry a bar onto a badge beside it: a curve from the
 * bar running along the badge's near edge, then a corner wrapping its far
 * corner into the badge's outline, so the bar and the badge read as one line.
 *
 * `edge` is the badge's edge the bar arrives at — its top for the end of a
 * run, its bottom for the start — and `y` is where that edge is.
 */
function hookStrokes(
  barLeft: number,
  badge: number,
  edge: 'top' | 'bottom',
  y: number,
): CSSProperties[] {
  const right = badgeLeft(badge) + BADGE_SIZE;
  const top = edge === 'top';

  return [
    {
      left: barLeft,
      top: top ? y + 1 - HOOK_HEIGHT : y - 1,
      width: right - CORNER - barLeft,
      height: HOOK_HEIGHT,
      borderLeftWidth: BAR_WIDTH,
      [top ? 'borderBottomWidth' : 'borderTopWidth']: BAR_WIDTH,
      [top ? 'borderBottomLeftRadius' : 'borderTopLeftRadius']: HOOK_HEIGHT,
    },
    {
      left: right - CORNER,
      top: top ? y - 2 : y - CORNER,
      width: CORNER,
      height: CORNER + 2,
      borderRightWidth: 1,
      [top ? 'borderTopWidth' : 'borderBottomWidth']: BAR_WIDTH,
      [top ? 'borderTopRightRadius' : 'borderBottomRightRadius']: CORNER,
    },
  ];
}

/** Whether a bar in this slot runs through any of a row's first `badges` badges. */
function crossesBadge(slot: number, badges: number): boolean {
  const left = slotLeft(slot);
  for (let index = 0; index < badges; index += 1) {
    const badgeLeft = NOTES_PADDING + index * (BADGE_SIZE + BADGE_GAP);
    if (left < badgeLeft + BADGE_SIZE && left + BAR_WIDTH > badgeLeft) return true;
  }
  return false;
}

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

    if (needsHook(slot, startBadge)) {
      strokes.push(...hookStrokes(left, startBadge, 'bottom', from));
      straightFrom = from - 1 + HOOK_HEIGHT - 1;
    }

    if (needsHook(slot, endBadge)) {
      strokes.push(...hookStrokes(left, endBadge, 'top', to));
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
