import { describe, expect, it } from 'vitest';
import { isOpenReviewMessage, isReviewLink, viewFromHash } from '../src/nav';
import { availability, enableErrorText, lastDeliveryText, momentText, permissionLabel } from '../src/reminder-view';

const TZ = 'Europe/Madrid';
const now = Date.parse('2026-10-27T10:00:00Z'); // 11:00 Madrid
const iphone = { ios: true, standalone: true };
const desktop = { ios: false, standalone: false };

describe('availability', () => {
  it('iPhone Safari tab → install to the Home Screen first; Home Screen app → ready', () => {
    expect(availability({ supported: false, platform: { ios: true, standalone: false }, permission: 'unsupported' })).toBe('ios_install');
    expect(availability({ supported: true, platform: iphone, permission: 'default' })).toBe('ready');
  });
  it('denied and unsupported', () => {
    expect(availability({ supported: true, platform: desktop, permission: 'denied' })).toBe('denied');
    expect(availability({ supported: false, platform: desktop, permission: 'unsupported' })).toBe('unsupported');
  });
  it('permission labels and the iPhone-specific "denied" instruction', () => {
    expect(permissionLabel('granted')).toBe('разрешены');
    expect(permissionLabel('default')).toBe('не запрошены');
    expect(enableErrorText({ ok: false, reason: 'denied' }, iphone)).toContain('Настройки → Уведомления → ALSAVI');
  });
});

describe('status texts', () => {
  it('moments relative to today in the device zone', () => {
    expect(momentText(Date.parse('2026-10-27T08:00:00Z'), now, TZ)).toBe('сегодня в 09:00');
    expect(momentText(Date.parse('2026-10-28T08:00:00Z'), now, TZ)).toBe('завтра в 09:00');
    expect(momentText(Date.parse('2026-10-26T08:00:00Z'), now, TZ)).toBe('вчера в 09:00');
    expect(momentText(Date.parse('2026-11-02T08:00:00Z'), now, TZ)).toBe('02.11 в 09:00');
    // 23:30Z is already tomorrow in Madrid
    expect(momentText(Date.parse('2026-10-27T23:30:00Z'), now, TZ)).toBe('завтра в 00:30');
  });

  it('the last reminder: sent with its count, or skipped because nothing was due', () => {
    const base = { kind: 'daily' as const, variant: 'daily', day: '2026-10-27', at: Date.parse('2026-10-27T08:00:00Z'), reason: null };
    expect(lastDeliveryText({ ...base, status: 'sent', count: 18 }, now, TZ)).toBe('Напоминание о повторении отправлено сегодня в 09:00 · 18 карточек.');
    expect(lastDeliveryText({ ...base, status: 'skipped', count: null, reason: 'empty' }, now, TZ)).toBe(
      'Сегодня в 09:00 повторять было нечего — напоминание не отправлялось.'
    );
    expect(lastDeliveryText({ ...base, variant: 'backlog', status: 'sent', count: 35 }, now, TZ)).toContain('о накопившихся словах');
    expect(lastDeliveryText({ ...base, status: 'failed', count: 2, reason: 'gone:410' }, now, TZ)).toBe(
      'Напоминание сегодня в 09:00 не доставлено: подписка устарела.'
    );
    expect(lastDeliveryText(null, now, TZ)).toBeNull();
  });
});

describe('#/review link', () => {
  it('is recognized and opens the home section (never an unknown section)', () => {
    expect(isReviewLink('#/review')).toBe(true);
    expect(isReviewLink('#review/')).toBe(true);
    expect(isReviewLink('#/stats')).toBe(false);
    expect(viewFromHash('#/review')).toBe('home');
    expect(isOpenReviewMessage({ type: 'alsavi:open-review' })).toBe(true);
    expect(isOpenReviewMessage({ type: 'other' })).toBe(false);
    expect(isOpenReviewMessage(null)).toBe(false);
  });
});
