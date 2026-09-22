import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_BACKEND_PROXY_TARGET || env.VITE_API_TARGET || 'http://127.0.0.1:8000';

  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
    ],
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => {
            // When proxying to default local Apache on port 80, route through transit public directory
            if (target.startsWith('http://localhost') && !target.includes(':8000') && !target.includes('backend/public')) {
              return `/transit/backend/public${path}`;
            }
            return path;
          },
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      outDir: 'dist',
    },
  };
});
