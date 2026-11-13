import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {fileURLToPath} from 'url';
import {defineConfig} from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
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
