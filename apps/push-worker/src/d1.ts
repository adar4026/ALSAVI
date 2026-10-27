/**
 * The slice of the Cloudflare D1 / Workers runtime API this Worker uses —
 * declared here so the package needs no `@cloudflare/workers-types`, and
 * the tests can run it on node:sqlite (test/sqlite-d1.ts).
 */

export interface D1Result<T = Record<string, unknown>> {
  success: boolean;
  results: T[];
  meta: { changes?: number; last_row_id?: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  DB: D1Database;
  /** Public VAPID key (wrangler.jsonc `vars`). */
  VAPID_PUBLIC_KEY?: string;
  /** Secret: `wrangler secret put VAPID_PRIVATE_KEY`. */
  VAPID_PRIVATE_KEY?: string;
  /** Secret or var: `mailto:` contact for push services. */
  VAPID_SUBJECT?: string;
  /** Comma-separated origins allowed to call the API (the PWA). */
  ALLOWED_ORIGINS?: string;
  RATE_LIMITER?: RateLimiter;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export interface ScheduledEvent {
  scheduledTime: number;
  cron: string;
}
