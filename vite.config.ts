import { defineConfig } from 'vite';

export default defineConfig({
  base: '/3d-icon-tool/',
  // three.js alone is ~600 kB minified; it's one cacheable chunk, so don't warn about it.
  build: { chunkSizeWarningLimit: 800 },
});
