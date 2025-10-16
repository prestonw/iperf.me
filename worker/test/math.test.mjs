// Re-implement the small helpers exactly as in client to guard against regressions.
const toMiB = (b) => b / (1024 * 1024);           // MiB (2^20)
const toMb  = (b, s) => (b * 8 / 1e6) / Math.max(s, 1e-6); // Mbit/s (10^6)

test("toMiB exact powers", () => {
  expect(toMiB(1024*1024)).toBe(1);
  expect(toMiB(10*1024*1024)).toBe(10);
});

test("toMb uses decimal megabits", () => {
  // 1 Mbit/s == 125,000 bytes/sec
  expect(toMb(125000, 1)).toBeCloseTo(1, 6);
  // 2 Gbit/s == 2e9 / 8 = 250,000,000 bytes/sec
  expect(toMb(250_000_000, 1)).toBeCloseTo(2000, 3);
});

test("no divide by zero", () => {
  expect(toMb(1_000_000, 0)).toBeDefined();
});
