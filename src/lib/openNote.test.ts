import { describe, expect, it } from 'vitest';
import { followNote } from './openNote.ts';
import type { NoteCursor, NoteDialog } from './openNote.ts';

const at = (hunkId: string | null, changeId: string | null = null): NoteCursor => ({
  hunkId,
  changeId,
});

describe('followNote', () => {
  it('moves a hunk note to the hunk the reader stepped onto', () => {
    const note: NoteDialog = { kind: 'hunk', hunkId: 'a.ts:hunk:0' };
    expect(followNote(note, at('a.ts:hunk:0'), at('a.ts:hunk:1'))).toEqual({
      kind: 'hunk',
      hunkId: 'a.ts:hunk:1',
    });
  });

  it('moves a change note when the change in view changes', () => {
    const note: NoteDialog = { kind: 'change', changeId: '0' };
    expect(followNote(note, at('h0', '0'), at('h1', '1'))).toEqual({
      kind: 'change',
      changeId: '1',
    });
  });

  it('leaves a change note alone while the reader walks hunks of the same change', () => {
    const note: NoteDialog = { kind: 'change', changeId: '0' };
    expect(followNote(note, at('h0', '0'), at('h1', '0'))).toBe(note);
  });

  it('keeps the last note when the cursor lands nowhere', () => {
    const note: NoteDialog = { kind: 'hunk', hunkId: 'h0' };
    expect(followNote(note, at('h0', '0'), at(null, null))).toBe(note);
  });

  it('does not drag a hunk note back when only the change moved', () => {
    // The reader clicked a marker on h7 while the cursor sat on h0, then
    // picked another change's letter on h0: the hunk under the cursor is the
    // same, so the note they opened stays.
    const note: NoteDialog = { kind: 'hunk', hunkId: 'h7' };
    expect(followNote(note, at('h0', '0'), at('h0', '1'))).toBe(note);
  });

  it('never changes the contents list or an empty sidebar', () => {
    const contents: NoteDialog = { kind: 'contents' };
    expect(followNote(contents, at('h0', '0'), at('h1', '1'))).toBe(contents);
    expect(followNote(null, at('h0', '0'), at('h1', '1'))).toBeNull();
  });
});
