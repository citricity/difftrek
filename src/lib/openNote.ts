/**
 * Which note is open, and what it should become as the reader moves.
 *
 * In the overlay a note is modal, so the reader cannot move while it is open
 * and the question never arises. Docked beside the diff it stays open while
 * they step and scroll, and a note about a hunk they have left behind is a
 * note about the wrong code — so it follows them.
 */

import { hunksOfChange } from './noteMarkers.ts';
import type { ResolvedHunk } from '../types/index.ts';

/** What the reader has open, if anything. */
export type NoteDialog =
  | { kind: 'hunk'; hunkId: string }
  | { kind: 'change'; changeId: string }
  | { kind: 'contents' }
  | null;

/** Where the reader is: the hunk under the cursor and the change it names. */
export interface NoteCursor {
  hunkId: string | null;
  changeId: string | null;
}

/**
 * The note to show once the cursor has moved from `previous` to `next`.
 *
 * Each kind follows only its own half of the cursor, and only when that half
 * moved. So a hunk note the reader opened by clicking a marker elsewhere
 * stays put until they step or scroll — a click is not a move — and picking a
 * change's letter, which changes the current change but not the hunk, does not
 * drag a hunk note back to the cursor. Landing nowhere (between files, while a
 * diff loads) keeps the last note rather than emptying the sidebar.
 *
 * The contents list already marks where the reader is, so it never changes.
 * Returns `note` itself when nothing should change.
 */
export function followNote(
  note: NoteDialog,
  previous: NoteCursor,
  next: NoteCursor,
): NoteDialog {
  if (note === null) return note;

  if (
    note.kind === 'hunk' &&
    next.hunkId !== null &&
    next.hunkId !== previous.hunkId &&
    next.hunkId !== note.hunkId
  ) {
    return { kind: 'hunk', hunkId: next.hunkId };
  }

  if (
    note.kind === 'change' &&
    next.changeId !== null &&
    next.changeId !== previous.changeId &&
    next.changeId !== note.changeId
  ) {
    return { kind: 'change', changeId: next.changeId };
  }

  return note;
}

/**
 * Where picking a logical change's letter in the gutter should land, or null
 * to stay put.
 *
 * Picking a letter on a hunk that already belongs to that change says "this is
 * the intent I am reading here" — a hunk can serve two — and moving the reader
 * for that would throw away the code they were looking at. Picking a change
 * that does not cover them is a different request: they have selected
 * something they cannot see, so they are taken to where it starts, as the
 * contents list takes them.
 */
export function entryPointOf(
  order: readonly string[],
  hunks: Readonly<Record<string, ResolvedHunk>>,
  changeId: string,
  currentHunk: string | null,
): string | null {
  const covers =
    currentHunk !== null &&
    (hunks[currentHunk]?.logicalChangeIds.includes(changeId) ?? false);
  if (covers) return null;

  return hunksOfChange(order, hunks, changeId)[0] ?? null;
}
