import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRowModel } from '../../lib/rows.ts';
import type { RowMetrics } from '../../lib/rows.ts';
import { loadedFile, pendingFile } from '../../test/factories.ts';
import type { DocumentFile } from '../../types/index.ts';
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

function show(files: DocumentFile[], onPlaceholdersInView = vi.fn()) {
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
