/**
 * Notes in a sidebar, in a real browser.
 *
 * What only a layout can show: that the diff narrows to make room rather than
 * being covered, that nothing is made inert while a note is open, and that
 * Escape closes the sidebar before it clears anything else.
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

  it('closes on Escape and gives the diff its width back', async () => {
    await page.keyboard.press('Escape');
    await sidebar().waitFor({ state: 'detached' });

    expect(await documentRight()).toBeGreaterThan(1100);
    expect(app.pageErrors).toEqual([]);
  });
});
