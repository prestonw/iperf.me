// client/js/fallback.js
/**
 * Supports BOTH call styles:
 * 1) fetchWithFallback(['/api/u', 'https://fallback.example.com/api/u'], init)
 * 2) fetchWithFallback('/api/u', init, ['https://fallback.example.com/api/u'])
 */
export async function fetchWithFallback(targetsOrUrl, init = {}, fallbacks) {
  // Normalize to an ordered list of targets
  let targets = [];
  if (Array.isArray(targetsOrUrl)) {
    targets = targetsOrUrl;
  } else {
    targets = [targetsOrUrl];
    if (Array.isArray(fallbacks)) {
      targets.push(...fallbacks);
    } else if (fallbacks) {
      targets.push(fallbacks);
    }
  }

  let lastErr = new Error('All fetch attempts failed');

  for (const t of targets) {
    try {
      const res = await fetch(t, init);
      if (res.ok) return res;
      // non-2xx: keep trying fallbacks
      lastErr = new Error(`status ${res.status}`);
    } catch (e) {
      // network error: try next fallback
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr;
}
