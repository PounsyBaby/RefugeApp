import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const resolve = (p: string) => path.resolve(rootDir, p);

export default defineConfig({
  plugins: [vue()],
  server: { port: 5173, strictPort: true },
  resolve: {
    alias: {
      '@': resolve('src/renderer'),
      '@renderer': resolve('src/renderer'),
      '@main': resolve('src/main'),
      '@shared': resolve('src/shared'),
    },
  },
});

