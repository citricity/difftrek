/**
 * Notes in a sidebar, in a real browser.
 *
 * What only a layout can show: that the diff narrows to make room rather than
 * being covered, that nothing is made inert while a note is open, that the
 * note follows the cursor, that dragging the edge resizes it and the width
 * sticks, and that Escape closes it.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { startApp } from './harness.ts';
import type { App } from './harness.ts';

let app: App;
let page: Page;

const sidebar = () => page.locator('aside');

/** The right edge of the diff's scrolling viewport, in CSS pixels. */
async function documentRight(): Promise<number> {
  return page.evaluate(() => {
    const row = document.querySelector('[data-row]');
    const viewport = row?.closest('[class*="viewport"]');
    return viewport?.getBoundingClientRect().right ?? Number.NaN;
  });
}

beforeAll(async () => {
  app = await startApp(4186);
  page = await app.open({ width: 1200, height: 700 });

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel(/AI changelog notes/).selectOption('sidebar');
  await page.getByRole('button', { name: 'Close settings' }).click();
}, 180000);

afterAll(async () => {
  await app?.close();
});

describe('notes in a sidebar', () => {
  it('opens beside the diff, which narrows to make room', async () => {
    const before = await documentRight();

    await page
      .getByRole('button', { name: /^Why this hunk exists/ })
      .first()
      .click();
    await sidebar().waitFor();

    const box = await sidebar().boundingBox();
    const after = await documentRight();

    expect(box).not.toBeNull();
    expect(after).toBeLessThan(before);
    // Beside, not over: the diff ends where the sidebar begins.
    expect(after).toBeLessThanOrEqual(Math.ceil(box!.x));
    expect(await page.locator('dialog[open]').count()).toBe(0);
  });

  it('leaves the diff usable while it is open', async () => {
    // A change's letter in the gutter swaps the note in place, without
    // closing first.
    await page
      .getByRole('button', { name: /^Logical change A/ })
      .first()
      .click();
    await sidebar()
      .getByRole('heading', { name: /Logical change/ })
      .waitFor();

    expect(await sidebar().count()).toBe(1);

    // Stepping still works — the document is not inert.
    const readout = () =>
      page.evaluate(() => document.querySelector('header')?.textContent ?? '');
    const was = await readout();
    await page.locator('[data-row]').first().click();
    await page.keyboard.press('n');
    await page.waitForFunction(
      (text) => document.querySelector('header')?.textContent !== text,
      was,
    );
    expect(await sidebar().count()).toBe(1);
  });

  it('follows the reader from hunk to hunk', async () => {
    await page
      .getByRole('button', { name: /^Why this hunk exists/ })
      .first()
      .click();
    await sidebar()
      .getByText(/reading it from the DOM/)
      .waitFor();
    const was = await sidebar().textContent();

    await page.keyboard.press('n');
    await page.waitForFunction(
      (text) => document.querySelector('aside')?.textContent !== text,
      was,
    );

    // Still a hunk note, now about a different hunk.
    expect(await sidebar().textContent()).not.toContain('reading it from the DOM');
  });

  it('is resized by dragging its edge, and holds that width', async () => {
    const edge = page.getByRole('separator', { name: 'Resize the notes sidebar' });
    const start = (await sidebar().boundingBox())!;
    const handle = (await edge.boundingBox())!;

    await page.mouse.move(handle.x + 2, handle.y + 200);
    await page.mouse.down();
    await page.mouse.move(handle.x - 60, handle.y + 200, { steps: 5 });
    await page.mouse.move(handle.x - 118, handle.y + 200, { steps: 5 });
    await page.mouse.up();

    const widened = (await sidebar().boundingBox())!;
    expect(Math.abs(widened.width - (start.width + 120))).toBeLessThanOrEqual(2);

    // The diff still ends where the sidebar begins.
    expect(await documentRight()).toBeLessThanOrEqual(Math.ceil(widened.x));

    // Closed and opened again, it comes back at the width it was left at.
    // (That the width reaches settings.json is the fixture's business and the
    // Rust side's; the example backend forgets on reload, so this window is as
    // far as a browser test can follow it.)
    await page.keyboard.press('Escape');
    await sidebar().waitFor({ state: 'detached' });
    await page
      .getByRole('button', { name: /^Why this hunk exists/ })
      .first()
      .click();
    await sidebar().waitFor();
    expect(Math.round((await sidebar().boundingBox())!.width)).toBe(
      Math.round(widened.width),
    );
  });

  it('closes on Escape and gives the diff its width back', async () => {
    await page.keyboard.press('Escape');
    await sidebar().waitFor({ state: 'detached' });

    expect(await documentRight()).toBeGreaterThan(1100);
    expect(app.pageErrors).toEqual([]);
  });
});
