import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: 'web',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
  },
  server: { port: 8123, strictPort: true },
  preview: { port: 4173, strictPort: true },
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
