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

// -------- Timed high-throughput DOWNLOAD: GET /d?t=SECONDS&slabMiB=32&batch=128 --------
if (url.pathname === '/d' && req.method === 'GET') {
  try {
    const tSec     = Math.max(1, Math.min(parseInt(url.searchParams.get('t') || '10', 10), 60));
    const slabMiB  = Math.max(1, Math.min(parseInt(url.searchParams.get('slabMiB') || '32', 10), 64));
    const BATCH    = Math.max(16, Math.min(parseInt(url.searchParams.get('batch') || '128', 10), 1024));
    const deadline = Date.now() + tSec * 1000;

    // Build slab; flip one byte to defeat compression/caching heuristics
    const nonce = (url.searchParams.get('nonce') || '0').charCodeAt(0) & 255;
    const slab  = new Uint8Array(slabMiB * 1024 * 1024);
    for (let i = 0; i < slab.length; i++) slab[i] = (i & 1) ? 1 : 0;
    slab[slab.length - 1] ^= nonce;

    const stream = new ReadableStream({
      start(controller) {
        let iter = 0;
        function tick() {
          if (Date.now() >= deadline) { controller.close(); return; }
          for (let i = 0; i < BATCH; i++) controller.enqueue(slab);
          // Yield lightly every ~8 ticks to avoid CPU watchdogs/503 under load
          if ((++iter % 8) === 0) setTimeout(tick, 0);
          else queueMicrotask(tick);
        }
        tick();
      }
    });

    return new Response(stream, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Expose-Headers': '*',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, no-transform',
        'X-Accel-Buffering': 'no',
        'Content-Type': 'application/octet-stream'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error: String(e) }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }
}

  return new Response(stream, {
    headers: {
      ...cors,
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, no-transform',
      'X-Accel-Buffering': 'no'
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

    // -------- Legacy: bounded download (now with large max) --------
if (url.pathname === '/download' && req.method === 'GET') {
  const MAX_BYTES = 8 * 1024 * 1024 * 1024; // 8 GiB ceiling
  const want = Math.min(parseInt(url.searchParams.get('bytes') || String(64 * 1024 * 1024), 10), MAX_BYTES);
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

  return new Response(stream, {
    headers: { 
      ...cors, 
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'X-Accel-Buffering': 'no'
    }
  });
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
