import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// The tests run on a frozen slice of the dataset (web/test/data, written by
// tools/make_test_fixture.py), not on the live web/public/data a refresh
// rewrites: loadDataset()'s raw import is pointed at the fixture here, and
// test/fixtures.ts reads the same files.
const fixture = fileURLToPath(new URL('web/test/data/schools.json', import.meta.url));

export default defineConfig({
  root: 'web',
  resolve: {
    alias: [{ find: /^\.\.\/public\/data\/schools\.json\?raw$/, replacement: `${fixture}?raw` }],
  },
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
