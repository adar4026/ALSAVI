import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { serviceWorkerVersionPlugin } from './build/serviceWorkerVersion';

// Local HTTPS for on-device PWA testing (TASK_015).
// Enabled only when a mkcert-generated key/cert pair exists at apps/web/.certs/
// (git-ignored). Absent certs => plain HTTP, so builds/dev never break for
// anyone who has not generated a cert. Setup steps: apps/web/README.md.
const certDir = resolve(dirname(fileURLToPath(import.meta.url)), '.certs');
const keyPath = resolve(certDir, 'key.pem');
const certPath = resolve(certDir, 'cert.pem');
const https =
  existsSync(keyPath) && existsSync(certPath)
    ? { key: readFileSync(keyPath), cert: readFileSync(certPath) }
    : undefined;

export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages project-site base path (deployment task): the repo is
  // published at https://adar4026.github.io/ALSAVI/, not the origin root.
  // `vite dev` stays at '/' so the existing on-device LAN/mkcert workflow
  // (TASK_015) is unaffected; `vite build` and `vite preview` both use the
  // production subpath so `vite preview` is a faithful check of the deployed
  // base path (Vite's own mechanism — no ad hoc URL rewriting).
  base: command === 'build' || isPreview ? '/ALSAVI/' : '/',
  // serviceWorkerVersionPlugin stamps dist/sw.js with the HEAD commit sha at
  // build time (apply: 'build' — inert during dev/preview serve). TASK_016.
  plugins: [react(), serviceWorkerVersionPlugin()],
  server: {
    port: 5173,
    strictPort: true,
    host: true, // expose on the LAN so the iPhone (same Wi-Fi) can reach it
    // Serve the stable mDNS/Bonjour hostname (<mac-hostname>.local) — Vite blocks
    // non-IP Host headers by default, so allow the .local domain (TASK_015 §3).
    allowedHosts: ['.local'],
    https,
  },
  preview: {
    port: 4173,
    strictPort: true,
    host: true,
    allowedHosts: ['.local'],
    https,
  },
}));
