export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    // Global CORS/Cache
    const CORS = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Expose-Headers': '*',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no'
    };

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    // ---------- Timed streaming UPLOAD: POST /u?t=SECONDS ----------
    // Enforce overall body cap of 100 MiB (Cloudflare request limit safety).
    if (url.pathname === '/u' && req.method === 'POST') {
      const tSec = Math.max(1, Math.min(parseInt(url.searchParams.get('t') || '10', 10), 60));
      const CAP = 100 * 1024 * 1024; // 100 MiB hard cap per request
      const reader = req.body?.getReader?.();
      if (!reader) {
        return new Response(JSON.stringify({ ok: false, error: 'no body' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...CORS }
        });
      }
      let bytes = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > CAP) {
            return new Response(JSON.stringify({ ok: false, error: 'payload too large', bytes, cap: CAP }), {
              status: 413, headers: { 'Content-Type': 'application/json', ...CORS }
            });
          }
        }
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), {
          status: 499, headers: { 'Content-Type': 'application/json', ...CORS }
        });
      }
      return new Response(JSON.stringify({ ok: true, bytes, seconds: tSec }), {
        headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    // ---------- Timed high-throughput DOWNLOAD: GET /d?t=SECONDS&slabMiB=32&batch=128 ----------
    // Backpressure-driven using ReadableStream.pull (no tight loops).
    if (url.pathname === '/d' && req.method === 'GET') {
      try {
        const tSec     = Math.max(1, Math.min(parseInt(url.searchParams.get('t') || '10', 10), 60));
        const slabMiB  = Math.max(1, Math.min(parseInt(url.searchParams.get('slabMiB') || '32', 10), 64));
        const batch    = Math.max(8, Math.min(parseInt(url.searchParams.get('batch') || '128', 10), 1024));
        const deadline = Date.now() + tSec * 1000;

        const slab = new Uint8Array(slabMiB * 1024 * 1024); // zeros

        const stream = new ReadableStream({
          pull(controller) {
            if (Date.now() >= deadline) { controller.close(); return; }
            const want = Math.max(1, Math.min(batch, (controller.desiredSize ?? batch)));
            for (let i = 0; i < want; i++) {
              controller.enqueue(slab);
              if (Date.now() >= deadline) { controller.close(); return; }
            }
          },
          cancel() { /* client aborted */ }
        });

        const headers = {
          ...CORS,
          'Content-Type': 'application/octet-stream',
          'Alt-Svc': 'h2=":443"; ma=120'
        };

        return new Response(stream, { headers });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...CORS }
        });
      }
    }

    // ---------- Legacy burst UPLOAD: POST /upload ----------
    // Small per-request cap keeps posts reliable; client now enforces total 100 MiB anyway.
    if (url.pathname === '/upload' && req.method === 'POST') {
      const MAX = 25 * 1024 * 1024; // 25 MiB per POST (tunable)
      const reader = req.body?.getReader?.();
      if (!reader) {
        return new Response(JSON.stringify({ ok: false, error: 'no body' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...CORS }
        });
      }
      let received = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (received > MAX) {
            return new Response(JSON.stringify({ ok: false, error: 'payload too large', bytes: received, cap: MAX }), {
              status: 413, headers: { 'Content-Type': 'application/json', ...CORS }
            });
          }
        }
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), {
          status: 499, headers: { 'Content-Type': 'application/json', ...CORS }
        });
      }
      return new Response(JSON.stringify({ ok: true, bytes: received }), {
        headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    // ---------- Legacy bounded DOWNLOAD ----------
    if (url.pathname === '/download' && req.method === 'GET') {
      const MAX_BYTES = 8 * 1024 * 1024 * 1024; // 8 GiB
      const want    = Math.min(parseInt(url.searchParams.get('bytes') || String(64 * 1024 * 1024), 10), MAX_BYTES);
      const slabMiB = Math.max(1, Math.min(parseInt(url.searchParams.get('slabMiB') || '32', 10), 64));
      const slab    = new Uint8Array(slabMiB * 1024 * 1024);

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
        headers: { ...CORS, 'Content-Type': 'application/octet-stream' }
      });
    }

    // ---------- Health ----------
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    return new Response('iperf.me worker mvp', { headers: CORS });
  }
};
