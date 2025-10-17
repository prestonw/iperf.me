// client/test/fallback.test.mjs
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWithFallback } from '../js/fallback.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchWithFallback', () => {
  it('uses primary when ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    const r = await fetchWithFallback(['/api/d']);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith('/api/d', {});
    expect(r.ok).toBe(true);
  });

  it('falls back on failure', async () => {
    // First call rejects, second resolves ok
    global.fetch = vi.fn()
      .mockRejectedValueOnce(new Error('network fail'))
      .mockResolvedValueOnce({ ok: true });

    const r = await fetchWithFallback(['/api/u', 'https://fallback.test/api/u']);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][0]).toBe('/api/u');
    expect(global.fetch.mock.calls[1][0]).toBe('https://fallback.test/api/u');
    expect(r.ok).toBe(true);
  });
});
