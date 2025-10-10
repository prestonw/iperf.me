export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    // Basic CORS for the MVP
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    if (url.pathname === '/upload' && req.method === 'POST') {
      // Read & discard body to measure client upload
      const start = Date.now();
      // Limit payload to protect free tier
      const max = 64 * 1024 * 1024; // 64 MB cap
      const buf = await req.arrayBuffer();
      if (buf.byteLength > max) {
        return new Response(JSON.stringify({ error: 'payload too large' }), { status: 413, headers: { 'Content-Type': 'application/json', ...cors } });
      }
      const ms = Date.now() - start;
      return new Response(JSON.stringify({ ms, bytes: buf.byteLength }), { headers: { 'Content-Type': 'application/json', ...cors } });
    }

    if (url.pathname === '/download' && req.method === 'GET') {
      // Generate random bytes for download test (default 10 MB)
      const bytes = Math.min(parseInt(url.searchParams.get('bytes') || '10485760', 10), 64*1024*1024);
      const chunk = 64 * 1024;
      const chunks = Math.ceil(bytes / chunk);
      const stream = new ReadableStream({
        start(controller) {
          let sent = 0;
          for (let i=0;i<chunks;i++) {
            const size = Math.min(chunk, bytes - sent);
            const buf = new Uint8Array(size);
            crypto.getRandomValues(buf);
            controller.enqueue(buf);
            sent += size;
          }
          controller.close();
        }
      });
      return new Response(stream, { headers: { 'Content-Type': 'application/octet-stream', ...cors } });
    }

    // Health
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), { headers: { 'Content-Type': 'application/json', ...cors } });
    }

    return new Response('iperf.me worker mvp', { headers: cors });
  }
}
