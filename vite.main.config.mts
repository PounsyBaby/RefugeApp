import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const resolve = (p: string) => path.resolve(rootDir, p);

export default defineConfig({
  resolve: {
    alias: {
      '@main': resolve('src/main'),
      '@shared': resolve('src/shared'),
    },
  },
  build: {
    rollupOptions: {
      external: ['argon2'],
    },
  },
  optimizeDeps: {
    exclude: ['argon2'],
  },
});
