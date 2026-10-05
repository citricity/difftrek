import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { defineExtension } from './api.ts';
import type { Extension, LandingProps } from './api.ts';
import { Landing, LandingPanels } from './Landing.tsx';
import { landingExtensions } from './registry.ts';

const invokeExtension = vi.fn();

vi.mock('../services/backend.ts', () => ({
  invokeExtension: (...args: unknown[]) => invokeExtension(...args) as unknown,
  onFileDrop: () => Promise.resolve(() => undefined),
}));

function Opener({ host, mode }: LandingProps) {
  return (
    <button
      type="button"
      onClick={() => {
        void host.invoke('open', { left: 'a', right: 'b' }).then(() => host.reload());
      }}
    >
      Open from {mode}
    </button>
  );
}

const opener = defineExtension({
  id: 'opener',
  landing: { modes: ['none'], component: Opener },
});

function Broken(): never {
  throw new Error('broken on purpose');
}

const broken = defineExtension({
  id: 'broken',
  landing: { modes: ['none'], component: Broken },
});

const gitOnly = defineExtension({
  id: 'git-only',
  landing: { modes: ['git'], component: () => <p>Only in git</p> },
});

describe('landingExtensions', () => {
  it('keeps the extensions that contribute to a mode, in order', () => {
    const all: Extension[] = [opener, gitOnly, { id: 'nothing' }];

    expect(landingExtensions('none', all).map((e) => e.id)).toEqual(['opener']);
    expect(landingExtensions('git', all).map((e) => e.id)).toEqual(['git-only']);
  });
});

describe('Landing', () => {
  it('names the screen itself when no extension contributes', () => {
    render(
      <Landing mode="none" onReload={() => undefined} extensions={[gitOnly]}>
        <p>Core guidance</p>
      </Landing>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Every change, one document' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Core guidance')).toBeInTheDocument();
  });

  it('lets the first panel name the screen', () => {
    const named = defineExtension({
      id: 'named',
      landing: {
        modes: ['none'],
        component: () => <p>Named panel</p>,
        useHeading: () => ({ title: 'Compare things', intro: 'Pick two.' }),
      },
    });

    render(
      <Landing mode="none" onReload={() => undefined} extensions={[named, opener]}>
        <p>Core guidance</p>
      </Landing>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Compare things' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Pick two.')).toBeInTheDocument();
    expect(screen.queryByText('Every change, one document')).toBeNull();
  });

  it('keeps its own heading when the first panel does not name the screen', () => {
    const later = defineExtension({
      id: 'later',
      landing: {
        modes: ['none'],
        component: () => <p>Later panel</p>,
        useHeading: () => ({ title: 'Not first' }),
      },
    });

    render(
      <Landing mode="none" onReload={() => undefined} extensions={[opener, later]}>
        <p>Core guidance</p>
      </Landing>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Every change, one document' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Not first')).toBeNull();
  });

  it('keeps its own heading, and the panel, when an extension’s heading fails', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const faulty = defineExtension({
      id: 'faulty',
      landing: {
        modes: ['none'],
        component: () => <p>Faulty panel</p>,
        useHeading: () => {
          throw new Error('broken on purpose');
        },
      },
    });

    render(
      <Landing mode="none" onReload={() => undefined} extensions={[faulty]}>
        <p>Core guidance</p>
      </Landing>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Every change, one document' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Faulty panel')).toBeInTheDocument();
    quiet.mockRestore();
  });

  it('shows a panel above the core screen, wired to its own commands', async () => {
    invokeExtension.mockResolvedValue(undefined);
    const onReload = vi.fn();

    render(
      <Landing mode="none" onReload={onReload} extensions={[opener]}>
        <p>Core guidance</p>
      </Landing>,
    );

    expect(screen.getByText('Core guidance')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open from none' }));

    expect(invokeExtension).toHaveBeenCalledWith('opener', 'open', {
      left: 'a',
      right: 'b',
    });
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('drops a panel that fails to render and keeps the rest', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <Landing mode="none" onReload={() => undefined} extensions={[broken, opener]}>
        <p>Core guidance</p>
      </Landing>,
    );

    expect(screen.getByRole('button', { name: 'Open from none' })).toBeInTheDocument();
    expect(screen.getByText('Core guidance')).toBeInTheDocument();
    quiet.mockRestore();
  });

  it('offers just the panels for a screen that lays itself out', () => {
    render(
      <div data-testid="empty-diff">
        <LandingPanels
          mode="git"
          onReload={() => undefined}
          extensions={[opener, gitOnly]}
        />
      </div>,
    );

    expect(screen.getByTestId('empty-diff')).toHaveTextContent('Only in git');
    expect(screen.queryByRole('button', { name: /Open from/ })).toBeNull();
  });
});

describe('the landing band', () => {
  it('stops its rings while the window is hidden', () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    render(
      <Landing mode="none" onReload={() => undefined} extensions={[]}>
        <p>Core guidance</p>
      </Landing>,
    );
    const band = screen.getByRole('banner');
    expect(band).not.toHaveAttribute('data-paused');

    hidden.mockReturnValue(true);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(band).toHaveAttribute('data-paused');

    hidden.mockReturnValue(false);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(band).not.toHaveAttribute('data-paused');
    hidden.mockRestore();
  });
});
