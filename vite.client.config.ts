import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname, 'client/src'),
  publicDir: path.resolve(__dirname, 'client/assets'),
  build: {
    outDir: path.resolve(__dirname, 'client/build'),
    emptyOutDir: true,
    manifest: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        game: path.resolve(__dirname, 'client/src/index.html'),
        peiProxy: path.resolve(__dirname, 'client/src/pei-proxy.html')
      }
    }
  }
});
