/**
 * Walking a logical change from the change bar, in a real browser.
 *
 * The unit tests cover the pieces — where the arrows go, and that a hunk in an
 * unread file is loaded before the cursor lands on it — but not the two
 * together, which is where the bar can misbehave: between the step and the
 * diff arriving, the cursor sits on a file header that belongs to no change.
 *
 * The window is kept short on purpose. The sample loads its first three files
 * at start and prefetches two either side of the one in view, so with only the
 * top of the document visible, `src/legacy/removed.ts` — the fifth file, and
 * change B's last hunk — has not been read when the walk reaches for it.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { startApp } from './harness.ts';
import type { App } from './harness.ts';

let app: App;
let page: Page;

/** The bar's two counters, as the reader sees them. */
async function counters(): Promise<{ change: string; hunk: string }> {
  return page.evaluate(() => {
    const spans = [...document.querySelectorAll('span')];
    const read = (word: string) =>
      spans
        .map((span) => span.textContent?.replace(/\s+/g, ' ').trim() ?? '')
        .find((text) => text.startsWith(`${word} `) && text.includes('/')) ?? '';
    return { change: read('Change'), hunk: read('Hunk') };
  });
}

async function waitForHunk(text: string): Promise<void> {
  await page.waitForFunction(
    (expected) =>
      [...document.querySelectorAll('span')].some(
        (span) => span.textContent?.replace(/\s+/g, ' ').trim() === expected,
      ),
    text,
  );
}

const nextHunk = () => page.getByRole('button', { name: 'Next hunk in this change' });
const previousHunk = () =>
  page.getByRole('button', { name: 'Previous hunk in this change' });

beforeAll(async () => {
  app = await startApp(4184);
  page = await app.open({ width: 1400, height: 420 });
}, 180000);

afterAll(async () => {
  await app?.close();
});

describe('walking a change from the bar', () => {
  it('enters the first change at its first hunk', async () => {
    await page.keyboard.press('Shift+N');
    await waitForHunk('Hunk 1 / 3');

    expect(await counters()).toEqual({ change: 'Change 1 / 2', hunk: 'Hunk 1 / 3' });
    expect(await previousHunk().isDisabled()).toBe(true);
  });

  it('stops at the end of the change rather than carrying on', async () => {
    await page.keyboard.press(']');
    await waitForHunk('Hunk 2 / 3');
    await page.keyboard.press(']');
    await waitForHunk('Hunk 3 / 3');

    expect(await nextHunk().isDisabled()).toBe(true);

    // The key does nothing either: still the first change, still its end.
    await page.keyboard.press(']');
    await page.waitForTimeout(300);
    expect(await counters()).toEqual({ change: 'Change 1 / 2', hunk: 'Hunk 3 / 3' });
  });

  it('keeps the change it was told to walk on a hunk two changes share', async () => {
    await page.keyboard.press('Shift+N');
    await waitForHunk('Hunk 1 / 3');
    expect((await counters()).change).toBe('Change 2 / 2');

    // src/lib/navigation.ts:hunk:0 belongs to both changes. Stepped onto from
    // B, the bar must go on naming B, or the walk would jump back into A.
    await page.keyboard.press(']');
    await waitForHunk('Hunk 2 / 3');
    expect((await counters()).change).toBe('Change 2 / 2');
  });

  it('reaches a hunk in a file not yet read, without the bar going blank', async () => {
    // Everything the bar and the document show while the step lands.
    await page.evaluate(() => {
      const seen = { bars: [] as string[], loading: false };
      (window as unknown as { seen: typeof seen }).seen = seen;

      const bar = document.querySelector(
        '[aria-label="All logical changes"]',
      )?.parentElement;
      const record = () => {
        seen.bars.push(bar?.textContent ?? '');
        if (document.querySelector('[aria-label="Loading src/legacy/removed.ts"]')) {
          seen.loading = true;
        }
      };

      new MutationObserver(record).observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      });
    });

    await page.keyboard.press(']');
    await waitForHunk('Hunk 3 / 3');
    await page.getByText('export default legacy;').waitFor();

    const seen = await page.evaluate(
      () => (window as unknown as { seen: { bars: string[]; loading: boolean } }).seen,
    );

    // The file really was unread: its placeholder was drawn on the way.
    expect(seen.loading).toBe(true);
    // And through all of it the bar named change B, never nothing.
    expect(seen.bars.length).toBeGreaterThan(0);
    for (const text of seen.bars) {
      expect(text).toContain('Change 2 / 2');
    }

    expect(await nextHunk().isDisabled()).toBe(true);
    expect(await previousHunk().isDisabled()).toBe(false);
  });

  it('walks back the way it came', async () => {
    await page.keyboard.press('[');
    await waitForHunk('Hunk 2 / 3');
    expect((await counters()).change).toBe('Change 2 / 2');
  });
});

describe('picking a change from the gutter', () => {
  // Its own page: these are about where a click lands from a known start,
  // which the walk above has moved on from.
  beforeAll(async () => {
    page = await app.open({ width: 1400, height: 600 });
    // A click on the document, so the keys reach this page rather than the
    // one the tests above left open.
    await page.locator('[data-row]').first().click();
  }, 60000);

  it('takes the reader to where that change starts', async () => {
    await page.keyboard.press('Shift+N');
    await waitForHunk('Hunk 1 / 3');
    expect((await counters()).change).toBe('Change 1 / 2');

    // A letter for the other change, on a hunk the reader is not on: the
    // cursor goes to where that change starts rather than staying behind.
    await page
      .getByRole('button', { name: /^Logical change B/ })
      .first()
      .click();

    await page.waitForFunction(() =>
      [...document.querySelectorAll('span')].some((span) =>
        /^Change 2 \/ 2$/.test(span.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
      ),
    );
    expect((await counters()).hunk).toBe('Hunk 1 / 3');
  });

  // The other half of the rule — picking a change that already covers the
  // hunk in view leaves the reader where they are — is pinned by
  // `entryPointOf`'s unit tests: a marker for the current hunk sits under the
  // sticky header after a reveal, which a click in a virtualised list cannot
  // reach reliably.
});

describe('the page itself', () => {
  it('raises no errors while all that happens', () => {
    expect(app.pageErrors).toEqual([]);
  });
});
