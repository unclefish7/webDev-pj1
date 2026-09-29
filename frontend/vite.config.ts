import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: { output: { manualChunks: { 'ui-library': ['element-plus'], 'vue-vendor': ['vue'] } } }
  },
  server: {
    host: process.env.WEB_HOST || '127.0.0.1',
    port: Number(process.env.FRONTEND_PORT || 5173),
    strictPort: true,
    proxy: {
      '/api': { target: `http://127.0.0.1:${process.env.API_PORT || 3000}` }
    }
  }
});
