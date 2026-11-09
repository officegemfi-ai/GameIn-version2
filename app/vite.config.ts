/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// The production build carries a Content-Security-Policy: scripts only from the app itself, connections only to the
// Supabase project it was built for. (A static host can't send headers, so it goes in a <meta> tag.)
function contentSecurityPolicy(supabaseUrl: string): Plugin {
  const api = new URL(supabaseUrl);
  const ws = (api.protocol === 'https:' ? 'wss://' : 'ws://') + api.host;
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    `img-src 'self' data: blob: ${api.origin}`,
    `connect-src 'self' ${api.origin} ${ws}`,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'gamein-csp',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }],
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    // where the app is served from: '/' locally, '/GameIn-version2/app/' on GitHub Pages (APP_BASE in CI)
    base: process.env.APP_BASE || '/',
    plugins: [react(), env.VITE_SUPABASE_URL ? contentSecurityPolicy(env.VITE_SUPABASE_URL) : null],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: { port: 5173, strictPort: true },
    preview: { port: 4173, strictPort: true },
    build: {
      target: 'es2022',
      sourcemap: true,
      rollupOptions: {
        output: {
          // the libraries change less often than the app: cached separately
          manualChunks(id) {
            if (!id.includes('/node_modules/')) return undefined;
            if (/\/node_modules\/(react|react-dom|react-router|scheduler|cookie|set-cookie-parser)\//.test(id)) return 'react';
            if (/\/node_modules\/(@supabase|@tanstack)\//.test(id)) return 'data';
            return undefined;
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      env: { VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'test-key' },
    },
  };
});
