import { describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args) as unknown,
}));

const { invokeExtension } = await import('./backend.ts');

describe('invokeExtension', () => {
  it('refuses a command name that would address another plugin', async () => {
    await expect(
      invokeExtension('dir-compare', 'x|plugin:dialog|open'),
    ).rejects.toThrow('cannot exist');
    await expect(invokeExtension('dir-compare', 'Open')).rejects.toThrow(
      'cannot exist',
    );
    expect(invoke).not.toHaveBeenCalled();
  });
});
