import { buildSnapshot, type ReminderSettings } from '@alsavi/reminders';
import { describe, expect, it } from 'vitest';
import { decideBacklog, decideDaily } from '../src/policy.js';

const MADRID = 'Europe/Madrid';
const HOUR = 3_600_000;
const now = Date.parse('2026-10-27T13:00:00Z'); // 14:00 Madrid
const settings: ReminderSettings = { enabled: true, time: '09:00', backlog: true, backlogThreshold: 10 };
const snap = (overdue: number, fresh = 0) =>
  buildSnapshot({
    cards: [...Array.from({ length: overdue }, () => ({ due: now - HOUR, state: 'review' })), ...Array.from({ length: fresh }, () => ({ due: now - HOUR, state: 'new' }))],
    now,
    timeZone: MADRID,
    newLimit: null,
    newUsedToday: 0,
  });

describe('decideDaily', () => {
  it('sends the queue count; backlog wording at/over the threshold; nothing when empty', () => {
    expect(decideDaily({ fireAt: now, now, settings, snapshot: snap(3, 2) })).toEqual({ action: 'send', variant: 'daily', count: 5 });
    expect(decideDaily({ fireAt: now, now, settings, snapshot: snap(10) })).toEqual({ action: 'send', variant: 'backlog', count: 10 });
    expect(decideDaily({ fireAt: now, now, settings: { ...settings, backlog: false }, snapshot: snap(40) })).toEqual({ action: 'send', variant: 'daily', count: 40 });
    expect(decideDaily({ fireAt: now, now, settings, snapshot: snap(0) })).toEqual({ action: 'skip', reason: 'empty' });
    expect(decideDaily({ fireAt: now, now, settings, snapshot: null })).toEqual({ action: 'skip', reason: 'no_schedule' });
    expect(decideDaily({ fireAt: now - 2 * HOUR, now, settings, snapshot: snap(3) })).toEqual({ action: 'skip', reason: 'late' });
  });
});

describe('decideBacklog', () => {
  const base = { now, timeZone: MADRID, settings, snapshot: snap(12), lastNotifiedAt: now - 9 * HOUR, nextDailyAt: now + 19 * HOUR, todayDailyVariant: 'daily' };
  it('sends when every condition holds', () => {
    expect(decideBacklog(base)).toEqual({ action: 'send', count: 12 });
  });
  it('each guard', () => {
    expect(decideBacklog({ ...base, settings: { ...settings, backlog: false } })).toMatchObject({ reason: 'off' });
    expect(decideBacklog({ ...base, settings: { ...settings, enabled: false } })).toMatchObject({ reason: 'off' });
    expect(decideBacklog({ ...base, snapshot: snap(9) })).toMatchObject({ reason: 'below_threshold' });
    expect(decideBacklog({ ...base, lastNotifiedAt: now - 7 * HOUR })).toMatchObject({ reason: 'recent' });
    expect(decideBacklog({ ...base, nextDailyAt: now + 2 * HOUR })).toMatchObject({ reason: 'daily_soon' });
    expect(decideBacklog({ ...base, todayDailyVariant: 'backlog' })).toMatchObject({ reason: 'daily_covered' });
    expect(decideBacklog({ ...base, now: Date.parse('2026-10-27T19:30:00Z') })).toMatchObject({ reason: 'night' }); // 20:30
    expect(decideBacklog({ ...base, now: Date.parse('2026-10-27T08:59:00Z') })).toMatchObject({ reason: 'night' }); // 09:59
  });
});
