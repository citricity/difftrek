import { describe, expect, it } from 'vitest';
import { makeRepositoryInfo } from '../test/factories.ts';
import { windowTitle } from './windowTitle.ts';

/** A repository at `/repos/<name>`, as the factory's root suggests. */
function repository(overrides: Parameters<typeof makeRepositoryInfo>[0] = {}) {
  return makeRepositoryInfo({
    root: '/repos/difftrek',
    name: 'difftrek',
    ...overrides,
  });
}

describe('windowTitle', () => {
  it('names the repository, with its folder, and its branch', () => {
    expect(windowTitle(repository({ branch: 'main' }))).toBe('repos/difftrek — main');
  });

  it('names the range rather than the branch when comparing one', () => {
    const comparing = repository({
      branch: 'main',
      comparison: { label: 'main...HEAD', base: 'abc1234', target: 'def5678' },
    });

    expect(windowTitle(comparing)).toBe('repos/difftrek — main...HEAD');
  });

  it('names the commit a detached HEAD is on', () => {
    const detached = repository({ branch: null, detached: true, head: 'abc1234' });

    expect(windowTitle(detached)).toBe('repos/difftrek — abc1234');
  });

  it('tells apart two clones that share a name', () => {
    const work = windowTitle(repository({ root: '/Users/guy/work/app', name: 'app' }));
    const scratch = windowTitle(repository({ root: '/tmp/app', name: 'app' }));

    expect(work).toBe('work/app — main');
    expect(scratch).toBe('tmp/app — main');
  });

  it('splits a Windows path too', () => {
    const title = windowTitle(repository({ root: 'C:\\code\\app', name: 'app' }));

    expect(title).toBe('code/app — main');
  });

  it('leaves the name alone when the root says nothing more', () => {
    // At the top of the file system there is no folder to add.
    expect(windowTitle(repository({ root: '/app', name: 'app' }))).toBe('app — main');
  });

  it('is just the name for a source that is not a repository', () => {
    // Two folders compared: no branch, no range, and a root that is one side.
    const folders = makeRepositoryInfo({
      source: 'dir-compare',
      root: '/Users/guy/right',
      name: 'Folders',
      branch: null,
    });

    expect(windowTitle(folders)).toBe('Folders');
  });
});
