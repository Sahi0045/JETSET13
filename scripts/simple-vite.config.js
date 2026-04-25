import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

// Polyfill for __dirname in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../frontend/src'),
      './pages': path.resolve(__dirname, '../frontend/src/Pages'),
      './Pages': path.resolve(__dirname, '../frontend/src/Pages')
    }
  },
  build: {
    outDir: 'public/build',
    emptyOutDir: true,
    manifest: true,
    assetsDir: 'assets'
  }
}); 