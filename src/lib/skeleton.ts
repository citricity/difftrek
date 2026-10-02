/**
 * The shape of a loading file's skeleton: how far each line is indented and
 * how far it runs.
 *
 * Varied, because a stack of equal bars reads as a progress meter rather than
 * as code on its way. Derived from a seed — the file's id — rather than drawn
 * at random, because the virtualiser mounts and unmounts the row as the reader
 * scrolls, and a skeleton that re-rolled its lines each time would flicker.
 */

export interface SkeletonLine {
  /** Leading indentation, in characters. */
  indent: number;
  /** Length of the line, as a percentage of the code area. */
  width: number;
}

/** Deepest indentation a skeleton wanders to, in levels. */
const MAX_LEVEL = 3;
const CHARS_PER_LEVEL = 2;
const MIN_WIDTH = 20;
const MAX_WIDTH = 65;

/** FNV-1a: small, and spreads similar paths far apart. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

export function skeletonLines(seed: string, count: number): SkeletonLine[] {
  let state = hash(seed);
  // A linear congruential generator; nothing here needs better than that.
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };

  const lines: SkeletonLine[] = [];
  let level = 0;

  for (let index = 0; index < count; index += 1) {
    // Indentation drifts a level at a time, the way code does.
    const drift = next();
    if (drift < 0.25 && level > 0) level -= 1;
    else if (drift > 0.75 && level < MAX_LEVEL) level += 1;

    lines.push({
      indent: level * CHARS_PER_LEVEL,
      width: MIN_WIDTH + Math.round(next() * (MAX_WIDTH - MIN_WIDTH)),
    });
  }

  return lines;
}
