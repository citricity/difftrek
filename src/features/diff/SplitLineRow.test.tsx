import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SplitLineRow } from './SplitLineRow.tsx';
import type { PaneLine } from './SplitLineRow.tsx';
import type { DiffLine } from '../../types/index.ts';

function pane(kind: DiffLine['kind'], number: number): PaneLine {
  return {
    line: {
      kind,
      oldLineNumber: kind === 'add' ? null : number,
      newLineNumber: kind === 'delete' ? null : number,
      content: 'code',
      noNewline: false,
    },
    runs: [{ text: 'code', color: null, changed: false }],
  };
}

function row(left: PaneLine | null, right: PaneLine | null) {
  render(
    <SplitLineRow
      left={left}
      right={right}
      wrapColumn={null}
      offset={0}
      active={false}
      notes={<span data-testid="marker">A</span>}
      style={{}}
    />,
  );
}

describe('the split row', () => {
  it('draws the markers once, beside the old line', () => {
    row(pane('delete', 7), pane('add', 7));
    expect(screen.getAllByTestId('marker')).toHaveLength(1);
  });

  // An absent pane renders no gutter at all, so a row that is pure addition
  // would otherwise lose its logical change markers in split view.
  it('keeps them when there is no old line to hang them on', () => {
    row(null, pane('add', 7));
    expect(screen.getAllByTestId('marker')).toHaveLength(1);
  });

  // The change bars run down the left edge; a marker in the right pane was
  // half a window away from its bar (PR #21 review).
  it('keeps them at the left edge, out of the new side', () => {
    row(null, pane('add', 7));
    expect(screen.getByTestId('marker').closest('[data-side="right"]')).toBeNull();
  });

  it('does not draw them twice when both sides are present', () => {
    row(pane('context', 7), pane('context', 7));
    expect(screen.getAllByTestId('marker')).toHaveLength(1);
  });
});
