export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    // CORS + no-store for everything
    const baseHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
    };

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: baseHeaders });
    }

    // -------- /upload (POST): stream & count bytes --------
    if (url.pathname === '/upload' && req.method === 'POST') {
      // Keep conservative per-request cap for reliability on all plans/browsers.
      const MAX = 10 * 1024 * 1024; // 10 MiB
      let received = 0;
      const t0 = Date.now();

      if (!req.body) {
        return new Response(JSON.stringify({ error: 'no body' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...baseHeaders },
        });
      }

      try {
        const reader = req.body.getReader();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (received > MAX) {
            return new Response(
              JSON.stringify({ error: 'payload too large', bytes: received }),
              { status: 413, headers: { 'Content-Type': 'application/json', ...baseHeaders } }
            );
          }
        }
      } catch (e) {
        return new Response(JSON.stringify({ error: 'stream read failed', message: String(e) }), {
          status: 499,
          headers: { 'Content-Type': 'application/json', ...baseHeaders },
        });
      }

      const ms = Date.now() - t0;
      return new Response(JSON.stringify({ ms, bytes: received }), {
        headers: { 'Content-Type': 'application/json', ...baseHeaders },
      });
    }

    // -------- /download (GET): stream flip/noise pattern --------
    if (url.pathname === '/download' && req.method === 'GET') {
      const want = Math.min(parseInt(url.searchParams.get('bytes') || '10485760', 10), 64 * 1024 * 1024); // ≤ 64 MiB
      const slabMiB = Math.min(Math.max(parseInt(url.searchParams.get('slabMiB') || '8', 10), 1), 64);
      const slab = slabMiB * 1024 * 1024;

      // Build one slab once (0/1 flip pattern) with a small nonce to avoid caching.
      const seed = (url.searchParams.get('nonce') || '0').charCodeAt(0) & 1;
      const buf = new Uint8Array(slab);
      for (let i = 0; i < slab; i++) buf[i] = ((i + seed) & 1) ? 1 : 0;

      const stream = new ReadableStream({
        start(controller) {
          let sent = 0;
          while (sent < want) {
            const n = Math.min(slab, want - sent);
            controller.enqueue(buf.subarray(0, n));
            sent += n;
          }
          controller.close();
        }
      });

      return new Response(stream, {
        headers: { ...baseHeaders, 'Content-Type': 'application/octet-stream' }
      });
    }

    // -------- /health --------
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { 'Content-Type': 'application/json', ...baseHeaders },
      });
    }

    return new Response('iperf.me worker mvp', { headers: baseHeaders });
  }
};
