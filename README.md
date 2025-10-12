[![Deploy to Cloudflare](https://github.com/prestonw/iperf.me/actions/workflows/deploy.yml/badge.svg)](https://github.com/prestonw/iperf.me/actions/workflows/deploy.yml)

# iperf.me — Minimal MVP (Edge-friendly, iPerf-style)

This is a one-hour MVP for a transparent, iPerf-inspired speed test.

- **Client**: static page with xterm.js that prints iPerf-style output.
- **Edge**: Cloudflare Worker that provides `/upload` and `/download` endpoints.
- **Ethos**: open-source, simple, honest numbers; BSD-style license & attribution.

## Quick Start

### 1) Deploy the Worker (Cloudflare)
1. Install wrangler:
   ```bash
   npm i -g wrangler
   ```
2. Login and publish:
   ```bash
   cd worker
   wrangler login
   wrangler publish
   ```
   After publishing, you'll get a URL like: `https://iperf-me-mvp.<subdomain>.workers.dev`

### 2) Set the Worker URL in the client
Edit `client/index.html` and set:
```js
const WORKER = 'https://iperf-me-mvp.<subdomain>.workers.dev';
```
Or pass `?worker=https://...` in the URL to override at runtime.

### 3) Host the client
- Easiest: GitHub Pages or Cloudflare Pages.
- GitHub Pages (from repo root):
  - Put the **client/** folder as your Pages site, or serve the whole repo and link to `/client/`.
- Cloudflare Pages:
  - New project → Connect to this repo → Set build to **None** and output dir to `client`.

Open the page and run a test — you’ll see iPerf-style lines in the terminal UI.

## Attribution
- iPerf/iPerf3 are open-source tools originally from NLANR/DAST, maintained by ESnet (BSD).
- iperf.me is independent and not affiliated with ESnet/NLANR.

## License
BSD-3-Clause. See `LICENSE`.
