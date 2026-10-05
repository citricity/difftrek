import { afterEach, describe, expect, it } from 'vitest';
import { fixtureCall } from './fixtures.ts';
import { matchesDiff, splitLines } from './fileText.ts';
import { AppError } from '../types/index.ts';
import type {
  ChangedFile,
  FileDiff,
  FileText,
  RepositoryInfo,
} from '../types/index.ts';

/**
 * The sample has to behave like a real repository, or `--example` cannot
 * demonstrate the features it exists to demonstrate. In particular its file
 * contents must line up with its diffs, which is the same check `loadFileText`
 * applies before allowing context to be expanded.
 */
describe('the sample diff', () => {
  async function textFor(diff: FileDiff): Promise<FileText> {
    const read = async (side: 'original' | 'working'): Promise<string[] | null> => {
      const contents = await fixtureCall<string>('get_file_contents', {
        path: diff.path,
        side,
      });
      return contents === '' ? null : splitLines(contents);
    };

    return { original: await read('original'), working: await read('working') };
  }

  it('offers file contents that match its own diffs', async () => {
    const files = await fixtureCall<ChangedFile[]>('get_changed_files');
    const expandable: string[] = [];

    for (const file of files) {
      if (file.binary) continue;

      const diff = await fixtureCall<FileDiff>('get_file_diff', { path: file.path });
      const text = await textFor(diff);
      if (text.original === null && text.working === null) continue;

      expect(matchesDiff(diff, text), `${file.path} does not match its diff`).toBe(
        true,
      );
      expandable.push(file.path);
    }

    // If this ever drops to zero the sample still renders, but silently stops
    // showing expandable context at all.
    expect(expandable.length).toBeGreaterThan(0);
  });

  it('leaves room around the hunks to expand into', async () => {
    const diff = await fixtureCall<FileDiff>('get_file_diff', {
      path: 'src/features/diff/DiffDocument.tsx',
    });
    const { working } = await textFor(diff);
    const last = diff.hunks[diff.hunks.length - 1];

    expect(working).not.toBeNull();
    expect(diff.hunks[0].newStart).toBeGreaterThan(1);
    expect(working?.length ?? 0).toBeGreaterThan(last.newStart + last.newLines);
  });
});

/**
 * The landing screen is reached by a launch outside a repository, which the
 * browser cannot do, so `?landing` asks the sample to behave like one.
 */
describe('the landing screen in the browser', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('is reached with ?landing, by the error a launch outside a repository gets', async () => {
    window.history.replaceState(null, '', '/?landing');

    const thrown: unknown = await fixtureCall('get_repository_info').catch(
      (error: unknown) => error,
    );

    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).kind).toBe('notARepository');
  });

  it('still opens on the sample diff without it', async () => {
    const info = await fixtureCall<RepositoryInfo>('get_repository_info');

    expect(info.name).toBe('difftrek (example)');
  });
});
