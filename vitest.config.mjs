/** @type {import('vitest').UserConfig} */
export default {
    test: {
      environment: 'node',
      globals: true,
      include: ['worker/test/**/*.test.mjs', 'client/test/**/*.test.mjs'],
      pool: 'threads',
      maxThreads: 4
    }
  };
  