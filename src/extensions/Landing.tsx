import type { ReactNode } from 'react';
import type { Extension, Mode } from './api.ts';
import { ExtensionBoundary } from './ExtensionBoundary.tsx';
import { useExtensionHost } from './host.ts';
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
  if (landingExtensions(mode, extensions).length === 0) return children;

  return (
    <div className={styles.screen}>
      <LandingPanels mode={mode} onReload={onReload} extensions={extensions} />
      {children}
    </div>
  );
}

/**
 * Just the panels for `mode`, for a screen that lays itself out — the empty
 * diff, say, where they sit beneath its own message. Nothing when no
 * extension contributes one.
 */
export function LandingPanels({
  mode,
  onReload,
  extensions = compiledIn,
}: Omit<Props, 'children'>) {
  return landingExtensions(mode, extensions).map((extension) => (
    <LandingPanel
      key={extension.id}
      extension={extension}
      mode={mode}
      onReload={onReload}
    />
  ));
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
  const host = useExtensionHost(extension.id, onReload);

  const Panel = extension.landing?.component;
  if (Panel === undefined) return null;

  return (
    <ExtensionBoundary id={extension.id}>
      <Panel host={host} mode={mode} />
    </ExtensionBoundary>
  );
}
