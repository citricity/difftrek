/**
 * Notes in a bar above the diff, in a real browser, in the split view it
 * exists for.
 *
 * What only a layout can show: that the bar sits under the change bar and
 * above the document, that it takes about a fifth of the window and scrolls
 * within that, and that the diff keeps its full width — the whole point, since
 * a sidebar would squeeze both of the split view's panes.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { startApp } from './harness.ts';
import type { App } from './harness.ts';

const WIDTH = 1200;
const HEIGHT = 800;

let app: App;
let page: Page;

const bar = () => page.locator('aside');

/** The diff's scrolling viewport, as drawn. */
async function documentBox(): Promise<{ top: number; width: number }> {
  return page.evaluate(() => {
    const row = document.querySelector('[data-row]');
    const box = row?.closest('[class*="viewport"]')?.getBoundingClientRect();
    return { top: box?.top ?? Number.NaN, width: box?.width ?? Number.NaN };
  });
}

beforeAll(async () => {
  app = await startApp(4188);
  page = await app.open({ width: WIDTH, height: HEIGHT });

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel(/AI changelog notes/).selectOption('topbar');
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.getByRole('button', { name: 'Split view' }).click();
}, 180000);

afterAll(async () => {
  await app?.close();
});

describe('notes in a bar above the diff', () => {
  it('opens under the change bar, above a diff that keeps its full width', async () => {
    const before = await documentBox();

    await page
      .getByRole('button', { name: /^Why this hunk exists/ })
      .first()
      .click();
    await bar().waitFor();

    const box = (await bar().boundingBox())!;
    const after = await documentBox();

    // Under the toolbar and the change bar, not over them.
    const changeBarBottom = await page.evaluate(() => {
      const label = [...document.querySelectorAll('span')].find((span) =>
        /^Change /.test(span.textContent ?? ''),
      );
      return label?.parentElement?.closest('div')?.getBoundingClientRect().bottom ?? 0;
    });
    expect(box.y).toBeGreaterThanOrEqual(changeBarBottom - 1);

    // Above the document, which moves down to make room but keeps its width.
    expect(after.top).toBeGreaterThanOrEqual(Math.floor(box.y + box.height));
    expect(after.top).toBeGreaterThan(before.top);
    expect(after.width).toBe(before.width);
    expect(await page.locator('dialog[open]').count()).toBe(0);
  });

  it('takes about a fifth of the window', async () => {
    const box = (await bar().boundingBox())!;
    expect(Math.abs(box.height - HEIGHT * 0.2)).toBeLessThanOrEqual(2);
  });

  it('scrolls a note too long for it, within itself', async () => {
    // No sample note is long enough to overflow a fifth of this window, so
    // one is lengthened in place: the bar must clip and scroll it rather than
    // grow to fit.
    const body = await page.evaluate(() => {
      const aside = document.querySelector('aside');
      const scroller = [...(aside?.querySelectorAll('div') ?? [])].find(
        (element) => getComputedStyle(element).overflowY === 'auto',
      );
      if (scroller === undefined) return null;
      const filler = document.createElement('p');
      filler.style.height = '2000px';
      filler.style.flexShrink = '0';
      scroller.append(filler);
      scroller.scrollTop = 500;
      const result = {
        scrollTop: scroller.scrollTop,
        asideHeight: aside!.clientHeight,
      };
      filler.remove();
      return result;
    });

    expect(body).not.toBeNull();
    expect(body!.scrollTop).toBe(500);
    expect(Math.abs(body!.asideHeight - HEIGHT * 0.2)).toBeLessThanOrEqual(2);
  });

  it('follows the reader, and closes on Escape to give the height back', async () => {
    const was = await bar().textContent();
    // The cursor starts on nothing, so the first press lands on the hunk the
    // note is already about; the second moves on from it.
    await page.keyboard.press('n');
    await page.keyboard.press('n');
    await page.waitForFunction(
      (text) => document.querySelector('aside')?.textContent !== text,
      was,
    );

    await page.keyboard.press('Escape');
    await bar().waitFor({ state: 'detached' });
    expect(app.pageErrors).toEqual([]);
  });
});
