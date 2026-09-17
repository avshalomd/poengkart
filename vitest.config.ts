import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: 'web',
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts', 'src/globals.ts', 'src/types.ts'],
      reporter: ['text-summary', 'html'],
      thresholds: { statements: 80, branches: 65, functions: 80, lines: 80 },
    },
    projects: [
      { extends: true, test: { name: 'dom', environment: 'happy-dom', include: ['test/**/*.test.ts'], exclude: ['test/node/**'], setupFiles: ['test/setup.ts'] } },
      // what the Astro build does: import the templates with no window at all
      { extends: true, test: { name: 'node', environment: 'node', include: ['test/node/**/*.test.ts'] } },
    ],
  },
});
