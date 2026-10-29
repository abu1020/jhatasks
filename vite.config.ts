import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {fileURLToPath} from 'url';
import {defineConfig} from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom')) return 'vendor-react';
              if (id.includes('lucide-react')) return 'vendor-lucide';
              if (id.includes('motion')) return 'vendor-motion';
              if (id.includes('firebase')) return 'vendor-firebase';
            }
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(projectRoot, '.'),
      },
    },
    server: {
      // Allow the sandbox's proxied browser preview host.
      allowedHosts: ['.e2b.app', 'all'],
      // Disable HMR WebSocket to prevent disconnection rejections in proxied preview iframe.
      hmr: false,
      watch: null,
    },
  };
});
