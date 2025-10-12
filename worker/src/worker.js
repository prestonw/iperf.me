export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    // CORS + cache controls
    const cors = {
      'Access-Control-Allow-Origin': '*',        // lock to https://iperf.me later
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS,HEAD',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method === 'HEAD' && url.pathname === '/health') {
      return new Response(null, { headers: cors });
    }

    // Limits (tune as you wish)
    const MAX_BYTES = 64 * 1024 * 1024;   // 64 MiB
    const CHUNK = 64 * 1024;              // 64 KiB

    // ---- Upload: stream & count (no buffering) ----
    if (url.pathname === '/upload' && req.method === 'POST') {
      const t0 = Date.now();
      let total = 0;

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
          // drain remainder quickly to avoid client hang
          reader.releaseLock();
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

    // ---- Download: generate random bytes in chunks ----
    if (url.pathname === '/download' && req.method === 'GET') {
      const want = Number.parseInt(url.searchParams.get('bytes') || '10485760', 10);
      const bytes = Number.isFinite(want) ? Math.min(Math.max(want, 1), MAX_BYTES) : 10 * 1024 * 1024;
      const chunks = Math.ceil(bytes / CHUNK);

      const stream = new ReadableStream({
        start(controller) {
          let sent = 0;
          for (let i = 0; i < chunks; i++) {
            const size = Math.min(CHUNK, bytes - sent);
            const buf = new Uint8Array(size);
            // Workers env is fine with big fills, but chunk anyway for parity
            crypto.getRandomValues(buf);
            controller.enqueue(buf);
            sent += size;
          }
          controller.close();
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': 'inline; filename="payload.bin"',
          ...cors
        }
      });
    }

    // ---- Health & info ----
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { 'Content-Type': 'application/json', ...cors }
      });
    }
    if (url.pathname === '/version') {
      return new Response(JSON.stringify({ name: 'iperf.me worker mvp', version: 1 }), {
        headers: { 'Content-Type': 'application/json', ...cors }
      });
    }

    // Root
    return new Response('iperf.me worker mvp • /upload (POST), /download?bytes=, /health, /version', { headers: cors });
  }
}
