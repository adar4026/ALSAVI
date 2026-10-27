import {
  normalizeSettings,
  type Bucket,
  type ReminderSettings,
  type ReviewSnapshot,
} from '@alsavi/reminders';

/**
 * Review reminders on the device (TASK_034): settings, the Web Push
 * subscription and keeping the push server's copy of the schedule current.
 *
 * The device is the source of truth. The server (apps/push-worker) gets:
 * the settings, the time zone, the subscription and a schedule snapshot
 * (due-date histogram, no words — see @alsavi/reminders). It never gets
 * card content.
 *
 * Sync is by state, not by event: a fingerprint of what the server should
 * have is compared with the last one it accepted. Different → one request
 * with the latest state. So offline changes are not lost (the next sync
 * sends them), a burst of answers produces one request, and an older
 * request can never win (monotonic `rev`, the server answers 409).
 *
 * Device credentials live in localStorage, outside backups: a backup
 * restored on another phone must not take over this phone's reminders.
 */

export const REMINDER_KEYS = {
  settings: 'alsavi-reminders',
  device: 'alsavi-push-device',
  sync: 'alsavi-push-sync',
} as const;

export interface KeyValue {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export type PermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export interface PushSubscriptionData {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** The browser's Notification + PushManager, behind a small injectable port. */
export interface PushPort {
  permission(): PermissionState;
  requestPermission(): Promise<PermissionState>;
  getSubscription(): Promise<PushSubscriptionData | null>;
  /** Subscribe with this VAPID key (replacing a subscription made with another key). */
  subscribe(vapidPublicKey: string, options?: { renew?: boolean }): Promise<PushSubscriptionData>;
}

export interface ReminderDeps {
  kv: KeyValue | null;
  fetchImpl: typeof fetch;
  /** URL of the API directory, ending in `/api/`. */
  apiBase: string;
  push: PushPort | null;
  getSnapshot: () => Promise<ReviewSnapshot>;
  timeZone: () => string;
  randomUUID?: () => string;
  /** Debounce of `requestSync` (ms). */
  syncDelayMs?: number;
}

export interface ServerStatus {
  subscribed: boolean;
  settings: ReminderSettings;
  timeZone: string | null;
  syncRev: number;
  snapshotAt: number | null;
  nextDailyAt: number | null;
  lastDelivery: {
    kind: 'daily' | 'backlog';
    status: string;
    variant: string | null;
    count: number | null;
    day: string;
    at: number;
    reason: string | null;
  } | null;
}

export type ApiFailure = 'offline' | 'server' | 'not_configured' | 'unauthorized' | 'conflict' | 'rate_limited' | 'gone';

export type EnableResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'denied' | 'dismissed' | 'subscribe_failed' | ApiFailure };

interface DeviceCreds {
  id: string;
  token: string;
}
interface SyncState {
  rev: number;
  fingerprint: string | null;
  endpoint: string | null;
}

type ApiResult = { ok: true; status: number; data: Record<string, unknown> } | { ok: false; status: number; failure: ApiFailure };

function readJson<T>(kv: KeyValue | null, key: string): T | null {
  try {
    const raw = kv?.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(kv: KeyValue | null, key: string, value: unknown): void {
  try {
    kv?.set(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: works for this visit, re-synced next time.
  }
}

/** 53-bit FNV-1a — a change detector, not a security hash. */
function fingerprintOf(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
  }
  return `${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`;
}

/**
 * What the server's counts depend on, independent of the moment it was
 * taken: buckets already due are summed into one number (their keys move
 * with the clock), the rest are kept as they are.
 */
export function scheduleFingerprintPart(snapshot: ReviewSnapshot | null): unknown {
  if (!snapshot) return null;
  const nowMin = Math.ceil(snapshot.generatedAt / 60_000);
  const fold = (buckets: Bucket[]) => {
    let due = 0;
    const later: Bucket[] = [];
    for (const b of buckets) {
      if (b[0] <= nowMin) due += b[1];
      else later.push(b);
    }
    return [due, later];
  };
  return [snapshot.timeZone, snapshot.day, snapshot.newLimit, snapshot.newUsedToday, fold(snapshot.started), fold(snapshot.fresh)];
}

export function createReminderClient(deps: ReminderDeps) {
  const { kv, fetchImpl, apiBase, push, getSnapshot, timeZone } = deps;
  const randomUUID = deps.randomUUID ?? (() => crypto.randomUUID());
  const syncDelayMs = deps.syncDelayMs ?? 1500;

  const creds = () => readJson<DeviceCreds>(kv, REMINDER_KEYS.device);
  const syncState = (): SyncState => ({ rev: 0, fingerprint: null, endpoint: null, ...readJson<SyncState>(kv, REMINDER_KEYS.sync) });
  const patchSync = (patch: Partial<SyncState>) => writeJson(kv, REMINDER_KEYS.sync, { ...syncState(), ...patch });

  function settings(): ReminderSettings {
    return normalizeSettings(readJson(kv, REMINDER_KEYS.settings));
  }

  async function api(method: string, path: string, body?: unknown, { auth = true, keepalive = false } = {}): Promise<ApiResult> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) {
      const c = creds();
      if (!c) return { ok: false, status: 401, failure: 'unauthorized' };
      headers.Authorization = `Bearer ${c.id}.${c.token}`; // the token goes only in a header, never in a URL
    }
    const payload = body === undefined ? undefined : JSON.stringify(body);
    let res: Response;
    try {
      res = await fetchImpl(new URL(path, apiBase).href, {
        method,
        headers,
        body: payload,
        cache: 'no-store',
        credentials: 'omit',
        // keepalive lets the last sync finish while the app goes to the background (≤ 64 KB)
        keepalive: keepalive && (payload?.length ?? 0) < 60_000,
      });
    } catch {
      return { ok: false, status: 0, failure: 'offline' };
    }
    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      data = {};
    }
    if (res.ok) return { ok: true, status: res.status, data };
    const failure: ApiFailure =
      res.status === 401
        ? 'unauthorized'
        : res.status === 409
          ? 'conflict'
          : res.status === 429
            ? 'rate_limited'
            : res.status === 410
              ? 'gone'
              : res.status === 503 && data.error === 'push_not_configured'
                ? 'not_configured'
                : 'server';
    return { ok: false, status: res.status, failure };
  }

  /** Forget the device locally (the server rejected its token). */
  function resetDevice(): void {
    try {
      kv?.remove(REMINDER_KEYS.device);
      kv?.remove(REMINDER_KEYS.sync);
    } catch {
      /* ignore */
    }
  }

  async function ensureDevice(): Promise<ApiFailure | null> {
    if (creds()) return null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const id = randomUUID();
      const r = await api('POST', 'devices', { id }, { auth: false });
      if (r.ok && typeof r.data.token === 'string') {
        writeJson(kv, REMINDER_KEYS.device, { id, token: r.data.token });
        writeJson(kv, REMINDER_KEYS.sync, { rev: 0, fingerprint: null, endpoint: null });
        return null;
      }
      if (!r.ok && r.failure !== 'conflict') return r.failure; // 409: id taken — try another
    }
    return 'server';
  }

  async function vapidKey(): Promise<{ key: string } | { failure: ApiFailure }> {
    const r = await api('GET', 'config', undefined, { auth: false });
    if (!r.ok) return { failure: r.failure };
    const key = r.data.vapidPublicKey;
    return typeof key === 'string' && key.length > 80 ? { key } : { failure: 'not_configured' };
  }

  /** Make sure the server has this browser's current subscription. */
  async function ensureSubscription({ renew = false } = {}): Promise<ApiFailure | 'subscribe_failed' | null> {
    if (!push || push.permission() !== 'granted') return null;
    let sub = renew ? null : await push.getSubscription().catch(() => null);
    if (!sub) {
      const config = await vapidKey();
      if ('failure' in config) return config.failure;
      try {
        sub = await push.subscribe(config.key, { renew });
      } catch {
        return 'subscribe_failed';
      }
    }
    if (!renew && syncState().endpoint === sub.endpoint) return null;
    const r = await api('PUT', 'subscription', { endpoint: sub.endpoint, keys: sub.keys });
    if (!r.ok) return r.failure;
    patchSync({ endpoint: sub.endpoint });
    return null;
  }

  let inFlight: Promise<SyncOutcome> | null = null;
  let again = false;
  type SyncOutcome = 'synced' | 'unchanged' | 'idle' | ApiFailure | 'subscribe_failed';

  async function syncOnce(keepalive: boolean): Promise<SyncOutcome> {
    const s = settings();
    if (!creds()) {
      if (!s.enabled) return 'idle';
      const failure = await ensureDevice();
      if (failure) return failure;
    }
    if (s.enabled) {
      const failure = await ensureSubscription();
      if (failure === 'unauthorized') {
        resetDevice();
        return 'unauthorized';
      }
      // other subscription problems do not block the settings/schedule sync
    }
    const snapshot = s.enabled ? await getSnapshot() : null;
    const tz = timeZone();
    const fingerprint = fingerprintOf(JSON.stringify([s, tz, syncState().endpoint, scheduleFingerprintPart(snapshot)]));
    if (fingerprint === syncState().fingerprint) return 'unchanged';
    for (let attempt = 0; attempt < 2; attempt++) {
      const rev = syncState().rev + 1;
      patchSync({ rev }); // reserve the revision before sending: never reused
      const r = await api('PUT', 'sync', { rev, settings: s, timeZone: tz, snapshot }, { keepalive });
      if (r.ok) {
        patchSync({ fingerprint });
        return 'synced';
      }
      if (r.failure === 'unauthorized') {
        resetDevice();
        return 'unauthorized';
      }
      if (r.failure !== 'conflict') return r.failure;
      // The server is ahead of this counter (lost storage, another tab): catch up once.
      const status = await api('GET', 'status');
      if (!status.ok) return status.failure;
      patchSync({ rev: Number(status.data.syncRev) || 0 });
    }
    return 'conflict';
  }

  /** Sync now (one at a time; a request during a sync runs once more afterwards). */
  function syncNow({ keepalive = false } = {}): Promise<SyncOutcome> {
    if (inFlight) {
      again = true;
      return inFlight;
    }
    inFlight = (async () => {
      let out: SyncOutcome;
      try {
        out = await syncOnce(keepalive);
        while (again) {
          again = false;
          out = await syncOnce(keepalive);
        }
      } catch {
        out = 'server';
      } finally {
        inFlight = null;
      }
      return out;
    })();
    return inFlight;
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  /** Debounced sync after something that may change the schedule (an answer, an edit, a restore…). */
  function requestSync(): void {
    if (!creds() && !settings().enabled) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void syncNow();
    }, syncDelayMs);
  }

  /** The app goes to the background: send pending changes right away. */
  function flush(): void {
    if (!creds()) return;
    if (timer) clearTimeout(timer);
    timer = null;
    void syncNow({ keepalive: true });
  }

  function saveSettings(next: ReminderSettings): void {
    writeJson(kv, REMINDER_KEYS.settings, next);
  }

  /**
   * Turn reminders on. Must be called straight from a tap: iOS shows the
   * permission prompt only in response to a user gesture, so the permission
   * request is the very first thing that happens.
   */
  async function enable(next: ReminderSettings = settings()): Promise<EnableResult> {
    if (!push) return { ok: false, reason: 'unsupported' };
    let permission = push.permission();
    if (permission === 'default') permission = await push.requestPermission();
    if (permission === 'denied') return { ok: false, reason: 'denied' };
    if (permission !== 'granted') return { ok: false, reason: permission === 'unsupported' ? 'unsupported' : 'dismissed' };
    const device = await ensureDevice();
    if (device) return { ok: false, reason: device };
    let sub = await ensureSubscription();
    if (sub === 'unauthorized') {
      resetDevice();
      const again = await ensureDevice();
      if (again) return { ok: false, reason: again };
      sub = await ensureSubscription();
    }
    if (sub) return { ok: false, reason: sub };
    saveSettings({ ...next, enabled: true });
    const out = await syncNow();
    return out === 'synced' || out === 'unchanged' ? { ok: true } : { ok: false, reason: out === 'idle' ? 'server' : out };
  }

  /** Turn reminders off: the server stops and forgets the schedule; the subscription stays for a quick re-enable. */
  async function disable(): Promise<SyncOutcome> {
    saveSettings({ ...settings(), enabled: false });
    return syncNow();
  }

  /** Change time/backlog options; synced right away when reminders are on. */
  async function update(next: ReminderSettings): Promise<SyncOutcome> {
    saveSettings(next);
    return syncNow();
  }

  async function status(): Promise<ServerStatus | ApiFailure> {
    if (!creds()) return 'unauthorized';
    const r = await api('GET', 'status');
    if (!r.ok) {
      if (r.failure === 'unauthorized') resetDevice();
      return r.failure;
    }
    return r.data as unknown as ServerStatus;
  }

  /**
   * Self-healing on app start: if reminders are on but the server lost the
   * subscription (the push service reported it invalid), subscribe again —
   * no prompt, permission is already granted.
   */
  async function repair(): Promise<void> {
    if (!settings().enabled || !creds()) return;
    const st = await status();
    if (typeof st === 'string') {
      if (st === 'unauthorized') void syncNow(); // re-registers
      return;
    }
    if (!st.subscribed && push?.permission() === 'granted') {
      patchSync({ endpoint: null, fingerprint: null });
      await ensureSubscription({ renew: true });
    }
    void syncNow();
  }

  async function sendTest(): Promise<{ ok: true; count: number } | { ok: false; reason: ApiFailure | 'no_subscription' }> {
    const r = await api('POST', 'test');
    if (r.ok) return { ok: true, count: Number(r.data.count) || 0 };
    if (r.status === 409) return { ok: false, reason: 'no_subscription' };
    return { ok: false, reason: r.failure };
  }

  return {
    settings,
    permission: (): PermissionState => (push ? push.permission() : 'unsupported'),
    supported: (): boolean => push !== null,
    hasDevice: (): boolean => creds() !== null,
    enable,
    disable,
    update,
    status,
    repair,
    sendTest,
    syncNow,
    requestSync,
    flush,
  };
}

export type ReminderClient = ReturnType<typeof createReminderClient>;
