import type { KeyValue, PermissionState, PushPort, PushSubscriptionData } from './reminder-client';

/**
 * Browser wiring for review reminders (TASK_034): the push server address,
 * the PushManager port and platform detection. Kept thin — the logic lives
 * in reminder-client.ts / reminder-view.ts, which are unit-tested.
 */

/**
 * The reminder API (apps/push-worker). Override per build with
 * `VITE_PUSH_API=http://localhost:8787/api/` for a local `wrangler dev`.
 */
export const PUSH_API_BASE: string =
  (import.meta.env.VITE_PUSH_API as string | undefined) ?? 'https://alsavi-push.alexus4026.workers.dev/api/';

export function browserKeyValue(): KeyValue | null {
  try {
    const ls = window.localStorage;
    return {
      get: (k) => ls.getItem(k),
      set: (k, v) => ls.setItem(k, v),
      remove: (k) => ls.removeItem(k),
    };
  } catch {
    return null;
  }
}

function b64uToBytes(b64u: string): Uint8Array<ArrayBuffer> {
  const s = b64u.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const sameKey = (a: ArrayBuffer | null | undefined, b: Uint8Array) => {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
};

function toData(sub: PushSubscription): PushSubscriptionData {
  const json = sub.toJSON();
  return { endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' } };
}

/** The service worker registration, or an error when none becomes active (e.g. `vite dev`). */
async function registration(): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('service worker not active')), 8000)),
  ]);
}

/** `null` where Web Push is unavailable (old browser, iPhone Safari tab outside the Home Screen app). */
export function browserPushPort(): PushPort | null {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return null;
  }
  return {
    permission: () => Notification.permission as PermissionState,
    requestPermission: async () => (await Notification.requestPermission()) as PermissionState,
    async getSubscription() {
      const sub = await (await registration()).pushManager.getSubscription();
      return sub ? toData(sub) : null;
    },
    async subscribe(vapidPublicKey, { renew = false } = {}) {
      const reg = await registration();
      const key = b64uToBytes(vapidPublicKey);
      const existing = await reg.pushManager.getSubscription();
      if (existing && !renew && sameKey(existing.options.applicationServerKey, key)) return toData(existing);
      if (existing) await existing.unsubscribe().catch(() => false); // other key / renewal
      return toData(await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
    },
  };
}

export interface Platform {
  ios: boolean;
  /** Opened from the Home Screen icon (or an installed desktop app). */
  standalone: boolean;
}

export function detectPlatform(): Platform {
  const nav = navigator as Navigator & { standalone?: boolean };
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  const standalone = nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
  return { ios, standalone };
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
