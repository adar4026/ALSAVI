/**
 * Wall-clock time in an IANA time zone, on `Intl` alone (works in browsers,
 * Node and Cloudflare Workers). A reminder is set as a local time ("09:00")
 * in the learner's zone; the server turns it into an exact UTC moment for
 * each local day, so daylight-saving changes move the UTC moment, never the
 * wall-clock time.
 *
 * Day keys are local calendar dates `YYYY-MM-DD`. DST rules:
 *  - a time that does not exist (spring-forward gap, e.g. 02:30 in Madrid on
 *    the last Sunday of March) fires at the same offset as before the jump,
 *    i.e. one hour later on the wall clock (03:30);
 *  - a time that happens twice (fall-back) fires at the first occurrence.
 */

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || timeZone.length === 0 || timeZone.length > 64) return false;
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function isValidTime(time: unknown): time is string {
  return typeof time === 'string' && TIME_RE.test(time);
}

export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function wallClock(ms: number, timeZone: string): WallClock {
  const parts: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour! % 24,
    minute: parts.minute!,
    second: parts.second!,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date of `ms` in `timeZone`, `YYYY-MM-DD`. */
export function dayKey(ms: number, timeZone: string): string {
  const w = wallClock(ms, timeZone);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

/** Local minutes since midnight (0…1439) of `ms` in `timeZone`. */
export function minuteOfDay(ms: number, timeZone: string): number {
  const w = wallClock(ms, timeZone);
  return w.hour * 60 + w.minute;
}

export function timeToMinutes(time: string): number {
  const m = TIME_RE.exec(time);
  if (!m) throw new RangeError(`bad time ${time}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function addDays(day: string, n: number): string {
  const m = DAY_RE.exec(day);
  if (!m) throw new RangeError(`bad day ${day}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + n * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** UTC offset of `timeZone` at `ms`, in ms (Madrid in summer: +7 200 000). */
function offsetAt(ms: number, timeZone: string): number {
  const w = wallClock(ms, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** The UTC moment of wall-clock `time` on local date `day` in `timeZone` (DST rules above). */
export function wallTimeToUtc(day: string, time: string, timeZone: string): number {
  const m = DAY_RE.exec(day);
  if (!m) throw new RangeError(`bad day ${day}`);
  const minutes = timeToMinutes(time);
  const local = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Math.floor(minutes / 60), minutes % 60);
  // A zone changes its offset at most once around any given moment: the
  // offsets a day before and a day after are the only two candidates.
  const candidates = [...new Set([offsetAt(local - DAY_MS, timeZone), offsetAt(local + DAY_MS, timeZone)])].map(
    (off) => local - off
  );
  const exact = candidates.filter((t) => {
    const w = wallClock(t, timeZone);
    return dayKey(t, timeZone) === day && w.hour * 60 + w.minute === minutes;
  });
  // Ambiguous (fall-back) → the first occurrence; gap (spring-forward) → the later
  // candidate, which reads one hour later on the wall clock.
  return exact.length > 0 ? Math.min(...exact) : Math.max(...candidates);
}

/** The first moment strictly after `afterMs` when the wall clock in `timeZone` shows `time`. */
export function nextDailyAt(afterMs: number, time: string, timeZone: string): number {
  let day = dayKey(afterMs, timeZone);
  for (let i = 0; i < 3; i++) {
    const at = wallTimeToUtc(day, time, timeZone);
    if (at > afterMs) return at;
    day = addDays(day, 1);
  }
  /* c8 ignore next */
  throw new Error('nextDailyAt: no occurrence within 3 days');
}
