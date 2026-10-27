import { addDays, dayKey, pluralRu, wallClock } from '@alsavi/reminders';
import type { ApiFailure, EnableResult, PermissionState, ServerStatus } from './reminder-client';
import type { Platform } from './reminder-browser';

/**
 * Wording of the «Напоминания о повторении» section (TASK_034). Pure,
 * tested in `reminder-view.test.ts`.
 */

/** Can this device receive reminders, and if not, what should the learner do? */
export type Availability = 'ready' | 'ios_install' | 'unsupported' | 'denied';

export function availability(input: { supported: boolean; platform: Platform; permission: PermissionState }): Availability {
  // On iPhone, Web Push exists only in the Home Screen app (iOS 16.4+);
  // a Safari tab has no PushManager at all.
  if (input.platform.ios && !input.platform.standalone) return 'ios_install';
  if (!input.supported || input.permission === 'unsupported') return 'unsupported';
  if (input.permission === 'denied') return 'denied';
  return 'ready';
}

export const IOS_INSTALL_STEPS: readonly string[] = [
  'Откройте ALSAVI в Safari.',
  'Нажмите «Поделиться» → «На экран „Домой“».',
  'Запустите ALSAVI с иконки на экране «Домой» и включите напоминания здесь.',
];

export const IOS_INSTALL_NOTE =
  'На iPhone уведомления приходят только приложению с экрана «Домой» (iOS 16.4 и новее). ' +
  'Карточки в Safari и в приложении с экрана «Домой» хранятся отдельно — включайте напоминания там, где занимаетесь.';

export const DENIED_TEXT_IOS = 'Уведомления запрещены. Разрешите их: Настройки → Уведомления → ALSAVI, затем вернитесь сюда.';
export const DENIED_TEXT = 'Уведомления для ALSAVI запрещены в настройках браузера. Разрешите их для этого сайта и вернитесь сюда.';

export function permissionLabel(p: PermissionState): string {
  switch (p) {
    case 'granted':
      return 'разрешены';
    case 'denied':
      return 'запрещены';
    case 'default':
      return 'не запрошены';
    case 'unsupported':
      return 'не поддерживаются';
  }
}

export function failureText(reason: ApiFailure | 'subscribe_failed' | 'no_subscription'): string {
  switch (reason) {
    case 'offline':
      return 'Нет связи с сервером напоминаний. Настройки сохранены и отправятся, когда появится интернет.';
    case 'not_configured':
      return 'Сервер напоминаний ещё не настроен.';
    case 'rate_limited':
      return 'Слишком часто. Попробуйте через минуту.';
    case 'subscribe_failed':
      return 'Браузер не смог оформить подписку на уведомления. Попробуйте ещё раз.';
    case 'no_subscription':
    case 'gone':
      return 'Подписка на уведомления недействительна. Выключите и снова включите напоминания.';
    case 'unauthorized':
    case 'conflict':
    case 'server':
      return 'Сервер напоминаний не ответил. Попробуйте позже.';
  }
}

export function enableErrorText(result: Exclude<EnableResult, { ok: true }>, platform: Platform): string {
  switch (result.reason) {
    case 'unsupported':
      return 'Этот браузер не поддерживает push-уведомления.';
    case 'denied':
      return platform.ios ? DENIED_TEXT_IOS : DENIED_TEXT;
    case 'dismissed':
      return 'Разрешение на уведомления не выдано. Нажмите переключатель ещё раз и выберите «Разрешить».';
    default:
      return failureText(result.reason);
  }
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "сегодня в 09:00" / "завтра в 09:00" / "вчера в 09:00" / "28.10 в 09:00" — in the device zone. */
export function momentText(at: number, now: number, timeZone: string): string {
  const w = wallClock(at, timeZone);
  const time = `${pad(w.hour)}:${pad(w.minute)}`;
  const day = dayKey(at, timeZone);
  const today = dayKey(now, timeZone);
  if (day === today) return `сегодня в ${time}`;
  if (day === addDays(today, 1)) return `завтра в ${time}`;
  if (day === addDays(today, -1)) return `вчера в ${time}`;
  return `${pad(w.day)}.${pad(w.month)} в ${time}`;
}

const CARDS = ['карточка', 'карточки', 'карточек'] as const;

/** The last reminder, as the status line shows it; `null` before the first one. */
export function lastDeliveryText(last: ServerStatus['lastDelivery'], now: number, timeZone: string): string | null {
  if (!last) return null;
  const when = momentText(last.at, now, timeZone);
  const what = last.variant === 'backlog' || last.kind === 'backlog' ? 'о накопившихся словах' : 'о повторении';
  switch (last.status) {
    case 'sent':
      return `Напоминание ${what} отправлено ${when}${last.count !== null ? ` · ${last.count} ${pluralRu(last.count, CARDS)}` : ''}.`;
    case 'skipped':
      return last.reason === 'empty' || last.reason === 'no_schedule'
        ? `${capitalize(when)} повторять было нечего — напоминание не отправлялось.`
        : `Напоминание ${when} пропущено.`;
    case 'claimed':
    case 'retry':
      return `Напоминание ${when} отправляется…`;
    case 'failed':
      return last.reason?.startsWith('gone')
        ? `Напоминание ${when} не доставлено: подписка устарела.`
        : `Напоминание ${when} не доставлено.`;
    default:
      return `Напоминание ${when} не доставлено.`;
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
