import { describe, expect, it } from 'vitest';
import { dropScale, isWindowsWebview } from './dropPosition.ts';

describe('dropScale', () => {
  it('leaves a Retina Mac’s points alone at 100%', () => {
    // 1280 points wide on a 2x display: 2560 device pixels, 1280 CSS pixels.
    expect(
      dropScale({
        physicalWidth: 2560,
        scaleFactor: 2,
        cssWidth: 1280,
        windows: false,
      }),
    ).toBe(1);
  });

  it('divides Windows device pixels by the scale factor', () => {
    expect(
      dropScale({
        physicalWidth: 1920,
        scaleFactor: 1.5,
        cssWidth: 1280,
        windows: true,
      }),
    ).toBeCloseTo(1280 / 1920);
  });

  it('allows for the interface zoom', () => {
    // Zoomed to 125%: the same 1280 points hold 1024 CSS pixels.
    expect(
      dropScale({
        physicalWidth: 2560,
        scaleFactor: 2,
        cssWidth: 1024,
        windows: false,
      }),
    ).toBeCloseTo(0.8);
  });

  it('falls back to no scaling for a window with no width', () => {
    expect(
      dropScale({ physicalWidth: 0, scaleFactor: 2, cssWidth: 1280, windows: false }),
    ).toBe(1);
  });
});

describe('isWindowsWebview', () => {
  it('recognises WebView2 and nothing else', () => {
    expect(
      isWindowsWebview(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
      ),
    ).toBe(true);
    expect(
      isWindowsWebview(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)',
      ),
    ).toBe(false);
    expect(
      isWindowsWebview('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15'),
    ).toBe(false);
  });
});
