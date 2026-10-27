/**
 * ALSAVI push Worker — the review-reminder backend.
 *  - fetch: /api/* for the PWA on GitHub Pages (api.ts)
 *  - scheduled: Cron Trigger once a minute (cron.ts)
 * The app itself is NOT served from here: it stays on GitHub Pages so the
 * learner's IndexedDB (same origin) is never left behind.
 */
import { handleApi } from './api.js';
import { runCron } from './cron.js';
import type { Env, ExecutionContext, ScheduledEvent } from './d1.js';

function hardened(res: Response): Response {
  const out = new Response(res.body, res);
  out.headers.set('X-Content-Type-Options', 'nosniff');
  out.headers.set('Referrer-Policy', 'no-referrer');
  return out;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) return hardened(await handleApi(request, env));
    return hardened(new Response('ALSAVI reminders API', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runCron(env, event.scheduledTime).then(
        (s) => {
          if (s.daily || s.retried || s.sent || s.failed) console.log(JSON.stringify({ evt: 'cron', ...s }));
        },
        (err: unknown) => {
          console.error(JSON.stringify({ evt: 'cron_error', message: String((err as Error)?.message ?? err).slice(0, 200) }));
          throw err;
        }
      )
    );
  },
};
