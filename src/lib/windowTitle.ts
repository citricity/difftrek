/**
 * What a window is called, for the lists that name windows by title: the
 * Dock icon's right-click menu and the Window menu.
 *
 * The repository first, because that is what tells two windows apart most
 * often, then what in it is on screen — the range for a comparison, else the
 * branch, else the commit a detached HEAD sits on. Nothing translatable: a
 * name, a branch and a range read the same in every language.
 */

import type { RepositoryInfo } from '../types/index.ts';

export function windowTitle(repository: RepositoryInfo): string {
  const detail =
    repository.comparison?.label ??
    (repository.detached ? repository.head : repository.branch);

  return detail ? `${repository.name} — ${detail}` : repository.name;
}
