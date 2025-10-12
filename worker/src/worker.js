export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const cors = {
      'Access-Control-Allow-Origin': '*',   // tighten to https://iperf.me later
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS,HEAD',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
      'Pragma': 'no-cache'
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method === 'HEAD' && url.pathname === '/health') return new Response(null, { headers: cors });

    // Server-side safety limits (per request)
    const MAX_BYTES = 64 * 1024 * 1024; // 64 MiB per request
    const MAX_SLAB  = 8  * 1024 * 1024; // 8 MiB max slab size

    // ---- Upload: stream count (no buffering) ----
    if (url.pathname === '/upload' && req.method === 'POST') {
      let total = 0;
      const t0 = Date.now();
      if (!req.body) {
        return new Response(JSON.stringify({ error: 'no body' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...cors }
        });
      }
      const reader = req.body.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BYTES) {
          try { reader.cancel(); } catch {}
          return new Response(JSON.stringify({ error: 'payload too large', bytes: total }), {
            status: 413, headers: { 'Content-Type': 'application/json', ...cors }
          });
        }
      }
      const ms = Date.now() - t0;
      return new Response(JSON.stringify({ ms, bytes: total }), {
        headers: { 'Content-Type': 'application/json', ...cors }
      });
    }

    // ---- Download: slab replay with optional bit-flip ----
    if (url.pathname === '/download' && req.method === 'GET') {
      const want   = Number.parseInt(url.searchParams.get('bytes') || '10485760', 10);
      const bytes  = Number.isFinite(want) ? Math.min(Math.max(want, 1), MAX_BYTES) : 10 * 1024 * 1024;
      const pattern = (url.searchParams.get('pattern') || 'zeros').toLowerCase(); // zeros | rand | flip
      const slabMiB = Math.max(1, Math.min(MAX_SLAB / (1024*1024), Number.parseInt(url.searchParams.get('slabMiB') || '1', 10)));
      const SLAB = slabMiB * 1024 * 1024;

      // Build base slab once
      const base = new Uint8Array(SLAB);                  // zeros by default
      if (pattern === 'rand') crypto.getRandomValues(base);

      let remaining = bytes;
      let flipIndex = 0;

      const stream = new ReadableStream({
        pull(controller) {
          if (remaining <= 0) { controller.close(); return; }
          const n = Math.min(remaining, SLAB);

          if (pattern === 'flip') {
            // Create a view that changes exactly one byte per chunk
            const chunk = base.slice(0, n);               // copy
            // Toggle one byte: XOR with 0x01 (fast & deterministic)
            if (flipIndex % 256 === 0) chunk[0] ^= 0x01;
            flipIndex++;
            controller.enqueue(chunk);
          } else {
            // zeros or rand base slab replay
            controller.enqueue(base.subarray(0, n));
          }

          remaining -= n;
        }
      });

      // Add a nonce to discourage any middlebox caching (even though Workers aren't cached by default)
      const nonce = url.searchParams.get('nonce') || crypto.randomUUID?.() || String(Date.now());

      return new Response(stream, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': 'inline; filename="payload.bin"',
          'X-Nonce': nonce,
          ...cors
        }
      });
    }

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { 'Content-Type': 'application/json', ...cors }
      });
    }

    return new Response('iperf.me worker mvp • /upload (POST), /download?bytes=&pattern=zeros|rand|flip&slabMiB=1..8, /health', { headers: cors });
  }
}