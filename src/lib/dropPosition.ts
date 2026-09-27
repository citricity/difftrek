/**
 * Where a file dragged onto the window is, in CSS pixels.
 *
 * Tauri labels every drag-and-drop position a `PhysicalPosition`, but the
 * webview underneath does not agree on units. WebView2 on Windows reports
 * device pixels. WKWebView on macOS reports AppKit points, and WebKitGTK
 * reports GTK's logical pixels, both already divided by the display's scale
 * factor. Treating a Retina Mac's points as device pixels halves them, which
 * put a drop on the right-hand half of the window somewhere on the left.
 *
 * And none of them is CSS pixels once the interface is zoomed: page zoom
 * changes how many CSS pixels fit across the window. So rather than
 * assuming, the conversion compares the window's width in the event's units
 * with its width in CSS pixels, which covers the scale factor and the zoom at
 * once.
 */

export interface WindowMetrics {
  /** The window's inner width in device pixels, as Tauri reports it. */
  physicalWidth: number;
  /** Device pixels per logical pixel. */
  scaleFactor: number;
  /** `window.innerWidth`: the same width in CSS pixels. */
  cssWidth: number;
  /** WebView2, whose drag positions are device pixels. */
  windows: boolean;
}

/** CSS pixels per unit of drag position. */
export function dropScale({
  physicalWidth,
  scaleFactor,
  cssWidth,
  windows,
}: WindowMetrics): number {
  const width = windows ? physicalWidth : physicalWidth / scaleFactor;
  return width > 0 ? cssWidth / width : 1;
}

/** Whether this webview is WebView2, from its user agent. */
export function isWindowsWebview(userAgent: string): boolean {
  return /\bWindows\b/.test(userAgent);
}
