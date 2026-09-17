import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: 'web',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    // Published on purpose: the repository is public and the CARTO key is in
    // the bundle either way, so the map hides nothing, and it makes a
    // production stack trace readable in devtools. 1.2 MB, fetched only when
    // devtools asks for it.
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
