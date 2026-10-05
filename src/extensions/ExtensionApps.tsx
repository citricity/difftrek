import { appExtensions, extensions as compiledIn } from './registry.ts';
import type { Extension } from './api.ts';
import { ExtensionBoundary } from './ExtensionBoundary.tsx';
import { useExtensionHost } from './host.ts';

interface Props {
  /** Reloads the document, as a landing panel's host does. */
  onReload: () => void;
  /** Overrides the compiled-in extensions; for tests. */
  extensions?: readonly Extension[];
}

/**
 * Every extension's app component, mounted for as long as the window is open.
 *
 * Sits beside the document rather than inside it, so a reload — which throws
 * the document's session away — leaves an open dialog alone. With no
 * extension contributing one, this renders nothing.
 */
export function ExtensionApps({ onReload, extensions = compiledIn }: Props) {
  return appExtensions(extensions).map((extension) => (
    <ExtensionApp key={extension.id} extension={extension} onReload={onReload} />
  ));
}

function ExtensionApp({
  extension,
  onReload,
}: {
  extension: Extension;
  onReload: () => void;
}) {
  const host = useExtensionHost(extension.id, onReload);

  const App = extension.app?.component;
  if (App === undefined) return null;

  return (
    <ExtensionBoundary id={extension.id}>
      <App host={host} />
    </ExtensionBoundary>
  );
}
