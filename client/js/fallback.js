export async function fetchWithFallback(url, init = {}, fallbacks = []) {
    // Try primary
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;
    } catch {}
  
    // Try fallbacks in order
    for (const base of fallbacks) {
      const u = new URL(url, base).toString();
      try {
        const res = await fetch(u, init);
        if (res.ok) return res;
      } catch {}
    }
  
    // If nothing worked, throw the last failure
    throw new Error('All fetch attempts failed');
  }
  