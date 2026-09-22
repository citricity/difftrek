/**
 * The built app, served, with a real browser pointed at it.
 *
 * Shared by the integration files so each gets the same start: a production
 * build of the built-in sample, not the dev server, and a page that has
 * already drawn a document. Each file starts its own on its own port, because
 * vitest runs them one after another and a file should not depend on what
 * another left behind.
 */

import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { build, preview } from 'vite';
import type { PreviewServer } from 'vite';

export interface App {
  browser: Browser;
  server: PreviewServer;
  url: string;
  /** Errors raised by any page opened with `open`. */
  pageErrors: string[];
  /** A fresh page on the app, once it has drawn a document. */
  open: (viewport: { width: number; height: number }) => Promise<Page>;
  close: () => Promise<void>;
}

export async function startApp(port: number): Promise<App> {
  await build({ logLevel: 'warn' });
  const server = await preview({
    preview: { port, strictPort: true },
    logLevel: 'warn',
  });

  const browser = await chromium.launch({
    // An escape hatch for images that ship their own Chromium rather than
    // Playwright's; unset, Playwright finds the one it installed.
    executablePath: process.env.DIFFTREK_CHROMIUM,
  });

  const url = server.resolvedUrls?.local[0] ?? `http://localhost:${port}/`;
  const pageErrors: string[] = [];

  const open = async (viewport: { width: number; height: number }) => {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(url);

    // The sample answers with a deliberate delay, so wait for a document
    // rather than for a number of milliseconds.
    await page.waitForFunction(
      () => document.querySelectorAll('[data-row]').length > 4,
      undefined,
      { timeout: 15000 },
    );

    return page;
  };

  return {
    browser,
    server,
    url,
    pageErrors,
    open,
    close: async () => {
      await browser.close();
      server.httpServer.close();
    },
  };
}
