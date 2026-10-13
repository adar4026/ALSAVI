/**
 * Small app-level rules for a long-lived installed app (TASK_033). Pure,
 * tested in `app-lifecycle.test.ts`; `App.tsx` wires them to the browser.
 */

/** Start of the local calendar day of `now` (epoch ms) — the day a study session belongs to. */
export function localDayStart(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Whether to begin a new `StudySession` when the app comes back: only once
 * a new local day has started, and never in the middle of a session on
 * screen. A study session's sibling bury lasts for the life of its instance
 * (ARCHITECTURE §6); an app kept open overnight must not carry yesterday's
 * buried cards into today.
 */
export function shouldStartNewSession(sessionDay: number, now: number, inSession: boolean): boolean {
  return !inSession && localDayStart(now) !== sessionDay;
}

/** Asked before leaving "Карточки" while a card editor holds unsaved changes. */
export const UNSAVED_EDIT_CONFIRM = 'Изменения в карточке не сохранены. Уйти без сохранения?';
