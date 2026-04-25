import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Polyfill for __dirname in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
    // Default to secure=false if VITE_SECURE is not set
    const isSecure = process.env.VITE_SECURE === 'true';

    let httpsConfig = {};

    // Set up HTTPS if enabled
    if (isSecure) {
        console.log('HTTPS is enabled for Vite development server');
        // Use self-signed certs if available
        const certPath = path.resolve(__dirname, './certs');
        if (fs.existsSync(path.join(certPath, 'cert.pem')) &&
            fs.existsSync(path.join(certPath, 'key.pem'))) {
            httpsConfig = {
                cert: fs.readFileSync(path.join(certPath, 'cert.pem')),
                key: fs.readFileSync(path.join(certPath, 'key.pem'))
            };
        }
    }

    return {
        plugins: [
            react()
        ],
        root: '.',
        base: '/',
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './frontend/src'),
                '@pages': path.resolve(__dirname, './frontend/src/Pages'),
                '@components': path.resolve(__dirname, './frontend/src/Components'),
                '@src': path.resolve(__dirname, './frontend')
            }
        },
        build: {
            outDir: 'dist',
            emptyOutDir: true,
            manifest: true,
            assetsDir: 'assets',
            rollupOptions: {
                input: {
                    main: path.resolve(__dirname, 'index.html')
                },
                output: {
                    entryFileNames: 'assets/[name]-[hash].js',
                    chunkFileNames: 'assets/[name]-[hash].js',
                    assetFileNames: 'assets/[name]-[hash].[ext]',
                    manualChunks(id) {
                        // ── Core React runtime ─────────────────────────────
                        if (id.includes('node_modules/react/') ||
                            id.includes('node_modules/react-dom/') ||
                            id.includes('node_modules/react-router-dom/') ||
                            id.includes('node_modules/scheduler/')) {
                            return 'react-vendor';
                        }
                        // ── Icon / UI libraries ────────────────────────────
                        if (id.includes('node_modules/lucide-react') ||
                            id.includes('node_modules/react-icons') ||
                            id.includes('node_modules/@fortawesome')) {
                            return 'ui-icons';
                        }
                        // ── Date utilities ─────────────────────────────────
                        if (id.includes('node_modules/date-fns') ||
                            id.includes('node_modules/dayjs') ||
                            id.includes('node_modules/react-datepicker')) {
                            return 'date-utils';
                        }
                        // ── PDF / canvas (heavy, rarely used) ─────────────
                        if (id.includes('node_modules/jspdf') ||
                            id.includes('node_modules/html2canvas')) {
                            return 'pdf-utils';
                        }
                        // ── Bootstrap (only used in a few pages) ──────────
                        if (id.includes('node_modules/bootstrap') ||
                            id.includes('node_modules/react-bootstrap')) {
                            return 'bootstrap';
                        }
                        // ── Admin section ──────────────────────────────────
                        if (id.includes('/Pages/Admin/')) {
                            return 'admin';
                        }
                        // ── Booking flows ──────────────────────────────────
                        if (id.includes('/Pages/Common/flights/') ||
                            id.includes('/Pages/Common/cruise/') ||
                            id.includes('/Pages/Common/hotels/') ||
                            id.includes('/Pages/Common/packages/')) {
                            return 'booking';
                        }
                        // ── Everything else from node_modules ──────────────
                        if (id.includes('node_modules')) {
                            return 'vendor-misc';
                        }
                    }
                }
            }
        },
        optimizeDeps: {
            include: ['react', 'react-dom', 'react-router-dom']
        },
        server: {
            hmr: {
                host: 'localhost',
                protocol: isSecure ? 'wss' : 'ws',
                clientPort: 5173
            },
            host: true,
            port: 5173,
            https: isSecure ? httpsConfig : false,
            watch: {
                usePolling: true,
            },
            cors: true,
            historyApiFallback: true,
            proxy: {
                '/api': {
                    target: 'http://localhost:5004',
                    changeOrigin: true,
                    secure: false,
                    ws: true
                }
            }
        }
    };
});
