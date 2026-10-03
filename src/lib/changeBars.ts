/**
 * The colour bars that run down the gutter beside each logical change.
 *
 * Badges mark where a change's run of hunks starts and stops; between them the
 * reader had to remember which letter they were inside, across `@@` rows and
 * hidden-line expanders and sometimes a screen or two of code. A bar in the
 * change's lane colour carries the badge down the page, so the extent of an
 * intent can be read at a glance — and where two intents overlap, two bars
 * side by side say so without opening anything.
 *
 * Pure geometry over the row model, so it is exact for the same reason the
 * scroll model is: every row's offset is known without measuring anything.
 */

import type { HunkMarkers } from './noteMarkers.ts';
import { orderBadges } from './noteMarkers.ts';
import type { DocumentRow } from './rows.ts';

/**
 * How a cluster of overlapping bars sits in the notes column.
 *
 * - `centred`: the first bar under the middle of its badge, the rest beside
 *   it. Holds `CENTRED_SLOTS`, which is every cluster in practice.
 * - `edge`: the first bar down the badge's left edge, which frees one more
 *   slot in the same width. Used only by a cluster that needs it.
 */
export type BarLayout = 'centred' | 'edge';

/** Bars side by side in the centred layout. */
export const CENTRED_SLOTS = 6;
/**
 * Slots in the edge layout. When a cluster needs more, the last one becomes
 * the overflow: one bar striped in the colours of every change it stands for.
 */
export const EDGE_SLOTS = 7;

export interface ChangeBarSegment {
  /** The logical change this bar belongs to. */
  change: string;
  /** The layout of the cluster this bar belongs to. */
  layout: BarLayout;
  /**
   * Which of the side-by-side positions it takes, 0 nearest the edge. Two bars
   * that share a row never share a slot, except overflow bars, which all take
   * the last slot and are drawn there together as stripes.
   */
  slot: number;
  /** Past the last slot: drawn as part of the striped overflow bar. */
  overflow: boolean;
  /** Index of the run's first row, and of its last. */
  firstRow: number;
  lastRow: number;
  /**
   * Where the change's badge sits on the first row, counting from the left,
   * or null where the row shows no badge for it — the `+n` overflow, or a run
   * that only continues here from an earlier file.
   */
  startBadge: number | null;
  /** The same for the hollow badge on the last row. */
  endBadge: number | null;
  /**
   * Other badges the bar passes: the row, and how many badges it shows. The
   * bar is drawn above the rows, so it has to step around these or it would
   * cover another change's letter. The bar's own end rows are included only
   * where it has no badge there, so it can start or stop clear of the others.
   */
  crossings: { row: number; badges: number }[];
}

/** Which hunk a row draws lines of, or null for rows that are not code. */
function hunkOfRow(row: DocumentRow): string | null {
  return row.kind === 'line' || row.kind === 'split-line' ? row.hunkId : null;
}

/** Where a change's badge lands in a row's badges, or null if it is not shown. */
function badgeIndex(
  starts: readonly string[],
  ends: readonly string[],
  change: string,
  limit: number,
): number | null {
  const at = orderBadges(starts, ends).findIndex((badge) => badge.change === change);
  return at === -1 || at >= limit ? null : at;
}

/**
 * Every bar in the document, in order of their first row.
 *
 * A bar runs from the first code row of a run's first hunk to the last code row
 * of its last hunk, which is exactly where its two badges sit, and passes over
 * whatever lies between: `@@` rows, expanders, expanded context. Runs are the
 * ones `buildNoteMarkers` found, so the bar and the badges cannot disagree
 * about where a change starts or stops.
 *
 * Bars that overlap, directly or through one another, form a cluster, and a
 * cluster keeps one layout for its whole length: deciding row by row would
 * move a bar sideways halfway down the page when a neighbour arrived. Within
 * a cluster, slots are handed out greedily, lowest free first, which keeps a
 * lone change against the edge and gives the first of two changes starting
 * together the nearer slot — the order their badges are drawn in. A cluster
 * that fits `CENTRED_SLOTS` is centred; one that does not moves to the edge
 * layout, and past `EDGE_SLOTS` its remaining bars share the last slot as
 * overflow, so no change disappears without a trace.
 */
export function buildChangeBars(
  rows: readonly DocumentRow[],
  markers: ReadonlyMap<string, HunkMarkers>,
  badgeLimit: number,
): ChangeBarSegment[] {
  const firstRow = new Map<string, number>();
  const lastRow = new Map<string, number>();
  const order: string[] = [];

  rows.forEach((row, index) => {
    const hunkId = hunkOfRow(row);
    if (hunkId === null) return;
    if (!firstRow.has(hunkId)) {
      firstRow.set(hunkId, index);
      order.push(hunkId);
    }
    lastRow.set(hunkId, index);
  });

  // How many badges each row shows, where it shows any.
  const badgeRows = new Map<number, number>();
  for (const hunkId of order) {
    const marks = markers.get(hunkId);
    if (marks === undefined) continue;
    const first = firstRow.get(hunkId) ?? 0;
    const last = lastRow.get(hunkId) ?? 0;
    const oneRow = first === last;
    const count = (starts: readonly string[], ends: readonly string[]) =>
      Math.min(orderBadges(starts, ends).length, badgeLimit);

    const atFirst = count(marks.starts, oneRow ? marks.ends : []);
    if (atFirst > 0) badgeRows.set(first, atFirst);
    if (!oneRow) {
      const atLast = count([], marks.ends);
      if (atLast > 0) badgeRows.set(last, atLast);
    }
  }

  // In row order, so each bar can find the badges it passes by bisection
  // rather than by scanning every badge in the document.
  const badgeRowList = [...badgeRows]
    .map(([row, badges]) => ({ row, badges }))
    .sort((left, right) => left.row - right.row);

  // Walk the hunks in document order, opening a run at each start marker and
  // closing it at the matching end.
  const open = new Map<string, string>();
  const runs: { change: string; from: string; to: string }[] = [];

  for (const hunkId of order) {
    const marks = markers.get(hunkId);
    if (marks === undefined) continue;

    for (const change of marks.starts) open.set(change, hunkId);
    for (const change of marks.ends) {
      const from = open.get(change);
      if (from === undefined) continue;
      open.delete(change);
      runs.push({ change, from, to: hunkId });
    }
  }

  const segments = runs
    .map(({ change, from, to }): ChangeBarSegment => {
      const first = firstRow.get(from) ?? 0;
      const last = lastRow.get(to) ?? 0;
      const fromMarks = markers.get(from);
      const toMarks = markers.get(to);

      // The badges as the document draws them: starts on a hunk's first row,
      // ends on its last, both together on a hunk one row long.
      const startOneRow = firstRow.get(from) === lastRow.get(from);
      const endOneRow = firstRow.get(to) === lastRow.get(to);

      const startBadge = badgeIndex(
        fromMarks?.starts ?? [],
        startOneRow ? (fromMarks?.ends ?? []) : [],
        change,
        badgeLimit,
      );
      const endBadge = badgeIndex(
        endOneRow ? (toMarks?.starts ?? []) : [],
        toMarks?.ends ?? [],
        change,
        badgeLimit,
      );

      // The bar's own end rows only count where it has no badge there: with
      // one, it stops at that badge's edge and never reaches the others; with
      // none, it has to start or stop clear of whatever badges the row shows.
      const crossings = badgeRowsBetween(
        badgeRowList,
        startBadge === null ? first : first + 1,
        endBadge === null ? last : last - 1,
      );

      return {
        change,
        layout: 'centred',
        slot: 0,
        overflow: false,
        firstRow: first,
        lastRow: last,
        startBadge,
        endBadge,
        crossings,
      };
    })
    // A run one row long is a badge and nothing else; there is no bar to draw.
    .filter((segment) => segment.lastRow > segment.firstRow)
    // Changes starting on one row take slots in the order of their badges.
    .sort(
      (left, right) =>
        left.firstRow - right.firstRow ||
        (left.startBadge ?? Infinity) - (right.startBadge ?? Infinity),
    );

  const placed: ChangeBarSegment[] = [];
  let cluster: ChangeBarSegment[] = [];
  let clusterEnd = -1;

  const settle = () => {
    // The last row each slot is busy until.
    const busyUntil: number[] = [];
    const slots = cluster.map((segment) => {
      let slot = busyUntil.findIndex((until) => until < segment.firstRow);
      if (slot === -1) slot = busyUntil.length;
      busyUntil[slot] = segment.lastRow;
      return slot;
    });

    const peak = busyUntil.length;
    const layout: BarLayout = peak <= CENTRED_SLOTS ? 'centred' : 'edge';
    const last = EDGE_SLOTS - 1;
    const overflowing = peak > EDGE_SLOTS;

    cluster.forEach((segment, index) => {
      const overflow = overflowing && slots[index] >= last;
      placed.push({
        ...segment,
        layout,
        slot: overflow ? last : slots[index],
        overflow,
      });
    });
    cluster = [];
  };

  for (const segment of segments) {
    if (segment.firstRow > clusterEnd) settle();
    cluster.push(segment);
    clusterEnd = Math.max(clusterEnd, segment.lastRow);
  }
  settle();

  return placed;
}

/**
 * The badge rows from `from` to `to` inclusive, out of a list sorted by row.
 *
 * Bisection, because a long document has a bar and a pair of badges for every
 * change, and checking every badge for every bar would be quadratic in them.
 */
function badgeRowsBetween(
  rows: readonly { row: number; badges: number }[],
  from: number,
  to: number,
): { row: number; badges: number }[] {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (rows[middle].row < from) low = middle + 1;
    else high = middle;
  }

  const found: { row: number; badges: number }[] = [];
  for (let index = low; index < rows.length && rows[index].row <= to; index += 1) {
    found.push(rows[index]);
  }
  return found;
}
