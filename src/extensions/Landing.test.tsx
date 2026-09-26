import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { defineExtension } from './api.ts';
import type { Extension, LandingProps } from './api.ts';
import { Landing } from './Landing.tsx';
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
  it('is exactly the core screen when no extension contributes', () => {
    const { container } = render(
      <Landing mode="none" onReload={() => undefined} extensions={[gitOnly]}>
        <p>Core guidance</p>
      </Landing>,
    );

    expect(container.innerHTML).toBe('<p>Core guidance</p>');
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
});
