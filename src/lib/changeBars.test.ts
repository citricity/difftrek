import { describe, expect, it } from 'vitest';
import { buildChangeBars, CENTRED_SLOTS, EDGE_SLOTS } from './changeBars.ts';
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
        layout: 'centred',
        slot: 0,
        overflow: false,
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

  it('keeps a cluster of up to six centred', () => {
    const changes = Array.from({ length: CENTRED_SLOTS }, (_, index) => `c${index}`);
    const { bars } = document([{ id: 'a', lines: 3, changes }]);

    expect(bars.map((bar) => bar.layout)).toEqual(Array(CENTRED_SLOTS).fill('centred'));
    expect(bars.some((bar) => bar.overflow)).toBe(false);
  });

  it('moves a cluster of seven to the edge layout, with a bar each', () => {
    const changes = Array.from({ length: EDGE_SLOTS }, (_, index) => `c${index}`);
    const { bars } = document([{ id: 'a', lines: 3, changes }]);

    expect(new Set(bars.map((bar) => bar.layout))).toEqual(new Set(['edge']));
    expect(bars.map((bar) => bar.slot)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(bars.some((bar) => bar.overflow)).toBe(false);
  });

  it('puts every change past the sixth slot into the striped overflow', () => {
    const changes = Array.from({ length: EDGE_SLOTS + 2 }, (_, index) => `c${index}`);
    const { bars } = document([{ id: 'a', lines: 3, changes }]);

    // Nothing is dropped: the last slot stands for c6, c7 and c8.
    expect(bars).toHaveLength(changes.length);
    expect(bars.filter((bar) => bar.overflow).map((bar) => bar.change)).toEqual([
      'c6',
      'c7',
      'c8',
    ]);
    expect(new Set(bars.filter((bar) => bar.overflow).map((bar) => bar.slot))).toEqual(
      new Set([EDGE_SLOTS - 1]),
    );
  });

  it('lays out each cluster on its own, so a crowded hunk moves only its own bars', () => {
    const crowd = Array.from({ length: EDGE_SLOTS }, (_, index) => `c${index}`);
    const { bars } = document([
      { id: 'a', lines: 2, changes: ['x'] },
      { id: 'b', lines: 2, changes: crowd },
      { id: 'c', lines: 2, changes: ['y'] },
    ]);

    expect(bars.find((bar) => bar.change === 'x')?.layout).toBe('centred');
    expect(bars.find((bar) => bar.change === 'y')?.layout).toBe('centred');
    expect(bars.find((bar) => bar.change === 'c0')?.layout).toBe('edge');
  });

  it('keeps one layout along a cluster joined only through a neighbour', () => {
    // x overlaps the crowd at b, and y overlaps x at c but not the crowd:
    // all three are one cluster, so x does not shift sideways at c.
    const crowd = Array.from({ length: EDGE_SLOTS - 1 }, (_, index) => `c${index}`);
    const { bars } = document([
      { id: 'a', lines: 2, changes: ['x'] },
      { id: 'b', lines: 2, changes: ['x', ...crowd] },
      { id: 'c', lines: 2, changes: ['x', 'y'] },
    ]);

    expect(new Set(bars.map((bar) => bar.layout))).toEqual(new Set(['edge']));
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
