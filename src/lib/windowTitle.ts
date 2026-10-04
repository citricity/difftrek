/**
 * What a window is called, for the lists that name windows by title: the
 * Dock icon's right-click menu and the Window menu.
 *
 * The repository first, because that is what tells two windows apart most
 * often, then what in it is on screen — the range for a comparison, else the
 * branch, else the commit a detached HEAD sits on. Nothing translatable: a
 * name, a branch and a range read the same in every language.
 *
 * A repository is named with the folder it sits in, `work/app` rather than
 * `app`: two clones of one project are the likeliest pair of windows to share
 * a name, and they almost always live in differently named folders. The full
 * path would say more, but a long title is cut short in exactly those lists.
 */

import type { RepositoryInfo } from '../types/index.ts';

export function windowTitle(repository: RepositoryInfo): string {
  const detail =
    repository.comparison?.label ??
    (repository.detached ? repository.head : repository.branch);
  const name = qualifiedName(repository);

  return detail ? `${name} — ${detail}` : name;
}

/**
 * `parent/name` for a Git repository at `…/parent/name`.
 *
 * Only for Git: another source's root need not be a folder named after it —
 * a folder comparison names itself, and its root is just one of its two sides.
 */
function qualifiedName({ source, root, name }: RepositoryInfo): string {
  if (source !== 'git') return name;

  // Either separator, so a Windows path splits too.
  const parts = root.split(/[\\/]+/).filter((part) => part !== '');
  const parent = parts.length >= 2 ? parts[parts.length - 2] : null;

  return parent !== null && parts[parts.length - 1] === name
    ? `${parent}/${name}`
    : name;
}
