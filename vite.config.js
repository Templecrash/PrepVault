import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { createHandbookWorker } from './build/handbook-worker.js'

function offlineHandbookBuild() {
  return {
    name: 'prepvault-offline-handbooks',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = String(bundle['index.html']?.source || '');
      if (!html) throw new Error('Offline library needs the built index.html.');
      const assets = ['/favicon.svg', ...Object.keys(bundle).filter(path => /\.(m?js|css)$/.test(path)).map(path => `/${path}`)];
      const version = createHash('sha256').update(createHandbookWorker({ assets, html, version: '' })).digest('hex').slice(0, 16);
      this.emitFile({ type: 'asset', fileName: 'handbook-sw.js', source: createHandbookWorker({ assets, html, version }) });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), offlineHandbookBuild()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('pdfjs-dist')) return 'pdf-reader';
            if (id.includes('leaflet')) return 'maps';
            return 'vendor';
          }
        },
      },
    },
  },
})
