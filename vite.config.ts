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
      // Keep the watcher enabled (unlike `watch: null`) so edited files are re-transformed on
      // reload. HMR is off, so this only affects the transform cache, not live updates.
      // Ignoring build output and dependencies keeps watcher inode usage low in sandboxes.
      watch: {
        ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
      },
    },
  };
});
