# @alsavi/web

Vite + React 19 web client for ALSAVI. Consumes `@alsavi/engine` through the
`DexieStore` (IndexedDB) adapter. This is also the **PWA** installable on iPhone
(TASK_015 — see [Mobile MVP Decision](../../docs/MOBILE_MVP_DECISION.md)).

## Commands

- `npm run dev` — dev server (HMR). HTTPS + LAN if a cert is present (below).
- `npm run build` — production build to `dist/`.
- `npm run preview` — serve the production build (this is the build that
  registers the service worker and can start offline).
- `npm test` — cross-adapter tests (vitest).

The service worker is registered **only in production builds** (`build` +
`preview`), never in `dev`, so it can't shadow HMR. For a full PWA / offline /
install test on device, use `npm run build && npm run preview`.

---

## Installing on a real iPhone (PWA)

Goal: open the app in Safari on the iPhone over **local HTTPS**, then
**Add to Home Screen**. iOS requires a trusted HTTPS origin for a clean install
(no cert warnings) and for the service worker.

### A. One-time: local HTTPS certificate with mkcert (on the Mac)

`mkcert` issues a locally-trusted certificate for your Mac's **mDNS/Bonjour
hostname** (`<name>.local`). We use the hostname rather than the LAN IP on
purpose: on a typical home Wi-Fi the IP is DHCP-assigned and can change after a
router reboot or reconnect, which would force reissuing the cert **and**
re-installing the trusted profile on the iPhone. The `.local` name is stable.

1. Install mkcert (Homebrew):
   ```sh
   brew install mkcert nss
   ```
2. Install mkcert's local root CA into the system trust store (asks for your
   password — this modifies your login keychain):
   ```sh
   mkcert -install
   ```
3. Get your Mac's local hostname (the mDNS name is this value + `.local`):
   ```sh
   scutil --get LocalHostName   # e.g. "MacBook-Pro"  →  MacBook-Pro.local
   ```
4. Generate a cert/key for that hostname (and localhost) into `apps/web/.certs/`
   (this directory is git-ignored — never commit keys):
   ```sh
   mkdir -p apps/web/.certs
   mkcert -key-file apps/web/.certs/key.pem \
          -cert-file apps/web/.certs/cert.pem \
          "$(scutil --get LocalHostName).local" localhost 127.0.0.1
   ```

`vite.config.ts` auto-detects `apps/web/.certs/{key.pem,cert.pem}` and serves
over HTTPS on the LAN (`host: true`, `allowedHosts: ['.local']` so the `.local`
host is accepted). With no certs it silently falls back to HTTP, so nothing
breaks for contributors who skip this.

Both the Mac and the iPhone must be on the **same** Wi-Fi; `<name>.local` then
resolves over standard mDNS/Bonjour (built into macOS and iOS) — no fixed IP
needed. (Actual Mac↔iPhone `.local` resolution can only be confirmed on a real
device; it is not verified here.)

### B. Serve the installable build over HTTPS

```sh
npm run build
npm run preview   # → https://<hostname>.local:4173
```

(For quick UI iteration without the service worker: `npm run dev` →
`https://<hostname>.local:5173`.)

### C. One-time: trust the mkcert root CA on the iPhone

The Mac's system trust does **not** transfer to the phone; install the root CA
manually. This is **two separate manual steps** — installing the profile does
**not** by itself trust it.

1. Locate the root CA on the Mac:
   ```sh
   mkcert -CAROOT     # prints the folder containing rootCA.pem
   ```
2. Send `rootCA.pem` to the iPhone via **AirDrop** or email.
3. On the iPhone: open the file → **Settings → General → VPN & Device
   Management** → tap the downloaded **profile** → **Install** (enter passcode).
4. **Enable trust explicitly:** **Settings → General → About → Certificate
   Trust Settings** → turn **ON** the toggle for the mkcert root CA.
   > Without step 4 Safari still shows a certificate warning. Exact wording /
   > menu location can differ slightly between iOS versions; the two required
   > actions are always: install the profile, then enable full trust.

### D. Install the PWA

1. On the iPhone, open Safari and go to `https://<hostname>.local:4173`
   (the same `<name>.local` from step A.3). There should be **no certificate
   warning** (if there is, revisit step C.4).
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. Launch ALSAVI from the Home Screen. It should open **standalone** (no Safari
   address bar).
4. Basic check: create/list cards, run a review session, confirm the FSRS
   interval buttons behave as on desktop.

---

## Notes

- Local storage durability (IndexedDB eviction) is **not** validated by this
  setup and is a separate follow-up (a 2-week on-device inactivity test). Until
  then, use the in-app **Export (backup)** as a safety net.
- No tunnels/staging: on-device testing is strictly local HTTPS over Wi-Fi.
