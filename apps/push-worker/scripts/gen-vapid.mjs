// Prints a fresh VAPID key pair (P-256). The public key goes to wrangler.jsonc
// `vars.VAPID_PUBLIC_KEY`; the private key ONLY to `wrangler secret put
// VAPID_PRIVATE_KEY` (or .dev.vars locally) — never into the repository.
// Usage: node scripts/gen-vapid.mjs [--dev-vars]
import { writeFileSync } from 'node:fs';

const b64u = (bytes) => Buffer.from(bytes).toString('base64url');
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const publicKey = b64u(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)));
const privateKey = (await crypto.subtle.exportKey('jwk', kp.privateKey)).d;

if (process.argv.includes('--dev-vars')) {
  writeFileSync(
    new URL('../.dev.vars', import.meta.url),
    `VAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}\nVAPID_SUBJECT=mailto:dev@localhost\n`,
    { mode: 0o600 }
  );
  console.log('Wrote .dev.vars (local pair). Public key:', publicKey);
} else {
  console.log(`VAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}`);
}
