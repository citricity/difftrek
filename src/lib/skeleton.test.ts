import { describe, expect, it } from 'vitest';
import { skeletonLines } from './skeleton.ts';

describe('skeletonLines', () => {
  it('draws the same skeleton for the same file every time', () => {
    // The row is remounted as the reader scrolls; a new shape each time would
    // flicker.
    expect(skeletonLines('src/a.ts', 8)).toEqual(skeletonLines('src/a.ts', 8));
  });

  it('draws different files differently', () => {
    expect(skeletonLines('src/a.ts', 8)).not.toEqual(skeletonLines('src/b.ts', 8));
  });

  it('gives one line per row, each a plausible line of code', () => {
    const lines = skeletonLines('src/lib/rows.ts', 12);

    expect(lines).toHaveLength(12);
    for (const line of lines) {
      expect(line.width).toBeGreaterThanOrEqual(20);
      expect(line.width).toBeLessThanOrEqual(65);
      expect(line.indent).toBeGreaterThanOrEqual(0);
      expect(line.indent).toBeLessThanOrEqual(6);
    }
  });
});
