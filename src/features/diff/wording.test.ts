import { describe, expect, it } from 'vitest';
import { BASE_LOCALE, CORE_CATALOGUES, createTranslator } from '../../i18n/index.ts';
import type { MessageKey } from '../../i18n/index.ts';
import {
  REPOSITORY_WORDING,
  absentLabel,
  sideName,
  statusTitle,
  wordingOf,
} from './wording.ts';
import type { Wording } from './wording.ts';

const t = createTranslator<MessageKey>(BASE_LOCALE, CORE_CATALOGUES);
const de = createTranslator<MessageKey>('de', CORE_CATALOGUES);

const FOLDERS: Wording = {
  oneSided: 'missing',
  sideNames: { original: 'A', working: 'B' },
};

describe('wording', () => {
  it('speaks of history in a repository', () => {
    expect(sideName(t, REPOSITORY_WORDING, 'original')).toBe('Before');
    expect(absentLabel(t, REPOSITORY_WORDING, 'original')).toBe('Added');
    expect(absentLabel(t, REPOSITORY_WORDING, 'working')).toBe('Deleted');
    expect(statusTitle(t, REPOSITORY_WORDING, 'deleted')).toBe('Deleted');
  });

  it('speaks of presence, and of A and B, between two folders', () => {
    expect(sideName(t, FOLDERS, 'working')).toBe('B');
    expect(absentLabel(t, FOLDERS, 'original')).toBe('Missing');
    expect(absentLabel(t, FOLDERS, 'working')).toBe('Missing');
    expect(statusTitle(t, FOLDERS, 'added')).toBe('Missing from A');
    expect(statusTitle(t, FOLDERS, 'deleted')).toBe('Missing from B');
    expect(statusTitle(t, FOLDERS, 'modified')).toBe('Modified');
  });

  it("names a repository's sides in the interface's language", () => {
    expect(sideName(t, REPOSITORY_WORDING, 'working')).toBe('After');
    expect(sideName(de, REPOSITORY_WORDING, 'original')).toBe('Vorher');
    // A source's own names are its own, whatever the language.
    expect(sideName(de, FOLDERS, 'original')).toBe('A');
  });

  it('uses the repository wording until the source has said otherwise', () => {
    expect(wordingOf(null)).toBe(REPOSITORY_WORDING);
  });
});
