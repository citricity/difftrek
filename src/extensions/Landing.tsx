import { Component, useMemo } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { invokeExtension, onFileDrop } from '../services/backend.ts';
import type { Extension, ExtensionHost, Mode } from './api.ts';
import { extensions as compiledIn, landingExtensions } from './registry.ts';
import styles from './Landing.module.css';

interface Props {
  mode: Mode;
  /** Reloads the document onto whatever an extension has opened. */
  onReload: () => void;
  /**
   * The core's own content for this screen, shown beneath any panels. It is
   * told when there are panels (see `NotARepository`'s `alongside`), and
   * lays itself out as one section among them.
   */
  children: ReactNode;
  /** Overrides the compiled-in extensions; for tests. */
  extensions?: readonly Extension[];
}

/**
 * A landing screen: what Diff Trek shows when there is no diff to show yet.
 *
 * Extensions contribute panels to it — comparing two folders, say — above the
 * core's own guidance. With none compiled in, this is exactly the core's
 * screen, unchanged.
 */
export function Landing({ mode, onReload, children, extensions = compiledIn }: Props) {
  const panels = landingExtensions(mode, extensions);

  if (panels.length === 0) return children;

  return (
    <div className={styles.screen}>
      {panels.map((extension) => (
        <LandingPanel
          key={extension.id}
          extension={extension}
          mode={mode}
          onReload={onReload}
        />
      ))}
      {children}
    </div>
  );
}

function LandingPanel({
  extension,
  mode,
  onReload,
}: {
  extension: Extension;
  mode: Mode;
  onReload: () => void;
}) {
  const host = useMemo<ExtensionHost>(
    () => ({
      id: extension.id,
      invoke: <T,>(command: string, args?: Record<string, unknown>) =>
        invokeExtension<T>(extension.id, command, args),
      reload: onReload,
      onFileDrop: (listener) => {
        // The subscription resolves asynchronously; an unsubscribe that
        // arrives first is honoured as soon as it does.
        let unlisten: (() => void) | null = null;
        let cancelled = false;
        void onFileDrop(listener).then((stop) => {
          if (cancelled) stop();
          else unlisten = stop;
        });
        return () => {
          cancelled = true;
          unlisten?.();
        };
      },
    }),
    [extension.id, onReload],
  );

  const Panel = extension.landing?.component;
  if (Panel === undefined) return null;

  return (
    <ExtensionBoundary id={extension.id}>
      <Panel host={host} mode={mode} />
    </ExtensionBoundary>
  );
}

/**
 * Keeps one extension's failure to itself.
 *
 * An extension is never load-bearing: if its panel throws while rendering, the
 * panel disappears and the rest of the screen carries on. React only offers
 * this as a class component, which is the one reason there is one here.
 */
class ExtensionBoundary extends Component<
  { id: string; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[difftrek] extension ${this.props.id} failed`,
      error,
      info.componentStack,
    );
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
