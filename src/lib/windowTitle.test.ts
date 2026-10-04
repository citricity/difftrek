import { describe, expect, it } from 'vitest';
import { makeRepositoryInfo } from '../test/factories.ts';
import { windowTitle } from './windowTitle.ts';

describe('windowTitle', () => {
  it('names the repository and its branch', () => {
    expect(windowTitle(makeRepositoryInfo({ name: 'difftrek', branch: 'main' }))).toBe(
      'difftrek — main',
    );
  });

  it('names the range rather than the branch when comparing one', () => {
    const repository = makeRepositoryInfo({
      name: 'difftrek',
      branch: 'main',
      comparison: { label: 'main...HEAD', base: 'abc1234', target: 'def5678' },
    });

    expect(windowTitle(repository)).toBe('difftrek — main...HEAD');
  });

  it('names the commit a detached HEAD is on', () => {
    const repository = makeRepositoryInfo({
      name: 'difftrek',
      branch: null,
      detached: true,
      head: 'abc1234',
    });

    expect(windowTitle(repository)).toBe('difftrek — abc1234');
  });

  it('is just the name when there is nothing more to say', () => {
    // Two folders compared, say: no branch and no range.
    expect(
      windowTitle(makeRepositoryInfo({ name: 'left ↔ right', branch: null })),
    ).toBe('left ↔ right');
  });
});
