import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

/**
 * Keeps one extension's failure to itself.
 *
 * An extension is never load-bearing: if its component throws while
 * rendering, the component disappears — or makes way for the core's own,
 * where there is one — and the rest of the app carries on.
 * React only offers this as a class component, which is the one reason there
 * is one here.
 */
export class ExtensionBoundary extends Component<
  {
    id: string;
    children: ReactNode;
    /** Shown in its place if it fails; nothing by default. */
    fallback?: ReactNode;
  },
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
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
