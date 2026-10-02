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
/** How tall the curve is where a bar hooks across to its badge. */
const HOOK_HEIGHT = 6;

/*
 * The last slot ends at FIRST_SLOT + (MAX_BAR_SLOTS - 1) * SLOT_PITCH +
 * BAR_WIDTH = 36px, which is `--change-bars-width` in tokens.css: the expander
 * keeps its buttons past it.
 */

function slotLeft(slot: number): number {
  return FIRST_SLOT + slot * SLOT_PITCH;
}

function badgeCentre(index: number): number {
  return NOTES_PADDING + index * (BADGE_SIZE + BADGE_GAP) + BADGE_SIZE / 2;
}

/**
 * How far a hook has to reach sideways from the bar to its badge, or zero when
 * the badge already sits over the bar. A wider label (AA) makes its badge a
 * little wider than this assumes, which only moves the hook a pixel or two
 * off the badge's centre — still under it.
 */
function hookReach(slot: number, badge: number | null): number {
  if (badge === null) return 0;
  const barCentre = slotLeft(slot) + BAR_WIDTH / 2;
  const reach = badgeCentre(badge) - barCentre;
  return reach > BADGE_SIZE / 2 ? reach + BAR_WIDTH / 2 : 0;
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
    const topReach = hookReach(slot, startBadge);
    const bottomReach = hookReach(slot, endBadge);
    const straightFrom = topReach > 0 ? from + HOOK_HEIGHT : from;
    const straightTo = bottomReach > 0 ? to - HOOK_HEIGHT : to;
    const colour = { '--note-lane': laneColour(labelOf(change)) } as CSSProperties;
    const key = `${change}:${firstRow}`;

    if (topReach > 0) {
      bars.push(
        <div
          key={`${key}:top`}
          className={`${styles.changeBarHook} ${styles.changeBarHookTop}`}
          style={{ ...colour, left, top: from, width: topReach, height: HOOK_HEIGHT }}
        />,
      );
    }

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

    if (bottomReach > 0) {
      bars.push(
        <div
          key={`${key}:bottom`}
          className={`${styles.changeBarHook} ${styles.changeBarHookBottom}`}
          style={{
            ...colour,
            left,
            top: to - HOOK_HEIGHT,
            width: bottomReach,
            height: HOOK_HEIGHT,
          }}
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
