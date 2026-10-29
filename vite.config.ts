import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
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
