import { Miniflare } from "miniflare";
import assert from "node:assert/strict";

function createMF() {
  return new Miniflare({
    modules: true,
    scriptPath: "worker/src/worker.js",
    compatibilityDate: "2024-10-01",
    bindings: {},
    kvPersist: false,
    durableObjectsPersist: false,
    cachePersist: false
  });
}

test("GET /api/d streams bytes with CORS and octet-stream", async () => {
  const mf = createMF();
  const url = "http://localhost/api/d?t=2&slabMiB=2&nonce=test";
  const res = await mf.dispatchFetch(url);

  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toMatch(/application\/octet-stream/);
  expect(res.headers.get("access-control-allow-origin")).toBe("*");

  // Read a chunk quickly; we expect to receive data
  const reader = res.body.getReader();
  let total = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 2500) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 0) break;
  }
  assert.ok(total > 0, "expected to receive some bytes from /api/d");
});