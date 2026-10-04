/** Small presentation helpers shared by the header and file rows. */

import type { MessageKey, Translate } from '../i18n/index.ts';
import type { ChangedFile, FileStatus } from '../types/index.ts';

const STATUS_LABEL: Record<FileStatus, MessageKey> = {
  modified: 'status.modified',
  added: 'status.added',
  deleted: 'status.deleted',
  renamed: 'status.renamed',
  copied: 'status.copied',
  typechanged: 'status.typechanged',
};

/**
 * Git's own letters, which stay the same in every language: they are what
 * `git status --short` prints, and the tooltip gives the word.
 */
const STATUS_LETTER: Record<FileStatus, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  typechanged: 'T',
};

export function statusLabel(t: Translate<MessageKey>, status: FileStatus): string {
  return t(STATUS_LABEL[status]);
}

export function statusLetter(status: FileStatus): string {
  return STATUS_LETTER[status];
}

/** Splits a path so the filename can be emphasised against its directory. */
export function splitPath(path: string): { directory: string; name: string } {
  const index = path.lastIndexOf('/');
  return index === -1
    ? { directory: '', name: path }
    : { directory: path.slice(0, index + 1), name: path.slice(index + 1) };
}

/** `old/name.ts → new/name.ts` for renames, plain path otherwise. */
export function displayPath(file: ChangedFile): string {
  return file.oldPath === null ? file.path : `${file.oldPath} → ${file.path}`;
}
