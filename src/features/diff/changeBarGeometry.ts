/**
 * Where the change bars go across the notes column, in pixels.
 *
 * The badges are laid out by flexbox in DiffRows.module.css (`.notes`,
 * `.lane`, `.badge`) and the bars are placed by arithmetic here, so the
 * constants below have to change together with those rules.
 */

import type { CSSProperties } from 'react';

/** `.notes`'s left padding: where the first badge starts. */
export const NOTES_PADDING = 2;
/** `.badge`'s size, and the `.lane` gap between two badges. */
export const BADGE_SIZE = 15;
export const BADGE_GAP = 2;
/** A bar's width, and how far apart side-by-side bars sit. */
export const BAR_WIDTH = 3;
export const SLOT_PITCH = 5;
/** The first slot, centred under the first badge. */
const FIRST_SLOT = NOTES_PADDING + (BADGE_SIZE - BAR_WIDTH) / 2;
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
 * The last slot ends at FIRST_SLOT + (MAX_BAR_SLOTS - 1) * SLOT_PITCH +
 * BAR_WIDTH = 36px, which is `--change-bars-width` in tokens.css: the expander
 * keeps its buttons past it.
 */

export function slotLeft(slot: number): number {
  return FIRST_SLOT + slot * SLOT_PITCH;
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
export function hookSide(slot: number, badge: number): 'left' | 'right' | null {
  const bar = slotLeft(slot);
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
): CSSProperties[] {
  const bar = slotLeft(slot);
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
export function crossesBadge(slot: number, badges: number): boolean {
  const left = slotLeft(slot);
  for (let index = 0; index < badges; index += 1) {
    const start = badgeLeft(index);
    if (left < start + BADGE_SIZE && left + BAR_WIDTH > start) return true;
  }
  return false;
}
