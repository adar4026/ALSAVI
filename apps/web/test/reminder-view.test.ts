import { describe, expect, it } from 'vitest';
import { isOpenReviewMessage, isReviewLink, viewFromHash } from '../src/nav';
import {
  availability,
  DENIED_TEXT,
  DENIED_TEXT_IOS,
  enableErrorText,
  failureText,
  IOS_INSTALL_NOTE,
  IOS_INSTALL_STEPS,
  lastDeliveryText,
  momentText,
  permissionLabel,
  reminderStatusLine,
} from '../src/reminder-view';

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

describe('one-line status (TASK_043): every state of TASK_034 has its line', () => {
  const base = { enabled: true, permission: 'granted' as const, server: 'ok' as const, subscribed: true, nextDailyAt: null, now, timeZone: TZ };
  it('cannot work here', () => {
    expect(reminderStatusLine({ ...base, availability: 'unsupported' })).toEqual({ tone: 'off', text: 'Не поддерживаются в этом браузере' });
    expect(reminderStatusLine({ ...base, availability: 'ios_install' })).toEqual({ tone: 'warning', text: 'Нужно приложение с экрана «Домой»' });
    expect(reminderStatusLine({ ...base, availability: 'denied', permission: 'denied' })).toEqual({ tone: 'warning', text: 'Уведомления запрещены' });
  });
  it('off, checking, offline', () => {
    expect(reminderStatusLine({ ...base, availability: 'ready', enabled: false })).toEqual({ tone: 'off', text: 'Выключены' });
    expect(reminderStatusLine({ ...base, availability: 'ready', server: 'loading' })).toEqual({ tone: 'pending', text: 'Проверяется…' });
    expect(reminderStatusLine({ ...base, availability: 'ready', server: 'error' })).toEqual({ tone: 'warning', text: 'Нет связи с сервером' });
  });
  it('on: with the next reminder when the server knows it', () => {
    expect(reminderStatusLine({ ...base, availability: 'ready' })).toEqual({ tone: 'ok', text: 'Включены на этом устройстве' });
    expect(reminderStatusLine({ ...base, availability: 'ready', nextDailyAt: Date.parse('2026-10-28T18:30:00Z') })).toEqual({
      tone: 'ok',
      text: 'Включены · следующее завтра в 19:30',
    });
  });
  it('subscription lost or never made', () => {
    expect(reminderStatusLine({ ...base, availability: 'ready', subscribed: false })).toEqual({ tone: 'warning', text: 'Подписка потеряна' });
    expect(reminderStatusLine({ ...base, availability: 'ready', server: 'idle', subscribed: undefined })).toEqual({
      tone: 'warning',
      text: 'Подписка не оформлена',
    });
  });
});

describe('«ты» in the reminder texts (Q6)', () => {
  it('no «вы» forms left', () => {
    const texts = [
      ...IOS_INSTALL_STEPS,
      IOS_INSTALL_NOTE,
      DENIED_TEXT,
      DENIED_TEXT_IOS,
      ...(['offline', 'not_configured', 'rate_limited', 'subscribe_failed', 'no_subscription', 'server'] as const).map(failureText),
      enableErrorText({ ok: false, reason: 'dismissed' }, desktop),
    ];
    for (const text of texts) {
      expect(text).not.toMatch(/(?<!\p{L})(вы|вас|ваш\p{L}*|откройте|нажмите|запустите|включайте|занимаетесь|разрешите|вернитесь|попробуйте|выключите|включите|выберите)(?!\p{L})/iu);
    }
  });
});
