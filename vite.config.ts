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
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                debugName: 'vendor-dependencies',
                name: (id) => {
                  const packagePath = id.split('node_modules/').pop();
                  if (!id.includes('node_modules/') || !packagePath) return null;
                  const parts = packagePath.split('/');
                  const packageName = parts[0].startsWith('@') ? `${parts[0]}-${parts[1]}` : parts[0];
                  return `vendor-${packageName.replace('@', '').replace(/[^a-zA-Z0-9_-]/g, '-')}`;
                },
                test: /node_modules/,
                minSize: 40_000,
                maxSize: 450_000,
              },
            ],
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
