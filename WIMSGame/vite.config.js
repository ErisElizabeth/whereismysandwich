import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { proxy: { '/api': 'http://127.0.0.1:4174' } },
  preview: { proxy: {} },
  // Builds straight into the main site, served at whereismysandwich.com/game/
  build: { outDir: '../game', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 700 },
});
