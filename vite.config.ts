import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import 'dotenv/config';

/**
 * Vite config for the CogniTrack tray popover renderer.
 *
 * - Dev:   `vite` serves from src/renderer on :5173
 * - Build: outputs to dist-renderer/ (loaded by Electron in production)
 */
export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  base: './',
  plugins: [react()],
  // @cognitrack/api-client is a CJS package (module: "commonjs" in tsconfig).
  // pnpm workspace:* resolves it to a symlink pointing at the monorepo source
  // folder (../CogniTrack/packages/api-client). Vite/Rollup follows that symlink
  // and resolves it to the pre-compiled dist/index.js — a CJS file Rollup
  // cannot statically analyse for named exports (throws "auth is not exported").
  //
  // optimizeDeps.include only works for packages that enter through the
  // node_modules scanner; symlinked workspace packages are resolved as file
  // paths, bypassing esbuild pre-bundling entirely.
  //
  // FIX: alias @cognitrack/api-client directly to the TypeScript source entry
  // point (src/index.ts). Vite's esbuild transform handles .ts natively and
  // Rollup sees clean ESM named exports — no CJS interop needed at all.
  // All three @cognitrack/* workspace packages are compiled as CJS
  // (module: "commonjs"). pnpm workspace:* symlinks them to the monorepo
  // source folder; Rollup follows the symlink and resolves to their
  // dist/index.js — a CJS file it cannot statically analyse for named
  // exports. Alias all three directly to their TypeScript source so Vite's
  // esbuild handles the transform natively and Rollup sees clean ESM.
  resolve: {
    alias: {
      '@cognitrack/api-client': path.resolve(
        __dirname,
        '../CogniTrack/packages/api-client/src/index.ts',
      ),
      '@cognitrack/shared': path.resolve(
        __dirname,
        '../CogniTrack/packages/shared/src/index.ts',
      ),
      '@cognitrack/sync-engine': path.resolve(
        __dirname,
        '../CogniTrack/packages/sync-engine/src/index.ts',
      ),
    },
  },
  define: {
    'process.env.FIREBASE_API_KEY': JSON.stringify(process.env.FIREBASE_API_KEY),
    'process.env.FIREBASE_AUTH_DOMAIN': JSON.stringify(process.env.FIREBASE_AUTH_DOMAIN),
    'process.env.FIREBASE_PROJECT_ID': JSON.stringify(process.env.FIREBASE_PROJECT_ID),
    'process.env.FIREBASE_STORAGE_BUCKET': JSON.stringify(process.env.FIREBASE_STORAGE_BUCKET),
    'process.env.FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(process.env.FIREBASE_MESSAGING_SENDER_ID),
    'process.env.FIREBASE_APP_ID': JSON.stringify(process.env.FIREBASE_APP_ID),
    'process.env.FIREBASE_MEASUREMENT_ID': JSON.stringify(process.env.FIREBASE_MEASUREMENT_ID || 'G-G6EFWQJJE9'),
  },
  // Electron's renderer runs in a Chromium context (not Node).
  // Tell Vite's SSR bundler NOT to treat @cognitrack/api-client as an
  // external Node module — it must be fully bundled into the renderer output.
  // Without this, Electron's renderer fails at runtime with
  // "Cannot find module '@cognitrack/api-client'" because the CJS require()
  // inside the dist is not resolvable in the browser-like renderer process.
  ssr: {
    noExternal: ['@cognitrack/api-client'],
  },
  build: {
    outDir: path.resolve(__dirname, 'dist-renderer'),
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV === 'development' ? 'inline' : false,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
