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
  solidChange: string | null = null,
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
      solidChange={solidChange}
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
    labelOf: (change) =>
      change.length === 1
        ? String.fromCharCode(65 + 'xyzabcdefg'.indexOf(change))
        : 'Z',
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

  it('dashes every other change while one is focused', () => {
    show(
      [loadedFile('a.ts', 2)],
      vi.fn(),
      notesFor({ 'a.ts:hunk:0': ['x', 'y'], 'a.ts:hunk:1': ['x', 'y'] }),
      'y',
    );

    const strokes = [...screen.getByTestId('change-bars').children] as HTMLElement[];
    const dashed = (lane: string) =>
      strokes
        .filter((stroke) => stroke.style.getPropertyValue('--note-lane') === lane)
        .every((stroke) => stroke.className.includes('changeBarUnfocused'));

    // x is A (lane 0) and y is B (lane 1).
    expect(dashed('var(--note-lane-0)')).toBe(true);
    expect(
      strokes.some((stroke) => stroke.className.includes('changeBarUnfocused')),
    ).toBe(true);
    expect(dashed('var(--note-lane-1)')).toBe(false);
  });

  it('draws a dashed bar straight, without a curve onto its badge', () => {
    // Unfocused, y would sweep across to its badge (see the hook test above);
    // dashed, it runs straight down from under it.
    show(
      [loadedFile('a.ts', 2)],
      vi.fn(),
      notesFor({ 'a.ts:hunk:0': ['x', 'y'], 'a.ts:hunk:1': ['y'] }),
      'x',
    );

    const strokes = [...screen.getByTestId('change-bars').children];
    expect(strokes.some((stroke) => stroke.className.includes('changeBarHook'))).toBe(
      false,
    );
  });

  it('stripes the changes that do not fit into the last slot', () => {
    const crowd = ['x', 'y', 'z', 'a', 'b', 'c', 'd', 'e', 'f'];
    show(
      [loadedFile('a.ts', 2)],
      vi.fn(),
      notesFor({ 'a.ts:hunk:0': crowd, 'a.ts:hunk:1': crowd }),
    );

    const overflow = [...screen.getByTestId('change-bars').children].filter(
      (stroke) => (stroke as HTMLElement).dataset.changes !== undefined,
    ) as HTMLElement[];

    expect(overflow.length).toBeGreaterThan(0);
    expect(overflow[0].dataset.changes).toBe('d e f');
    expect(overflow[0].style.background).toContain('repeating-linear-gradient');
  });

  it('draws no slivers beside badges a bar has no letter among', () => {
    // Three changes start together: two letters and a "+1". The third bar used
    // to start at the row's edge and leave a 1–2px dash above the letters.
    const three = ['x', 'y', 'z'];
    show(
      [loadedFile('a.ts', 2)],
      vi.fn(),
      notesFor({ 'a.ts:hunk:0': three, 'a.ts:hunk:1': three }),
    );

    const heights = [...screen.getByTestId('change-bars').children].map((stroke) =>
      parseFloat((stroke as HTMLElement).style.height),
    );
    expect(Math.min(...heights)).toBeGreaterThan(3);
  });

  it('draws nothing without a changelog', () => {
    show([loadedFile('a.ts', 2)]);
    expect(screen.queryByTestId('change-bars')).toBeNull();
  });
});
