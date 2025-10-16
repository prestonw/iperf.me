import { Miniflare } from "miniflare";

function createMF() {
  return new Miniflare({
    modules: true,
    scriptPath: "worker/src/worker.js",
    compatibilityDate: "2024-10-01"
  });
}

test("POST /api/u counts bytes and returns JSON with CORS", async () => {
  const mf = createMF();
  const body = new Uint8Array(1024 * 1024); // 1 MiB
  const res = await mf.dispatchFetch("http://localhost/api/u?t=1", {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body
  });

  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toMatch(/application\/json/);
  expect(res.headers.get("access-control-allow-origin")).toBe("*");
  const json = await res.json();
  expect(json.ok).toBe(true);
  expect(json.bytes).toBe(body.byteLength);
  expect(json.seconds).toBe(1);
});
