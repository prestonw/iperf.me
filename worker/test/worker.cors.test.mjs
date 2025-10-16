import { Miniflare } from "miniflare";

function createMF() {
  return new Miniflare({
    modules: true,
    scriptPath: "worker/src/worker.js",
    compatibilityDate: "2024-10-01"
  });
}

test("OPTIONS preflight returns CORS headers", async () => {
  const mf = createMF();
  const res = await mf.dispatchFetch("http://localhost/api/d", { method: "OPTIONS" });
  expect(res.status).toBe(200);
  expect(res.headers.get("access-control-allow-origin")).toBe("*");
  expect(res.headers.get("access-control-allow-methods")).toMatch(/GET,POST,OPTIONS/);
});
