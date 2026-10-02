import { describe, expect, it } from 'vitest';
import { buildChangeBars, MAX_BAR_SLOTS } from './changeBars.ts';
import { buildNoteMarkers, MAX_BADGES } from './noteMarkers.ts';
import type { DocumentRow } from './rows.ts';
import type { ResolvedHunk } from '../types/index.ts';

/**
 * A document of hunks, each a header and `lines` code rows, with an expander
 * between consecutive hunks — the shape a bar has to cross.
 */
function document(spec: { id: string; lines: number; changes: string[] }[]) {
  const rows: DocumentRow[] = [];

  spec.forEach(({ id, lines }, index) => {
    if (index > 0) {
      rows.push({
        kind: 'expander',
        fileId: 'f',
        range: { start: 1, end: 2 },
        above: true,
        below: true,
      });
    }
    rows.push({ kind: 'hunk-header', fileId: 'f', hunkId: id });
    for (let line = 0; line < lines; line += 1) {
      rows.push({ kind: 'line', fileId: 'f', hunkId: id, lineIndex: line, rows: 1 });
    }
  });

  const hunks: Record<string, ResolvedHunk> = Object.fromEntries(
    spec.map(({ id, changes }) => [
      id,
      {
        hunkId: id,
        reasons: [],
        logicalChangeIds: changes,
        ambiguous: false,
        partial: false,
      },
    ]),
  );

  const markers = buildNoteMarkers(
    spec.map(({ id }) => id),
    hunks,
  );

  return { rows, bars: buildChangeBars(rows, markers, MAX_BADGES) };
}

describe('buildChangeBars', () => {
  it('joins the first line of a run to its last, across what lies between', () => {
    // Rows: @@a, a0, a1, expander, @@b, b0, b1, b2.
    const { bars } = document([
      { id: 'a', lines: 2, changes: ['x'] },
      { id: 'b', lines: 3, changes: ['x'] },
    ]);

    expect(bars).toEqual([
      {
        change: 'x',
        slot: 0,
        firstRow: 1,
        lastRow: 7,
        startBadge: 0,
        endBadge: 0,
        crossings: [],
      },
    ]);
  });

  it('draws a bar within one hunk, between its two badges', () => {
    const { bars } = document([{ id: 'a', lines: 4, changes: ['x'] }]);
    expect(bars).toMatchObject([{ firstRow: 1, lastRow: 4, slot: 0 }]);
  });

  it('draws nothing for a run one row long — the badge is all there is', () => {
    const { bars } = document([{ id: 'a', lines: 1, changes: ['x'] }]);
    expect(bars).toEqual([]);
  });

  it('breaks the bar where a re-opened change leaves off', () => {
    const { bars } = document([
      { id: 'a', lines: 2, changes: ['x'] },
      { id: 'b', lines: 2, changes: ['y'] },
      { id: 'c', lines: 2, changes: ['x'] },
    ]);

    expect(bars.filter((bar) => bar.change === 'x')).toHaveLength(2);
    // Neither run of x overlaps y, so all three keep to the edge.
    expect(bars.map((bar) => bar.slot)).toEqual([0, 0, 0]);
  });

  it('sets overlapping changes side by side, in the order of their badges', () => {
    const { bars } = document([
      { id: 'a', lines: 2, changes: ['x', 'y'] },
      { id: 'b', lines: 2, changes: ['y'] },
    ]);

    expect(bars).toMatchObject([
      { change: 'x', slot: 0, firstRow: 1, lastRow: 2, startBadge: 0, endBadge: 0 },
      { change: 'y', slot: 1, firstRow: 1, lastRow: 6, startBadge: 1, endBadge: 0 },
    ]);
  });

  it('frees a slot once its bar has ended', () => {
    const { bars } = document([
      { id: 'a', lines: 2, changes: ['x', 'y'] },
      { id: 'b', lines: 2, changes: ['y'] },
      { id: 'c', lines: 2, changes: ['y', 'z'] },
    ]);

    // x ends with a; z starts at c, where slot 0 is free again even though
    // y is still running in slot 1.
    expect(bars.find((bar) => bar.change === 'z')?.slot).toBe(0);
    expect(bars.find((bar) => bar.change === 'y')?.slot).toBe(1);
  });

  it('gives a bar no badge to hang from where the row overflows into +n', () => {
    const { bars } = document([{ id: 'a', lines: 2, changes: ['x', 'y', 'z'] }]);

    expect(bars.map((bar) => bar.startBadge)).toEqual([0, 1, null]);
  });

  it('leaves out bars past the last slot rather than squeezing them', () => {
    const changes = Array.from(
      { length: MAX_BAR_SLOTS + 2 },
      (_, index) => `c${index}`,
    );
    const { bars } = document([{ id: 'a', lines: 3, changes }]);

    expect(bars).toHaveLength(MAX_BAR_SLOTS);
  });

  it("lists the other changes' badges a bar passes, so it can step around them", () => {
    // Rows: @@a 0, a 1-2, expander 3, @@b 4, b 5-6, expander 7, @@c 8, c 9-10.
    const { bars } = document([
      { id: 'a', lines: 2, changes: ['x'] },
      { id: 'b', lines: 2, changes: ['x', 'y'] },
      { id: 'c', lines: 2, changes: ['x'] },
    ]);

    // y starts and ends inside x's run: one badge on each of b's rows.
    expect(bars.find((bar) => bar.change === 'x')?.crossings).toEqual([
      { row: 5, badges: 1 },
      { row: 6, badges: 1 },
    ]);
  });

  it('has nothing to draw for hunks no change covers', () => {
    const { bars } = document([{ id: 'a', lines: 3, changes: [] }]);
    expect(bars).toEqual([]);
  });
});
