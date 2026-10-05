import { act, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { defineExtension } from './api.ts';
import type { AppProps } from './api.ts';
import type { ExtensionMenuItem } from '../services/backend.ts';

/** What the shell would call when a menu item is chosen in this window. */
let chooseMenuItem: ((chosen: ExtensionMenuItem) => void) | null = null;

/** Set to make the next menu subscription fail, as a missing permission would. */
let menuSubscriptionFails = false;

vi.mock('../services/backend.ts', () => ({
  invokeExtension: () => Promise.resolve(undefined),
  onFileDrop: () => Promise.resolve(() => undefined),
  onExtensionMenuItem: (handler: (chosen: ExtensionMenuItem) => void) => {
    if (menuSubscriptionFails) {
      menuSubscriptionFails = false;
      return Promise.reject(new Error('event.listen not allowed'));
    }
    chooseMenuItem = handler;
    return Promise.resolve(() => undefined);
  },
}));

const { ExtensionApps } = await import('./ExtensionApps.tsx');

/** Counts how often its own "enter" item is chosen. */
function Counter({ host }: AppProps) {
  const [count, setCount] = useState(0);

  useEffect(
    () => host.onMenuItem('enter', () => setCount((value) => value + 1)),
    [host],
  );

  return <p>{`${host.id} chosen ${count}`}</p>;
}

const licence = defineExtension({ id: 'licence', app: { component: Counter } });

describe('ExtensionApps', () => {
  it('mounts each extension’s app component with its own host', () => {
    render(<ExtensionApps onReload={() => undefined} extensions={[licence]} />);

    expect(screen.getByText('licence chosen 0')).toBeInTheDocument();
  });

  it('tells an extension about its own menu items only', async () => {
    render(<ExtensionApps onReload={() => undefined} extensions={[licence]} />);
    await vi.waitFor(() => expect(chooseMenuItem).not.toBeNull());

    act(() => chooseMenuItem?.({ extension: 'licence', item: 'enter' }));
    // Another extension's item of the same name, and another item of its own.
    act(() => chooseMenuItem?.({ extension: 'other', item: 'enter' }));
    act(() => chooseMenuItem?.({ extension: 'licence', item: 'remove' }));

    expect(screen.getByText('licence chosen 1')).toBeInTheDocument();
  });

  it('says why, rather than rejecting unhandled, when a menu subscription fails', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    menuSubscriptionFails = true;

    render(<ExtensionApps onReload={() => undefined} extensions={[licence]} />);

    await vi.waitFor(() =>
      expect(logged).toHaveBeenCalledWith(
        '[difftrek] could not subscribe to the licence menu item enter',
        expect.any(Error),
      ),
    );
    expect(screen.getByText('licence chosen 0')).toBeInTheDocument();
    logged.mockRestore();
  });

  it('renders nothing for extensions without an app component', () => {
    const landingOnly = defineExtension({
      id: 'dir-compare',
      landing: { modes: ['none'], component: () => <p>panel</p> },
    });

    const { container } = render(
      <ExtensionApps onReload={() => undefined} extensions={[landingOnly]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('keeps an extension’s failure to itself', () => {
    const broken = defineExtension({
      id: 'broken',
      app: {
        component: () => {
          throw new Error('boom');
        },
      },
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<ExtensionApps onReload={() => undefined} extensions={[broken, licence]} />);

    expect(screen.getByText('licence chosen 0')).toBeInTheDocument();
  });
});
