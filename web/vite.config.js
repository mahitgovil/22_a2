import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the UI runs on :5173 and proxies /api to the Express server.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': process.env.VITE_API_TARGET || 'http://localhost:4000' },
  },
});
