/**
 * How the document words the two sides of a comparison.
 *
 * A repository diff is history: its sides are Before and After, and a file on
 * only one of them was added or deleted. Two folders are not two versions of
 * anything: their sides are A and B, and a file on one side is simply missing
 * from the other — "Deleted" beside a folder that never had the file reads as
 * if something had been removed. The source says which applies
 * (`RepositoryInfo.oneSided` and `sideNames`), and the rows read it from here
 * rather than having it threaded through every layer of the document.
 */

import { createContext, useContext } from 'react';
import { statusLabel } from '../../lib/format.ts';
import type {
  FileSide,
  FileStatus,
  OneSided,
  RepositoryInfo,
  SideNames,
} from '../../types/index.ts';

export interface Wording {
  oneSided: OneSided;
  sideNames: SideNames;
}

export const REPOSITORY_WORDING: Wording = {
  oneSided: 'change',
  sideNames: { original: 'Before', working: 'After' },
};

export const WordingContext = createContext<Wording>(REPOSITORY_WORDING);

export function useWording(): Wording {
  return useContext(WordingContext);
}

/** The wording a source asked for, or the repository's before it is known. */
export function wordingOf(repository: RepositoryInfo | null): Wording {
  if (repository === null) return REPOSITORY_WORDING;
  return { oneSided: repository.oneSided, sideNames: repository.sideNames };
}

/** The name of one side, as an image pane is captioned. */
export function sideName(wording: Wording, side: FileSide): string {
  return wording.sideNames[side];
}

/** What an image pane says when its side has no file. */
export function absentLabel(wording: Wording, side: FileSide): string {
  if (wording.oneSided === 'missing') return 'Missing';
  return side === 'original' ? 'Added' : 'Deleted';
}

/** The tooltip on a file's status letter. */
export function statusTitle(wording: Wording, status: FileStatus): string {
  if (wording.oneSided === 'missing') {
    if (status === 'added') return `Missing from ${wording.sideNames.original}`;
    if (status === 'deleted') return `Missing from ${wording.sideNames.working}`;
  }
  return statusLabel(status);
}
