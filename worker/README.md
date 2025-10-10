# Worker (Cloudflare)

Minimal endpoints:
- `POST /upload`  — reads and discards body, returns elapsed ms and bytes.
- `GET  /download?bytes=N` — streams N random bytes (capped to 64 MB).

## Deploy
```bash
npm i -g wrangler
wrangler login
wrangler publish
```
