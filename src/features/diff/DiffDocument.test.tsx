import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRowModel } from '../../lib/rows.ts';
import type { RowMetrics } from '../../lib/rows.ts';
import { loadedFile, pendingFile } from '../../test/factories.ts';
import type { DocumentFile, ResolvedHunk } from '../../types/index.ts';
import type { DocumentNotes } from '../../hooks/useAiChangelog.ts';
import { DiffDocument } from './DiffDocument.tsx';

const METRICS: RowMetrics = {
  lineHeight: 20,
  fileHeaderHeight: 34,
  expanderHeight: 24,
  noticeHeight: 44,
  imageHeight: 260,
  fileGap: 14,
  charWidth: 8,
  gutterWidth: 108,
  contentPadding: 16,
};

function show(
  files: DocumentFile[],
  onPlaceholdersInView = vi.fn(),
  notes: DocumentNotes | null = null,
) {
  render(
    <DiffDocument
      files={files}
      model={buildRowModel(files, METRICS)}
      metrics={METRICS}
      loading={false}
      current={null}
      revealRequest={0}
      onSelect={vi.fn()}
      onSelectFile={vi.fn()}
      onVisibleFileChange={vi.fn()}
      onPlaceholdersInView={onPlaceholdersInView}
      onToggleCollapse={vi.fn()}
      onLoadFully={vi.fn()}
      onExpandContext={vi.fn()}
      wrapColumn={null}
      viewMode="unified"
      notes={notes}
    />,
  );
  return { onPlaceholdersInView };
}

beforeEach(() => {
  // jsdom has no ResizeObserver; the document falls back to the window height,
  // which is plenty to have every file below and the end in view.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the end of the document', () => {
  it('congratulates the reader once everything on screen has loaded', () => {
    show([loadedFile('a.ts', 1), loadedFile('b.ts', 1)]);

    expect(screen.getByRole('note', { name: 'End of changes' })).toBeInTheDocument();
  });

  it('waits while a file on screen is still loading', () => {
    // Issue 18: the message appeared under a screen of loading skeletons.
    show([loadedFile('a.ts', 1), pendingFile('b.ts')]);

    expect(screen.getByRole('row', { name: 'Loading b.ts' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.queryByRole('note', { name: 'End of changes' })).toBeNull();
  });

  it('asks for every waiting file on screen, not only those near the visible one', () => {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((name) =>
      pendingFile(`${name}.ts`),
    );
    const { onPlaceholdersInView } = show(files);

    expect(onPlaceholdersInView).toHaveBeenCalledWith(
      files.map((file) => file.meta.id),
    );
  });
});

/** Notes placing each hunk in the logical changes given for it. */
function notesFor(membership: Record<string, string[]>): DocumentNotes {
  const hunks: Record<string, ResolvedHunk> = Object.fromEntries(
    Object.entries(membership).map(([hunkId, logicalChangeIds]) => [
      hunkId,
      { hunkId, reasons: ['why'], logicalChangeIds, ambiguous: false, partial: false },
    ]),
  );

  return {
    hunks,
    state: () => 'explained',
    labelOf: (change) => (change === 'x' ? 'A' : 'B'),
    describe: () => 'A change',
    onOpenHunk: vi.fn(),
    onOpenChange: vi.fn(),
  };
}

describe('logical change bars', () => {
  it('joins a change across the hunks it covers, in its lane colour', () => {
    show(
      [loadedFile('a.ts', 2)],
      vi.fn(),
      notesFor({ 'a.ts:hunk:0': ['x'], 'a.ts:hunk:1': ['x'] }),
    );

    const bars = screen.getByTestId('change-bars');
    expect(bars.children).toHaveLength(1);
    expect(
      (bars.children[0] as HTMLElement).style.getPropertyValue('--note-lane'),
    ).toBe('var(--note-lane-0)');
  });

  it('hooks the second of two changes starting together across to its badge', () => {
    show(
      [loadedFile('a.ts', 2)],
      vi.fn(),
      notesFor({ 'a.ts:hunk:0': ['x', 'y'], 'a.ts:hunk:1': ['y'] }),
    );

    // x: one straight bar. y: a sweep and a corner round its badge, then the
    // bar.
    expect(screen.getByTestId('change-bars').children).toHaveLength(4);
  });

  it('draws nothing without a changelog', () => {
    show([loadedFile('a.ts', 2)]);
    expect(screen.queryByTestId('change-bars')).toBeNull();
  });
});
