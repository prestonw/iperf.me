export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    const CORS = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Expose-Headers': '*',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    };

    // Allow /api/* as an alias for /*.
    const path = url.pathname.replace(/^\/api(\/|$)/, '/');

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    // ------------------------ Timed streaming UPLOAD: POST /u?t=SECONDS ------------------------
    if (path === '/u' && req.method === 'POST') {
      const tSec = Math.max(1, Math.min(parseInt(url.searchParams.get('t') || '10', 10), 60));
      const reader = req.body?.getReader?.();
      if (!reader) {
        return new Response(JSON.stringify({ ok: false, error: 'no body' }), {
          status: 400,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
      let bytes = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
        }
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), {
          status: 499,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true, bytes, seconds: tSec }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ------------- Timed high-throughput DOWNLOAD: GET /d?t=SECONDS&slabMiB=32&batch=128 -------------
    if (path === '/d' && req.method === 'GET') {
      try {
        const tSec = Math.max(1, Math.min(parseInt(url.searchParams.get('t') || '10', 10), 60));
        const slabMiB = Math.max(1, Math.min(parseInt(url.searchParams.get('slabMiB') || '32', 10), 64));
        const batch = Math.max(16, Math.min(parseInt(url.searchParams.get('batch') || '128', 10), 1024));
        const deadline = Date.now() + tSec * 1000;

        const slab = new Uint8Array(slabMiB * 1024 * 1024); // zeros

        const { readable, writable } = new TransformStream();
        (async () => {
          const w = writable.getWriter();
          try {
            while (Date.now() < deadline) {
              for (let i = 0; i < batch; i++) {
                await w.ready;
                await w.write(slab);
                if (Date.now() >= deadline) break;
              }
              // Small cooperative yield for CPU watchdogs; ignore if not present
              try { await scheduler.yield?.(); } catch {}
            }
          } catch {}
          finally {
            try { await w.close(); } catch {}
          }
        })();

        return new Response(readable, {
          headers: {
            ...CORS,
            'Content-Type': 'application/octet-stream',
            'Cache-Control': 'no-store, no-transform',
          },
        });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), {
          status: 500,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
    }

    // --------------------- Burst UPLOAD fallback: POST /upload (10 MiB cap) ---------------------
    if (path === '/upload' && req.method === 'POST') {
      const MAX = 10 * 1024 * 1024;
      const reader = req.body?.getReader?.();
      if (!reader) {
        return new Response(JSON.stringify({ ok: false, error: 'no body' }), {
          status: 400,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
      let received = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (received > MAX) {
            return new Response(JSON.stringify({ ok: false, error: 'payload too large', bytes: received }), {
              status: 413,
              headers: { ...CORS, 'Content-Type': 'application/json' },
            });
          }
        }
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), {
          status: 499,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true, bytes: received }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // --------------- Bounded DOWNLOAD fallback: GET /download?bytes=...&slabMiB=32 ----------------
    if (path === '/download' && req.method === 'GET') {
      const MAX_BYTES = 8 * 1024 * 1024 * 1024;
      const want = Math.min(parseInt(url.searchParams.get('bytes') || String(64 * 1024 * 1024), 10), MAX_BYTES);
      const slabMiB = Math.max(1, Math.min(parseInt(url.searchParams.get('slabMiB') || '32', 10), 64));
      const slab = new Uint8Array(slabMiB * 1024 * 1024);

      const { readable, writable } = new TransformStream();
      (async () => {
        const w = writable.getWriter();
        try {
          let sent = 0;
          while (sent < want) {
            await w.ready;
            const n = Math.min(slab.length, want - sent);
            await w.write(n === slab.length ? slab : slab.subarray(0, n));
            sent += n;
          }
        } catch {}
        finally {
          try { await w.close(); } catch {}
        }
      })();

      return new Response(readable, {
        headers: {
          ...CORS,
          'Content-Type': 'application/octet-stream',
          'Cache-Control': 'no-store, no-transform',
        },
      });
    }

    // -------------------------------- Health --------------------------------
    if (path === '/health') {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response('iperf.me worker mvp', { headers: { ...CORS, 'Content-Type': 'text/plain;charset=UTF-8' } });
  }
};
