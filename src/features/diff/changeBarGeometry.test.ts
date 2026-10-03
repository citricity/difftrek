import { describe, expect, it } from 'vitest';
import type React from 'react';
import {
  BAR_WIDTH,
  BADGE_SIZE,
  badgeLeft,
  crossesBadge,
  hookSide,
  hookStrokes,
  overflowPieces,
  slotLeft,
  stripes,
} from './changeBarGeometry.ts';

describe('hookSide', () => {
  it('needs no hook where the badge is over the bar', () => {
    expect(hookSide(0, 0)).toBeNull();
    // Slot 1 still lies under the first badge.
    expect(hookSide(1, 0)).toBeNull();
  });

  it('sweeps right to the second of two badges on a row', () => {
    expect(hookSide(1, 1)).toBe('right');
  });

  it('sweeps left to a first badge whose bar was pushed out by open runs', () => {
    // PR #21: two runs still open, so a change starting here takes slot 2 —
    // past the right edge of the row's first badge, which is its own.
    expect(slotLeft(2)).toBeGreaterThanOrEqual(badgeLeft(0) + BADGE_SIZE);
    expect(hookSide(2, 0)).toBe('left');
  });
});

describe('hookStrokes', () => {
  /** Left and right edges of a stroke box. */
  const span = (style: React.CSSProperties) => [
    Number(style.left),
    Number(style.left) + Number(style.width),
  ];

  it('runs from the bar to the far side of a badge on its right', () => {
    const [sweep, corner] = hookStrokes(1, 1, 'right', 'top', 100);
    const [sweepLeft] = span(sweep);
    const [, cornerRight] = span(corner);

    expect(sweepLeft).toBe(slotLeft(1));
    expect(cornerRight).toBe(badgeLeft(1) + BADGE_SIZE);
    expect(sweep.borderLeftWidth).toBe(BAR_WIDTH);
    expect(corner.borderRightWidth).toBe(1);
  });

  it('mirrors for a badge on its left', () => {
    const [sweep, corner] = hookStrokes(2, 0, 'left', 'bottom', 100);
    const [, sweepRight] = span(sweep);
    const [cornerLeft] = span(corner);

    expect(sweepRight).toBe(slotLeft(2) + BAR_WIDTH);
    expect(cornerLeft).toBe(badgeLeft(0));
    expect(sweep.borderRightWidth).toBe(BAR_WIDTH);
    expect(sweep.borderTopRightRadius).toBeGreaterThan(0);
    expect(corner.borderLeftWidth).toBe(1);
    expect(corner.borderBottomLeftRadius).toBeGreaterThan(0);
  });

  it('meets the two strokes end to end', () => {
    for (const side of ['left', 'right'] as const) {
      const [sweep, corner] = hookStrokes(
        side === 'left' ? 2 : 1,
        side === 'left' ? 0 : 1,
        side,
        'top',
        0,
      );
      const [sweepLeft, sweepRight] = span(sweep);
      const [cornerLeft, cornerRight] = span(corner);
      expect(side === 'right' ? sweepRight : sweepLeft).toBe(
        side === 'right' ? cornerLeft : cornerRight,
      );
    }
  });
});

describe('crossesBadge', () => {
  it('finds a badge in a bar’s way, and only within the badges shown', () => {
    expect(crossesBadge(0, 1)).toBe(true);
    expect(crossesBadge(2, 1)).toBe(false);
    expect(crossesBadge(2, 2)).toBe(true);
  });
});

describe('the edge layout', () => {
  it('puts the first bar down the first badge’s left edge', () => {
    expect(slotLeft(0, 'edge')).toBe(badgeLeft(0));
    // Running out of the badge's own outline, it needs no hook.
    expect(hookSide(0, 0, 'edge')).toBeNull();
  });

  it('fits a seventh slot in the width the centred layout uses for six', () => {
    expect(slotLeft(6, 'edge') + BAR_WIDTH).toBeLessThanOrEqual(
      slotLeft(5, 'centred') + BAR_WIDTH,
    );
  });
});

describe('overflowPieces', () => {
  it('cuts the bar wherever the set of hidden changes changes', () => {
    expect(
      overflowPieces([
        { change: 'g', from: 0, to: 100 },
        { change: 'h', from: 40, to: 60 },
      ]),
    ).toEqual([
      { from: 0, to: 40, changes: ['g'] },
      { from: 40, to: 60, changes: ['g', 'h'] },
      { from: 60, to: 100, changes: ['g'] },
    ]);
  });

  it('leaves a gap where nothing is hidden', () => {
    expect(
      overflowPieces([
        { change: 'g', from: 0, to: 10 },
        { change: 'h', from: 20, to: 30 },
      ]),
    ).toEqual([
      { from: 0, to: 10, changes: ['g'] },
      { from: 20, to: 30, changes: ['h'] },
    ]);
  });
});

describe('stripes', () => {
  it('gives each colour its turn, repeating', () => {
    expect(stripes(['red', 'blue'])).toBe(
      'repeating-linear-gradient(to bottom, red 0px 4px, blue 4px 8px)',
    );
  });
});
