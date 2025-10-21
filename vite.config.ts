import path from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', sourcemap: true },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
