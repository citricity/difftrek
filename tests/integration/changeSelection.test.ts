/**
 * Picking out one logical change's bar, in a real browser.
 *
 * Choosing a change — its letter in the gutter, or its row in the contents
 * list — keeps that change's bar solid and dashes every other, without the
 * narrowing focus brings; "All logical changes" puts every bar back. The
 * pieces are unit-tested, but the choosing happens in App, which only a whole
 * running app exercises.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { startApp } from './harness.ts';
import type { App } from './harness.ts';

let app: App;
let page: Page;

/** Lane colours of the sample's two changes: A is lane 0, B lane 1. */
const LANE = { A: 'var(--note-lane-0)', B: 'var(--note-lane-1)' } as const;

/** Whether each change's drawn bars are dashed, solid, or a mix. */
async function bars(): Promise<Record<'A' | 'B', string>> {
  return page.evaluate((lanes) => {
    const strokes = [
      ...document.querySelectorAll<HTMLElement>('[data-testid="change-bars"] > div'),
    ];
    const state = (lane: string) => {
      const mine = strokes.filter(
        (stroke) => stroke.style.getPropertyValue('--note-lane') === lane,
      );
      const dashed = mine.filter((stroke) => /Unfocused/.test(stroke.className));
      if (mine.length === 0) return 'none';
      if (dashed.length === 0) return 'solid';
      return dashed.length === mine.length ? 'dashed' : 'mixed';
    };
    return { A: state(lanes.A), B: state(lanes.B) };
  }, LANE);
}

/**
 * Waits for the note dialog to close. Its element stays in the page, styled
 * `display: flex` even when closed, so "hidden" never comes; `open` is what
 * says whether it is showing.
 */
const dialogClosed = () =>
  page.waitForFunction(() => document.querySelector('dialog[open]') === null);

const openList = () =>
  page.getByRole('button', { name: 'All logical changes' }).first().click();

beforeAll(async () => {
  app = await startApp(4190);
  page = await app.open({ width: 1400, height: 900 });
}, 180000);

afterAll(async () => {
  await app?.close();
});

describe('picking out a change', () => {
  it('starts with every bar solid', async () => {
    expect(await bars()).toEqual({ A: 'solid', B: 'solid' });
  });

  it('picks out a change from its letter in the gutter', async () => {
    await page.getByRole('button', { name: 'Logical change A: starts here' }).click();
    // The letter still opens the change, as it always has.
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    await dialogClosed();

    expect(await bars()).toEqual({ A: 'solid', B: 'dashed' });
  });

  it('moves to another change from its row in the contents list', async () => {
    await openList();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Retire the hand-measured scrolling/ })
      .click();

    expect(await bars()).toEqual({ A: 'dashed', B: 'solid' });
  });

  it('does not narrow Previous/Next the way focus does', async () => {
    // Picking out B is not focusing it: the list's crosshair for B is still
    // unpressed.
    await openList();
    await expect
      .poll(() =>
        page
          .getByRole('dialog')
          .getByRole('button', { name: 'Focus logical change B' })
          .getAttribute('aria-pressed'),
      )
      .toBe('false');
    await page.keyboard.press('Escape');
    await dialogClosed();
  });

  it('puts every bar back with "All logical changes"', async () => {
    await openList();
    const all = page
      .getByRole('dialog')
      .getByRole('button', { name: /All logical changes/ });
    expect(await all.getAttribute('aria-pressed')).toBe('false');
    await all.click();

    expect(await bars()).toEqual({ A: 'solid', B: 'solid' });
  });

  it('lets Escape put every bar back too', async () => {
    await page.getByRole('button', { name: 'Logical change A: starts here' }).click();
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    await dialogClosed();
    expect(await bars()).toEqual({ A: 'solid', B: 'dashed' });

    await page.keyboard.press('Escape');
    expect(await bars()).toEqual({ A: 'solid', B: 'solid' });
  });

  it('raised no page errors', () => {
    expect(app.pageErrors).toEqual([]);
  });
});
