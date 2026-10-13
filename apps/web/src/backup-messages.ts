import type { RestoreMeta, RetiredHistory } from '@alsavi/backup';
import { countLabel } from './stats-view';

/**
 * User-facing texts of backup export/restore (TASK_027). Pure functions — the
 * numbers come from `@alsavi/backup`; here is only wording. The note about the
 * history of deleted cards appears only when a backup actually carries it.
 */

const ANSWER_FORMS = ['ответ', 'ответа', 'ответов'] as const;

/** Status after a successful export. */
export function exportedStatus(retired: RetiredHistory | undefined): string {
  if (!retired) return 'Резервная копия сохранена.';
  return (
    `Резервная копия сохранена. В неё также вошла история удалённых ранее карточек ` +
    `(${countLabel(retired.reviews, ANSWER_FORMS)}). Она не влияет на обучение и на ваши карточки, ` +
    `но помогает не потерять прошлую активность.`
  );
}

/** What is on the device right now — counted just before a restore (TASK_033). */
export interface CurrentCollection {
  notes: number;
  cards: number;
  reviews: number;
}

/**
 * Text of the restore confirmation (window.confirm). With `current`, it also
 * says what will be replaced and warns when the copy has fewer answers than
 * the device — the usual sign of restoring an older file by mistake.
 */
export function restoreConfirmText(meta: RestoreMeta, current?: CurrentCollection): string {
  const base =
    `Восстановление заменит ВСЕ текущие данные на копию от ` +
    `${new Date(meta.exportedAt).toLocaleString()} ` +
    `(${meta.notes} заметок, ${meta.cards} карточек, ${meta.reviews} повторений).`;
  return `${base}${retiredConfirmNote(meta)}${currentConfirmNote(meta, current)}\n\nЭто действие необратимо. Продолжить?`;
}

function currentConfirmNote(meta: RestoreMeta, current: CurrentCollection | undefined): string {
  if (!current || current.notes + current.cards + current.reviews === 0) return '';
  const restoredReviews = meta.reviews + (meta.retired?.reviews ?? 0);
  const older =
    current.reviews > restoredReviews
      ? `\n\nВ копии меньше ответов, чем сейчас на устройстве: прогресс, сделанный после неё, будет потерян.`
      : '';
  return (
    `\n\nСейчас на устройстве: ${current.notes} заметок, ${current.cards} карточек, ` +
    `${current.reviews} повторений — они будут удалены.${older} ` +
    `Если не уверены, нажмите «Отмена» и сначала сохраните «Экспорт».`
  );
}

function retiredConfirmNote({ retired }: RestoreMeta): string {
  if (!retired) return '';
  const answers = countLabel(retired.reviews, ANSWER_FORMS);
  if (!retired.legacy) {
    return (
      `\n\nВ копии также есть история удалённых ранее карточек (${answers}). ` +
      `Она сохранится для статистики и не влияет на обучение.`
    );
  }
  return (
    `\n\nВ копии ${answers} по карточкам, которых в ней нет. ` +
    `Скорее всего, это история карточек, удалённых до появления архива: она сохранится ` +
    `для статистики и не влияет на обучение. Если вы не удаляли карточки, файл может быть ` +
    `повреждён — тогда нажмите «Отмена».`
  );
}

/** Status after a successful restore. */
export function restoredStatus(meta: RestoreMeta): string {
  const base = `Восстановлено: ${meta.notes} заметок, ${meta.cards} карточек, ${meta.reviews} повторений.`;
  if (!meta.retired) return base;
  return (
    `${base} Сохранена и история удалённых ранее карточек ` +
    `(${countLabel(meta.retired.reviews, ANSWER_FORMS)}) — она не влияет на обучение.`
  );
}
