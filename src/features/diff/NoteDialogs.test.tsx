import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NoteDialogs } from './NoteDialogs.tsx';
import type { NoteDialog } from './NoteDialogs.tsx';
import type { AiChangelogView } from '../../hooks/useAiChangelog.ts';
import type { AiChangelog, ResolvedHunk } from '../../types/index.ts';

function resolved(overrides: Partial<ResolvedHunk> = {}): ResolvedHunk {
  return {
    hunkId: 'src/one.ts:hunk:0',
    reasons: ['Counts are read from the database, not accumulated in memory.'],
    logicalChangeIds: ['0'],
    ambiguous: false,
    partial: false,
    ...overrides,
  };
}

function view(hunk: ResolvedHunk): AiChangelogView {
  const changelog: AiChangelog = {
    nonce: 'AB99X7',
    author: 'claude',
    issueTracker: 'https://example.com/issues',
    commithash: null,
    logicalChanges: [
      { id: '0', description: 'Reset the error count', associatedIssues: ['9'] },
      { id: '1', description: 'Warm the dark colours', associatedIssues: [] },
    ],
    hunks: { [hunk.hunkId]: hunk },
    summary: { matched: 1, total: 1, unexplained: 0, partial: 0, staleNotes: 0 },
  };

  return {
    changelog,
    hunk: (id) => changelog.hunks[id] ?? null,
    state: () => 'explained',
    logicalChange: (id) =>
      changelog.logicalChanges.find((change) => change.id === id) ?? null,
    labelOf: (id) => (id === '0' ? 'A' : 'B'),
    describe: (id) =>
      changelog.logicalChanges.find((change) => change.id === id)?.description ?? '',
  };
}

function open(hunk: ResolvedHunk) {
  const notes = view(hunk);
  render(
    <NoteDialogs
      open={{ kind: 'hunk', hunkId: hunk.hunkId }}
      notes={notes}
      order={[hunk.hunkId]}
      onClose={vi.fn()}
      onOpenChange={vi.fn()}
    />,
  );
}

describe('the hunk dialog', () => {
  it('shows the reason, and the change it belongs to', () => {
    open(resolved());

    expect(screen.getByText(/read from the database/)).toBeInTheDocument();
    expect(screen.getByText('Reset the error count')).toBeInTheDocument();
  });

  it('opens a lone logical change, because there is nothing to choose between', () => {
    open(resolved());
    expect(
      screen.getByRole('button', { name: /Reset the error count/ }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('leaves several changes closed until the reader picks one', async () => {
    open(resolved({ logicalChangeIds: ['0', '1'] }));

    for (const name of [/Reset the error count/, /Warm the dark colours/]) {
      expect(screen.getByRole('button', { name })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    }

    await userEvent.click(screen.getByRole('button', { name: /Warm the dark/ }));
    expect(screen.getByRole('button', { name: /Warm the dark/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('says so when the hunk has grown around the note', () => {
    open(resolved({ partial: true }));
    expect(screen.getByText(/changed around the note since/)).toBeInTheDocument();
  });

  it('says so when identical hunks were given different reasons', () => {
    open(
      resolved({ ambiguous: true, reasons: ['The header copy', 'The footer copy'] }),
    );

    expect(screen.getByText(/different reasons/)).toBeInTheDocument();
    expect(screen.getByText('The header copy')).toBeInTheDocument();
    expect(screen.getByText('The footer copy')).toBeInTheDocument();
  });

  it('names an unexplained hunk as one, rather than showing nothing', () => {
    open(resolved({ reasons: [], logicalChangeIds: [] }));
    expect(screen.getByText(/No reason was recorded/)).toBeInTheDocument();
  });

  it('opens a change from the hunk the reader came from, not from nowhere', async () => {
    const hunk = resolved();
    const onOpenChange = vi.fn();

    render(
      <NoteDialogs
        open={{ kind: 'hunk', hunkId: hunk.hunkId }}
        notes={view(hunk)}
        order={[hunk.hunkId]}
        onClose={vi.fn()}
        onOpenChange={onOpenChange}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Open this change/ }));
    expect(onOpenChange).toHaveBeenCalledWith('0', hunk.hunkId);
  });
});

describe('the logical change dialog', () => {
  it('shows the description and the issues, and nothing to walk', () => {
    const hunk = resolved();
    const notes = view(hunk);

    render(
      <NoteDialogs
        open={{ kind: 'change', changeId: '0' }}
        notes={notes}
        order={[hunk.hunkId]}
        onClose={vi.fn()}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Reset the error count')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '#9' })).toHaveAttribute(
      'href',
      'https://example.com/issues/9',
    );

    // The walk is the change bar's now: a dialog over the diff hides the
    // code the walk is meant to show.
    expect(screen.queryByText('1 hunk')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /src\/one\.ts/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Focus/ })).not.toBeInTheDocument();
  });
});

describe('the logical change dialog, given a thin payload', () => {
  it('opens even when an empty issue list was left out of it altogether', () => {
    const hunk = resolved();
    const notes = view(hunk);

    // What a backend that skips empty collections sends: no `associatedIssues`
    // key at all, where the dialog expects an array it can measure.
    const change = notes.changelog?.logicalChanges[0] as {
      associatedIssues?: string[];
    };
    delete change.associatedIssues;

    render(
      <NoteDialogs
        open={{ kind: 'change', changeId: '0' }}
        notes={notes}
        order={[hunk.hunkId]}
        onClose={vi.fn()}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Reset the error count')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe("a docked change's hunk list", () => {
  const second = 'src/two.ts:hunk:0';

  function renderChange(placement: 'sidebar' | 'overlay', onGoToHunk = vi.fn()) {
    const hunk = resolved();
    const notes = view(hunk);
    // A second hunk for the same change, so the list has something to walk.
    notes.changelog!.hunks[second] = resolved({
      hunkId: second,
      reasons: ['The footer copy follows the header.'],
    });

    render(
      <NoteDialogs
        open={{ kind: 'change', changeId: '0' }}
        notes={notes}
        order={[hunk.hunkId, second]}
        currentHunk={second}
        onGoToHunk={onGoToHunk}
        onClose={vi.fn()}
        onOpenChange={vi.fn()}
        placement={placement}
      />,
    );
    return { onGoToHunk };
  }

  it('lists the hunks under the description, marking where the reader is', () => {
    renderChange('sidebar');

    expect(screen.getByText('2 hunks')).toBeInTheDocument();
    expect(screen.getByText('src/one.ts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /footer copy/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('walks to a hunk without closing', async () => {
    const { onGoToHunk } = renderChange('sidebar');

    await userEvent.click(
      screen.getByRole('button', { name: /read from the database/ }),
    );
    expect(onGoToHunk).toHaveBeenCalledWith('src/one.ts:hunk:0');
    // Still the change: the list is what the reader walks it from.
    expect(screen.getByRole('heading', { name: /Logical change/ })).toBeInTheDocument();
  });

  it('is not offered in the overlay, which covers the hunks it would walk to', () => {
    renderChange('overlay');
    expect(screen.queryByText('2 hunks')).not.toBeInTheDocument();
  });
});

describe('the contents dialog', () => {
  it('lists the changes with a hunk on screen, and how much each covers', async () => {
    const hunk = resolved();
    const notes = view(hunk);
    const onOpenChange = vi.fn();

    render(
      <NoteDialogs
        open={{ kind: 'contents' }}
        notes={notes}
        order={[hunk.hunkId]}
        currentChange="0"
        onClose={vi.fn()}
        onOpenChange={onOpenChange}
      />,
    );

    // Change B covers nothing here, so it is not in the document's contents.
    expect(screen.queryByText('Warm the dark colours')).not.toBeInTheDocument();
    expect(screen.getByText('1 hunk')).toBeInTheDocument();

    const entry = screen.getByRole('button', { name: /Reset the error count/ });
    expect(entry).toHaveAttribute('aria-current', 'true');

    await userEvent.click(entry);
    expect(onOpenChange).toHaveBeenCalledWith('0');
  });

  it('says when hunks belong to no change at all', () => {
    const hunk = resolved({ logicalChangeIds: [], reasons: [] });
    render(
      <NoteDialogs
        open={{ kind: 'contents' }}
        notes={view(hunk)}
        order={[hunk.hunkId]}
        onClose={vi.fn()}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/belongs to no logical change/)).toBeInTheDocument();
  });
});

describe('in the sidebar', () => {
  it('leaves out the offer to open the change, which is on screen already', () => {
    // The accordion, expanded, is the description in full; docked, a second
    // panel saying the same thing read as a control that did nothing.
    const hunk = resolved();
    render(
      <NoteDialogs
        open={{ kind: 'hunk', hunkId: hunk.hunkId }}
        notes={view(hunk)}
        order={[hunk.hunkId]}
        onClose={vi.fn()}
        onOpenChange={vi.fn()}
        placement="sidebar"
      />,
    );

    expect(screen.getByText('Reset the error count')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Open this change/ }),
    ).not.toBeInTheDocument();
  });

  function renderPlaced(open: NoteDialog) {
    const hunk = resolved();
    const onClose = vi.fn();
    const result = render(
      <NoteDialogs
        open={open}
        notes={view(hunk)}
        order={[hunk.hunkId]}
        onClose={onClose}
        onOpenChange={vi.fn()}
        placement="sidebar"
      />,
    );
    return { ...result, onClose, hunk };
  }

  it('shows the note beside the diff rather than in a dialog', () => {
    renderPlaced({ kind: 'hunk', hunkId: 'src/one.ts:hunk:0' });

    // Not modal: nothing is a dialog, so nothing makes the diff inert.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const sidebar = screen.getByRole('complementary', { name: 'src/one.ts' });
    expect(sidebar).toHaveTextContent(/read from the database/);
  });

  it('takes up no room when nothing is open', () => {
    const { container } = renderPlaced(null);
    expect(container).toBeEmptyDOMElement();
  });

  it('swaps what it shows without closing first', () => {
    const { rerender, hunk } = renderPlaced({
      kind: 'hunk',
      hunkId: 'src/one.ts:hunk:0',
    });

    rerender(
      <NoteDialogs
        open={{ kind: 'change', changeId: '0' }}
        notes={view(hunk)}
        order={[hunk.hunkId]}
        onClose={vi.fn()}
        onOpenChange={vi.fn()}
        placement="sidebar"
      />,
    );

    expect(
      screen.getByRole('complementary', { name: /Logical change/ }),
    ).toHaveTextContent('Reset the error count');
    expect(screen.queryByText(/read from the database/)).not.toBeInTheDocument();
  });

  it('gives focus back to whatever opened it', async () => {
    // The overlay gets this from `showModal`; docked, closing the panel from
    // its own button would otherwise drop focus on the body and restart
    // tabbing at the top of the app.
    const hunk = resolved();
    const marker = document.createElement('button');
    document.body.append(marker);
    marker.focus();

    const props = (open: NoteDialog) => (
      <NoteDialogs
        open={open}
        notes={view(hunk)}
        order={[hunk.hunkId]}
        onClose={vi.fn()}
        onOpenChange={vi.fn()}
        placement="sidebar"
      />
    );
    const { rerender } = render(props(null));
    rerender(props({ kind: 'hunk', hunkId: hunk.hunkId }));

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.activeElement).toBe(marker);
    marker.remove();
  });

  it('closes from its own button', async () => {
    const { onClose } = renderPlaced({ kind: 'contents' });
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('the sidebar edge', () => {
  function renderEdge(width = 360) {
    const hunk = resolved();
    const onSidebarResize = vi.fn();
    const props = (sidebarWidth: number) => (
      <NoteDialogs
        open={{ kind: 'hunk', hunkId: hunk.hunkId }}
        notes={view(hunk)}
        order={[hunk.hunkId]}
        onClose={vi.fn()}
        onOpenChange={vi.fn()}
        placement="sidebar"
        sidebarWidth={sidebarWidth}
        onSidebarResize={onSidebarResize}
      />
    );
    const { rerender } = render(props(width));

    return {
      edge: () => screen.getByRole('separator', { name: 'Resize the notes sidebar' }),
      // The width is the parent's to hold, so a step is only really kept if
      // the next one is measured from it.
      setWidth: (next: number) => rerender(props(next)),
      onSidebarResize,
    };
  }

  it('says how wide the sidebar is', () => {
    expect(renderEdge(420).edge()).toHaveAttribute('aria-valuenow', '420');
  });

  it('moves with the arrow keys, and steps on from where it left off', async () => {
    const user = userEvent.setup();
    const { edge, setWidth, onSidebarResize } = renderEdge();
    edge().focus();

    // The edge is on the left: left widens, right narrows. Each press shows
    // the new width; the key coming up is what saves it, so that holding the
    // key down writes the settings file once rather than thirty times a
    // second.
    await user.keyboard('{ArrowLeft>}');
    expect(onSidebarResize).toHaveBeenLastCalledWith(376, false);
    await user.keyboard('{/ArrowLeft}');
    expect(onSidebarResize).toHaveBeenLastCalledWith(376, true);

    setWidth(376);
    await user.keyboard('{ArrowLeft}');
    expect(onSidebarResize).toHaveBeenLastCalledWith(392, true);
  });

  it('will not go narrower than the minimum', async () => {
    const { edge, onSidebarResize } = renderEdge(240);
    edge().focus();

    await userEvent.keyboard('{ArrowRight}');
    expect(onSidebarResize).toHaveBeenLastCalledWith(240, true);
  });

  it('saves nothing for a click that moves nothing', async () => {
    // A drag starts from the width as drawn, which the window may have capped
    // below the stored one — committing that on a bare click would shrink a
    // width the reader never touched.
    const { edge, onSidebarResize } = renderEdge(600);
    await userEvent.click(edge());
    expect(onSidebarResize).not.toHaveBeenCalled();
  });

  it('goes back to the default on a double click', async () => {
    const { edge, onSidebarResize } = renderEdge(600);
    await userEvent.dblClick(edge());
    expect(onSidebarResize).toHaveBeenCalledTimes(1);
    expect(onSidebarResize).toHaveBeenCalledWith(360, true);
  });
});

describe('in the top bar', () => {
  it('shows the note above the diff, not modal and not resizable', () => {
    const hunk = resolved();
    render(
      <NoteDialogs
        open={{ kind: 'hunk', hunkId: hunk.hunkId }}
        notes={view(hunk)}
        order={[hunk.hunkId]}
        onClose={vi.fn()}
        onOpenChange={vi.fn()}
        placement="topbar"
        onSidebarResize={vi.fn()}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'src/one.ts' })).toHaveTextContent(
      /read from the database/,
    );
    // Its height is a share of the window; the sidebar's width handle is not
    // for it.
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  it('takes up no room when nothing is open', () => {
    const hunk = resolved();
    const { container } = render(
      <NoteDialogs
        open={null}
        notes={view(hunk)}
        order={[hunk.hunkId]}
        onClose={vi.fn()}
        onOpenChange={vi.fn()}
        placement="topbar"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
