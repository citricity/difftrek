import { describe, expect, it } from 'vitest';
import {
  REPOSITORY_WORDING,
  absentLabel,
  sideName,
  statusTitle,
  wordingOf,
} from './wording.ts';
import type { Wording } from './wording.ts';

const FOLDERS: Wording = {
  oneSided: 'missing',
  sideNames: { original: 'A', working: 'B' },
};

describe('wording', () => {
  it('speaks of history in a repository', () => {
    expect(sideName(REPOSITORY_WORDING, 'original')).toBe('Before');
    expect(absentLabel(REPOSITORY_WORDING, 'original')).toBe('Added');
    expect(absentLabel(REPOSITORY_WORDING, 'working')).toBe('Deleted');
    expect(statusTitle(REPOSITORY_WORDING, 'deleted')).toBe('Deleted');
  });

  it('speaks of presence, and of A and B, between two folders', () => {
    expect(sideName(FOLDERS, 'working')).toBe('B');
    expect(absentLabel(FOLDERS, 'original')).toBe('Missing');
    expect(absentLabel(FOLDERS, 'working')).toBe('Missing');
    expect(statusTitle(FOLDERS, 'added')).toBe('Missing from A');
    expect(statusTitle(FOLDERS, 'deleted')).toBe('Missing from B');
    expect(statusTitle(FOLDERS, 'modified')).toBe('Modified');
  });

  it('uses the repository wording until the source has said otherwise', () => {
    expect(wordingOf(null)).toBe(REPOSITORY_WORDING);
  });
});
