import { describe, expect, it } from 'vitest';
import { entryPointOf, followNote } from './openNote.ts';
import type { NoteCursor, NoteDialog } from './openNote.ts';
import type { ResolvedHunk } from '../types/index.ts';

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

describe('entryPointOf', () => {
  const hunk = (id: string, changes: string[]): ResolvedHunk => ({
    hunkId: id,
    reasons: [],
    logicalChangeIds: changes,
    ambiguous: false,
    partial: false,
  });

  const order = ['h0', 'h1', 'h2', 'h3'];
  const hunks = {
    h0: hunk('h0', ['0']),
    h1: hunk('h1', ['0', '1']),
    h2: hunk('h2', ['2']),
    h3: hunk('h3', ['1']),
  };

  it('takes the reader to the change they cannot see', () => {
    // On h0, which is change 0 only: picking 1 goes to where 1 starts.
    expect(entryPointOf(order, hunks, '1', 'h0')).toBe('h1');
  });

  it('stays put when the change already covers the hunk in view', () => {
    // h1 serves both intents; picking either only says which is being read.
    expect(entryPointOf(order, hunks, '0', 'h1')).toBeNull();
    expect(entryPointOf(order, hunks, '1', 'h1')).toBeNull();
  });

  it('takes the reader to the start from nowhere at all', () => {
    expect(entryPointOf(order, hunks, '2', null)).toBe('h2');
  });

  it('has nowhere to go for a change with no hunks left', () => {
    expect(entryPointOf(order, hunks, 'gone', 'h0')).toBeNull();
  });
});
