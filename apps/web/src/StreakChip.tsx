import { Icon } from './Icon';
import { countLabel, DAY_FORMS } from './stats-view';

/**
 * Current streak (TASK_029, shared since TASK_037 by the home header and the
 * side navigation): flame + days, quieter until today has an answer, hidden
 * at 0 or while loading. Same definition as "Статистика".
 */
export function StreakChip({ streakDays, reviewedToday }: { streakDays: number | null; reviewedToday: boolean }) {
  const streak = streakDays ?? 0;
  if (streak <= 0) return null;
  return (
    <span
      className={reviewedToday ? 'streak-chip' : 'streak-chip is-pending'}
      title={reviewedToday ? 'Серия: сегодня уже засчитан' : 'Серия: сегодня ещё не было повторений'}
    >
      <Icon name="flame" size={18} />
      <span aria-hidden="true">{streak}</span>
      <span className="sr-only">
        Серия: {countLabel(streak, DAY_FORMS)} подряд
        {reviewedToday ? ', сегодня уже засчитан' : ', сегодня ещё не было повторений'}
      </span>
    </span>
  );
}
