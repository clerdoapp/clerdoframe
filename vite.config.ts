import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Writes the offline worker with the exact file list of this build, so the iPad home-screen app opens without a connection.
const offline = (): Plugin => ({
  name: 'clerdoframe-offline',
  apply: 'build',
  closeBundle() {
    const core = /^(carlito|hanken-grotesk|arimo|tinos)-(latin|latin-ext)-/;
    // Style sheets of fonts loaded on first use (400-*.css, 700-italic-*.css...) are cached when used, like their font files.
    const lazyFontCss = /^[47]00(-italic)?-[\w-]+\.css$/;
    const assets = readdirSync('dist/assets').filter((f) => !f.endsWith('.woff') && (!f.endsWith('.woff2') || core.test(f)) && !lazyFontCss.test(f)).map((f) => `assets/${f}`);
    const files = ['./', 'manifest.webmanifest', 'favicon.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', ...assets];
    const version = assets.join('').length + '-' + Date.now().toString(36);
    writeFileSync(join('dist', 'sw.js'), `const CACHE = 'clerdoframe-${version}';
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((n) => n !== CACHE).map((n) => caches.delete(n)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('./', { ignoreVary: true })));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreVary: true }).then((hit) => hit || fetch(e.request).then((r) => {
    if (r.ok && /\\.(woff2|css)$/.test(e.request.url)) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  })));
});
`);
  },
});

// A strict content policy in the built app: no remote scripts, no network calls.
const csp = (): Plugin => ({
  name: 'clerdoframe-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<title>', `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; connect-src 'self' blob: data:; worker-src 'self' blob:; frame-src 'self' about: blob:; object-src 'none'; base-uri 'self'; form-action 'none'" />\n    <title>`),
});

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8')).version) },
  plugins: [react(), offline(), csp()],
  build: { target: ['es2022', 'safari16'], sourcemap: false, chunkSizeWarningLimit: 2000 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as never);
