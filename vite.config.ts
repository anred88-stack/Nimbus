import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), cesium()],
  resolve: {
    alias: {
      '@': resolve(rootDir, 'src'),
      '@physics': resolve(rootDir, 'src/physics'),
      '@scene': resolve(rootDir, 'src/scene'),
      '@ui': resolve(rootDir, 'src/ui'),
      '@data': resolve(rootDir, 'src/data'),
      '@store': resolve(rootDir, 'src/store'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
