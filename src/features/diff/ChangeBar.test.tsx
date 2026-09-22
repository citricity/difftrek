import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChangeBar } from './ChangeBar.tsx';

function bar(overrides: Partial<Parameters<typeof ChangeBar>[0]> = {}) {
  const props = {
    label: 'A',
    description: 'Reset the error count',
    position: 1,
    total: 3,
    onHunk: true,
    focused: false,
    canGoNext: true,
    canGoPrevious: false,
    hunkPosition: 2,
    hunkTotal: 2,
    canGoNextHunk: false,
    canGoPreviousHunk: true,
    onOpenContents: vi.fn(),
    onOpenChange: vi.fn(),
    onNext: vi.fn(),
    onPrevious: vi.fn(),
    onNextHunk: vi.fn(),
    onPreviousHunk: vi.fn(),
    onToggleFocus: vi.fn(),
    ...overrides,
  };

  render(<ChangeBar {...props} />);
  return props;
}

describe('the change bar', () => {
  it('names the change the reader is in, and where it sits', () => {
    bar();

    expect(screen.getByText('Reset the error count')).toBeInTheDocument();
    expect(screen.getByText('Change').parentElement).toHaveTextContent('Change 1 / 3');
  });

  // Two counters with arrows sit in one strip; each says what it counts.
  it('counts the hunks of the change apart from the changes', () => {
    bar();
    expect(screen.getByText('Hunk').parentElement).toHaveTextContent('Hunk 2 / 2');
  });

  it('walks the change in view, and stops at its end', async () => {
    const props = bar();

    expect(
      screen.getByRole('button', { name: 'Next hunk in this change' }),
    ).toBeDisabled();

    await userEvent.click(
      screen.getByRole('button', { name: 'Previous hunk in this change' }),
    );
    expect(props.onPreviousHunk).toHaveBeenCalled();
  });

  it('shows a long description whole on a click', async () => {
    const props = bar();

    await userEvent.click(
      screen.getByRole('button', { name: 'Reset the error count' }),
    );
    expect(props.onOpenChange).toHaveBeenCalled();
  });

  it('says a hunk belongs to no change, rather than showing an empty row', () => {
    bar({ label: null, description: null, position: null });
    expect(screen.getByText('Not part of a logical change')).toBeInTheDocument();
  });

  it('offers the shape of the diff before the reader has stepped anywhere', () => {
    bar({ label: null, description: null, position: null, onHunk: false });
    expect(screen.getByText('3 logical changes')).toBeInTheDocument();
  });

  it('cannot narrow to a change that is not there', () => {
    bar({ label: null, description: null, position: null, onHunk: false });
    expect(screen.getByRole('button', { name: /Focus this change/ })).toBeDisabled();
  });

  it('steps, and opens the contents', async () => {
    const props = bar();

    await userEvent.click(screen.getByRole('button', { name: 'Next logical change' }));
    expect(props.onNext).toHaveBeenCalled();

    expect(
      screen.getByRole('button', { name: 'Previous logical change' }),
    ).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'All logical changes' }));
    expect(props.onOpenContents).toHaveBeenCalled();
  });

  it('shows the narrowing as pressed, not just as a tint', () => {
    bar({ focused: true });
    expect(
      screen.getByRole('button', { name: /Stop focusing this change/ }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
});
