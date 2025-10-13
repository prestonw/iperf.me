export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store, no-transform',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    // -------- Timed streaming UPLOAD (client sends data): POST /u?t=SECONDS --------
    if (url.pathname === '/u' && req.method === 'POST') {
      const tSec = Math.max(1, Math.min(parseInt(url.searchParams.get('t') || '10', 10), 60));
      let bytes = 0;
      const reader = req.body?.getReader?.();
      if (!reader) {
        return new Response(JSON.stringify({ error: 'no body' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...cors }
        });
      }
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
        }
      } catch {}
      return new Response(JSON.stringify({ ok: true, bytes, seconds: tSec }), {
        headers: { 'Content-Type': 'application/json', ...cors }
      });
    }

  // -------- Timed high-throughput DOWNLOAD: GET /d?t=SECONDS&slabMiB=64 --------
if (url.pathname === '/d' && req.method === 'GET') {
  const tSec    = Math.max(1, Math.min(parseInt(url.searchParams.get('t') || '10', 10), 60));
  const slabMiB = Math.max(1, Math.min(parseInt(url.searchParams.get('slabMiB') || '64', 10), 64));
  const deadline = Date.now() + tSec * 1000;

  // Prebuild one slab; flip one byte using a quick nonce to avoid any caching/compression weirdness
  const nonce = (url.searchParams.get('nonce') || '0').charCodeAt(0) & 255;
  const slab = new Uint8Array(slabMiB * 1024 * 1024);
  for (let i = 0; i < slab.length; i++) slab[i] = (i & 1) ? 1 : 0;
  slab[(slab.length - 1) >>> 0] = nonce ^ 1;

  // Batch many enqueues per microtask to minimize per-call overhead
  const BATCH = 128; // try 128–512; bigger = fewer callbacks, more throughput
  const stream = new ReadableStream({
    start(controller) {
      function tick() {
        if (Date.now() >= deadline) { controller.close(); return; }
        for (let i = 0; i < BATCH; i++) {
          controller.enqueue(slab);
        }
        // schedule immediately without timer clamp
        queueMicrotask(tick);
      }
      tick();
    }
  });

  return new Response(stream, {
    headers: {
      ...cors,
      'Content-Type': 'application/octet-stream',
      'X-Accel-Buffering': 'no',
      // in case proxies try to be clever:
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
    }
  });
}

    // -------- Legacy: bounded upload blob --------
    if (url.pathname === '/upload' && req.method === 'POST') {
      const MAX = 10 * 1024 * 1024; // 10 MiB per request (burst mode)
      let received = 0;
      const reader = req.body?.getReader?.();
      if (!reader) {
        return new Response(JSON.stringify({ error: 'no body' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...cors }
        });
      }
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (received > MAX) {
            return new Response(JSON.stringify({ error: 'payload too large', bytes: received }), {
              status: 413, headers: { 'Content-Type': 'application/json', ...cors }
            });
          }
        }
      } catch {}
      return new Response(JSON.stringify({ ok: true, bytes: received }), {
        headers: { 'Content-Type': 'application/json', ...cors }
      });
    }

    // -------- Legacy: bounded download --------
    if (url.pathname === '/download' && req.method === 'GET') {
      const want = Math.min(parseInt(url.searchParams.get('bytes') || '10485760', 10), 64 * 1024 * 1024);
      const slabMiB = Math.max(1, Math.min(parseInt(url.searchParams.get('slabMiB') || '32', 10), 64));
      const slab = new Uint8Array(slabMiB * 1024 * 1024);
      for (let i = 0; i < slab.length; i++) slab[i] = (i & 1) ? 1 : 0;

      const stream = new ReadableStream({
        start(controller) {
          let sent = 0;
          while (sent < want) {
            const n = Math.min(slab.length, want - sent);
            controller.enqueue(slab.subarray(0, n));
            sent += n;
          }
          controller.close();
        }
      });
      return new Response(stream, { headers: { ...cors, 'Content-Type': 'application/octet-stream' } });
    }

    // -------- Health --------
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { 'Content-Type': 'application/json', ...cors }
      });
    }

    return new Response('iperf.me worker mvp', { headers: cors });
  }
};
