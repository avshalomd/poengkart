import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: 'web',
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts', 'src/globals.ts', 'src/types.ts'],
      reporter: ['text-summary', 'html'],
      thresholds: { statements: 80, branches: 65, functions: 80, lines: 80 },
    },
  },
});
