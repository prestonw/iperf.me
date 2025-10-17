// client/js/fallback.js
// Minimal helper used only for tests (the page has its own inlined version).
// API mirrors the inline one: pass an *array* of absolute/relative targets
// in the order you want them tried.
export async function fetchWithFallback(urlOrTargets, init = {}, fallbacks = []) {
    const targets = Array.isArray(urlOrTargets)
      ? urlOrTargets
      : [urlOrTargets, ...fallbacks];
  
    let lastErr = new Error('All fetch attempts failed');
  
    for (const t of targets) {
      try {
        const res = await fetch(t, init);
        if (res && res.ok) return res;
        lastErr = new Error(`status ${res?.status ?? 'no response'}`);
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
      }
    }
    throw lastErr;
  }
  