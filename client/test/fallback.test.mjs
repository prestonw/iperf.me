import { describe, it, expect, vi } from 'vitest';
import { fetchWithFallback } from '../js/fallback.js';

describe('fetchWithFallback', () => {
  it('uses primary when ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
    const r = await fetchWithFallback('/api/d');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(true);
  });

  it('falls back on failure', async () => {
    // First call rejects, second (fallback) resolves ok
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('network fail'))
      .mockResolvedValueOnce({ ok: true });

    const r = await fetchWithFallback('/api/u', {}, ['https://fallback.test']);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(true);
  });
});
