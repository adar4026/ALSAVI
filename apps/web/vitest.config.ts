import { defineConfig } from 'vitest/config';

// Test-only config (kept separate from vite.config.ts so the React plugin and
// app build settings do not leak into unit tests). The cross-adapter ordering
// test (TASK_014) runs in Node with fake-indexeddb providing `indexedDB`.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
