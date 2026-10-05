import type { ReactNode } from 'react';
import { useT } from '../i18n/index.ts';
import type { Extension, LandingHeading, Mode } from './api.ts';
import { ExtensionBoundary } from './ExtensionBoundary.tsx';
import { useExtensionHost } from './host.ts';
import { LandingHero } from './LandingHero.tsx';
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
 * A band across the top names the screen, and everything else sits beneath
 * it: extensions' panels — comparing two folders, say — then the core's own
 * guidance. The first panel's heading is the band's, as that panel is what
 * the screen is for; with no panel, or none that names the screen, the band
 * says what Diff Trek itself is for.
 */
export function Landing({ mode, onReload, children, extensions = compiledIn }: Props) {
  const panels = landingExtensions(mode, extensions);
  const naming = panels[0]?.landing?.useHeading;

  return (
    <div className={styles.screen}>
      {naming === undefined ? (
        <CoreHeading />
      ) : (
        <ExtensionBoundary id={panels[0].id} fallback={<CoreHeading />}>
          <ExtensionHeading useHeading={naming} />
        </ExtensionBoundary>
      )}
      <div className={styles.body}>
        <LandingPanels mode={mode} onReload={onReload} extensions={extensions} />
        {children}
      </div>
    </div>
  );
}

function CoreHeading() {
  const t = useT();
  return <LandingHero title={t('landing.title')} intro={t('landing.intro')} />;
}

function ExtensionHeading({ useHeading }: { useHeading: () => LandingHeading }) {
  const { title, intro } = useHeading();
  return <LandingHero title={title} intro={intro} />;
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
