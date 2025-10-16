export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    // Global CORS/Cache controls
    const CORS = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Expose-Headers": "*",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    // Normalize route: support both "/u" and "/api/u" (same for /d, etc.)
    let path = url.pathname;
    if (path === "/api") path = "/"; // handle bare /api
    if (path.startsWith("/api/")) path = path.slice(4); // "/api/xxx" -> "/xxx"

    // ------------------------ Timed streaming UPLOAD: POST /u?t=SECONDS ------------------------
    if (path === "/u" && req.method === "POST") {
      const tSec = Math.max(1, Math.min(parseInt(url.searchParams.get("t") || "10", 10), 60));
      const reader = req.body?.getReader?.();
      if (!reader) {
        return new Response(JSON.stringify({ ok: false, error: "no body" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...CORS },
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
          headers: { "Content-Type": "application/json", ...CORS },
        });
      }
      return new Response(JSON.stringify({ ok: true, bytes, seconds: tSec }), {
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    // ------------- Timed high-throughput DOWNLOAD: GET /d?t=SECONDS&slabMiB=32&batch=128 -------------
    // Backpressure-friendly writer loop
    if (path === "/d" && req.method === "GET") {
      try {
        const tSec = Math.max(1, Math.min(parseInt(url.searchParams.get("t") || "10", 10), 60));
        const slabMiB = Math.max(1, Math.min(parseInt(url.searchParams.get("slabMiB") || "32", 10), 64));
        const batch = Math.max(16, Math.min(parseInt(url.searchParams.get("batch") || "128", 10), 1024));
        const deadline = Date.now() + tSec * 1000;

        const slab = new Uint8Array(slabMiB * 1024 * 1024); // zeros

        const { readable, writable } = new TransformStream();
        (async () => {
          const writer = writable.getWriter();
          try {
            while (Date.now() < deadline) {
              for (let i = 0; i < batch; i++) {
                await writer.ready;       // yield to backpressure
                await writer.write(slab); // write prebuilt slab
                if (Date.now() >= deadline) break;
              }
              // Cooperative yield to stay under CPU watchdog
              await scheduler.yield?.();
            }
          } catch {
            // client aborted — ignore
          } finally {
            try { await writer.close(); } catch {}
          }
        })();

        const headers = {
          ...CORS,
          "Content-Type": "application/octet-stream",
          // Optional: hint HTTP/2 if h3 is flaky in some clients
          "Alt-Svc": "h2=\":443\"; ma=60",
        };
        return new Response(readable, { headers });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...CORS },
        });
      }
    }

    // --------------------- Burst UPLOAD (legacy fallback): POST /upload ---------------------
    if (path === "/upload" && req.method === "POST") {
      const MAX = 10 * 1024 * 1024; // 10 MiB per request
      const reader = req.body?.getReader?.();
      if (!reader) {
        return new Response(JSON.stringify({ ok: false, error: "no body" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...CORS },
        });
      }
      let received = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (received > MAX) {
            return new Response(
              JSON.stringify({ ok: false, error: "payload too large", bytes: received }),
              { status: 413, headers: { "Content-Type": "application/json", ...CORS } },
            );
          }
        }
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), {
          status: 499,
          headers: { "Content-Type": "application/json", ...CORS },
        });
      }
      return new Response(JSON.stringify({ ok: true, bytes: received }), {
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    // --------------- Bounded DOWNLOAD (legacy): GET /download?bytes=...&slabMiB=32 ---------------
    if (path === "/download" && req.method === "GET") {
      const MAX_BYTES = 8 * 1024 * 1024 * 1024; // 8 GiB ceiling
      const want = Math.min(parseInt(url.searchParams.get("bytes") || String(64 * 1024 * 1024), 10), MAX_BYTES);
      const slabMiB = Math.max(1, Math.min(parseInt(url.searchParams.get("slabMiB") || "32", 10), 64));
      const slab = new Uint8Array(slabMiB * 1024 * 1024); // zeros

      const { readable, writable } = new TransformStream();
      (async () => {
        const writer = writable.getWriter();
        try {
          let sent = 0;
          while (sent < want) {
            const n = Math.min(slab.length, want - sent);
            await writer.ready;
            await writer.write(n === slab.length ? slab : slab.subarray(0, n));
            sent += n;
          }
        } finally {
          try { await writer.close(); } catch {}
        }
      })();

      return new Response(readable, {
        headers: {
          ...CORS,
          "Content-Type": "application/octet-stream",
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0, no-transform",
        },
      });
    }

    // -------------------------------- Health --------------------------------
    if (path === "/health") {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    // Fallback: still include CORS
    return new Response("iperf.me worker mvp", { headers: CORS });
  },
};
