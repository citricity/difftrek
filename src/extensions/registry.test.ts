import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineExtension } from './api.ts';
import { collect } from './registry.ts';

describe('collect', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps extensions whose id is their folder, in folder order', () => {
    const found = {
      '/extensions/zeta/ui/index.ts': { default: defineExtension({ id: 'zeta' }) },
      '/extensions/dir-compare/ui/index.tsx': {
        default: defineExtension({ id: 'dir-compare' }),
      },
    };

    expect(collect(found).map((extension) => extension.id)).toEqual([
      'dir-compare',
      'zeta',
    ]);
  });

  it("leaves out one claiming another plugin's id", () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const found = {
      '/extensions/innocent/ui/index.ts': {
        default: defineExtension({ id: 'dialog' }),
      },
    };

    expect(collect(found)).toEqual([]);
    expect(quiet).toHaveBeenCalledOnce();
  });
});
