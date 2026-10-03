/**
 * Where the change bars go across the notes column, in pixels.
 *
 * The badges are laid out by flexbox in DiffRows.module.css (`.notes`,
 * `.lane`, `.badge`) and the bars are placed by arithmetic here, so the
 * constants below have to change together with those rules.
 */

import type { CSSProperties } from 'react';
import type { BarLayout } from '../../lib/changeBars.ts';

/** `.notes`'s left padding: where the first badge starts. */
export const NOTES_PADDING = 2;
/** `.badge`'s size, and the `.lane` gap between two badges. */
export const BADGE_SIZE = 15;
export const BADGE_GAP = 2;
/** A bar's width, and how far apart side-by-side bars sit. */
export const BAR_WIDTH = 3;
export const SLOT_PITCH = 5;
/**
 * Where the first slot sits: centred under the first badge, or down its left
 * edge, which makes room for one more slot in the same width.
 */
const FIRST_SLOT: Record<BarLayout, number> = {
  centred: NOTES_PADDING + (BADGE_SIZE - BAR_WIDTH) / 2,
  edge: NOTES_PADDING,
};
/** How tall the curve is where a bar sweeps across to its badge. */
export const HOOK_HEIGHT = 8;
/**
 * The radius the stroke takes round the badge's far corner, a little more than
 * the badge's own 3px. The corner is drawn 3px on the near edge and 1px down
 * the side, exactly over the badge's outline, so the curve tapers from the
 * bar's weight into the badge's.
 */
const CORNER = 5;

/*
 * The last slot ends at 36px in both layouts — centred: 8 + 5 × 5 + 3; edge:
 * 2 + 6 × 5 + 3 = 35 — which is `--change-bars-width` in tokens.css: the
 * expander keeps its buttons past it.
 */

export function slotLeft(slot: number, layout: BarLayout = 'centred'): number {
  return FIRST_SLOT[layout] + slot * SLOT_PITCH;
}

export function badgeLeft(index: number): number {
  return NOTES_PADDING + index * (BADGE_SIZE + BADGE_GAP);
}

/**
 * Which side of its bar a badge sits, when the bar has to sweep across to
 * reach it; null when the badge is over the bar already.
 *
 * Both happen. A badge right of its slot is the second of two changes meeting
 * on a row. A badge left of its slot is a change whose nearer slots were taken
 * by runs still open when it started — its letter is first on the row, but its
 * bar is third from the edge.
 *
 * A wider label (AA) makes a badge a little wider than this assumes, which
 * moves the sweep's end a pixel or two; it still lands on the badge.
 */
export function hookSide(
  slot: number,
  badge: number,
  layout: BarLayout = 'centred',
): 'left' | 'right' | null {
  const bar = slotLeft(slot, layout);
  const badgeStart = badgeLeft(badge);
  if (badgeStart >= bar + BAR_WIDTH) return 'right';
  if (badgeStart + BADGE_SIZE <= bar) return 'left';
  return null;
}

/**
 * The two strokes that carry a bar onto a badge beside it: a curve from the
 * bar running along the badge's near edge, then a corner wrapping the badge's
 * far corner into its outline, so the bar and the badge read as one line.
 *
 * `edge` is the badge's edge the bar arrives at — its top for the end of a
 * run, its bottom for the start — and `y` is where that edge is. `side` is
 * where the badge sits, from `hookSide`.
 */
export function hookStrokes(
  slot: number,
  badge: number,
  side: 'left' | 'right',
  edge: 'top' | 'bottom',
  y: number,
  layout: BarLayout = 'centred',
): CSSProperties[] {
  const bar = slotLeft(slot, layout);
  const near = badgeLeft(badge);
  const far = near + BADGE_SIZE;
  const top = edge === 'top';
  const right = side === 'right';

  // The edge the strokes run along, and the corner each one turns.
  const along = top ? 'Bottom' : 'Top';
  const sweepTop = top ? y + 1 - HOOK_HEIGHT : y - 1;
  const cornerTop = top ? y - 2 : y - CORNER;
  const vertical = right ? 'Left' : 'Right';
  const away = right ? 'Right' : 'Left';
  const edgeWord = top ? 'Top' : 'Bottom';

  const sweep: CSSProperties = right
    ? { left: bar, width: far - CORNER - bar }
    : { left: near + CORNER, width: bar + BAR_WIDTH - (near + CORNER) };

  const corner: CSSProperties = right
    ? { left: far - CORNER, width: CORNER }
    : { left: near, width: CORNER };

  return [
    {
      ...sweep,
      top: sweepTop,
      height: HOOK_HEIGHT,
      [`border${vertical}Width`]: BAR_WIDTH,
      [`border${along}Width`]: BAR_WIDTH,
      [`border${along}${vertical}Radius`]: HOOK_HEIGHT,
    },
    {
      ...corner,
      top: cornerTop,
      height: CORNER + 2,
      [`border${away}Width`]: 1,
      [`border${edgeWord}Width`]: BAR_WIDTH,
      [`border${edgeWord}${away}Radius`]: CORNER,
    },
  ];
}

/** Whether a bar in this slot runs through any of a row's first `badges` badges. */
export function crossesBadge(
  slot: number,
  badges: number,
  layout: BarLayout = 'centred',
): boolean {
  const left = slotLeft(slot, layout);
  for (let index = 0; index < badges; index += 1) {
    const start = badgeLeft(index);
    if (left < start + BADGE_SIZE && left + BAR_WIDTH > start) return true;
  }
  return false;
}

/** One stretch of the overflow bar, and the changes it stands for there. */
export interface OverflowPiece {
  from: number;
  to: number;
  changes: string[];
}

/**
 * The overflow bar, cut wherever the set of changes it stands for changes, so
 * each piece is striped in exactly the colours of the changes hidden beside
 * it. `spans` are the hidden bars' own vertical extents, in pixels; where none
 * is hidden there is no piece.
 */
export function overflowPieces(
  spans: readonly { change: string; from: number; to: number }[],
): OverflowPiece[] {
  const cuts = [...new Set(spans.flatMap(({ from, to }) => [from, to]))].sort(
    (left, right) => left - right,
  );

  const pieces: OverflowPiece[] = [];
  for (let index = 0; index + 1 < cuts.length; index += 1) {
    const from = cuts[index];
    const to = cuts[index + 1];
    const changes = spans
      .filter((span) => span.from <= from && span.to >= to)
      .map((span) => span.change);
    if (changes.length === 0) continue;

    const previous = pieces[pieces.length - 1];
    if (
      previous !== undefined &&
      previous.to === from &&
      previous.changes.join('\0') === changes.join('\0')
    ) {
      previous.to = to;
    } else {
      pieces.push({ from, to, changes });
    }
  }
  return pieces;
}

/**
 * The stripes for one overflow piece: each change's colour in turn, 4px at a
 * time — long enough to read as a colour, short enough that a few changes
 * all show within a row or two.
 */
export function stripes(colours: readonly string[]): string {
  const stripe = 4;
  const stops = colours
    .map((colour, index) => `${colour} ${index * stripe}px ${(index + 1) * stripe}px`)
    .join(', ');
  return `repeating-linear-gradient(to bottom, ${stops})`;
}
