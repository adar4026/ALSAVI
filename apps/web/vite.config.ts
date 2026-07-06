import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

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

export default defineConfig({
  plugins: [react()],
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
});
