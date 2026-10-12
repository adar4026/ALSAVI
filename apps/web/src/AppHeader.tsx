import { Icon } from './Icon';
import { countLabel, DAY_FORMS } from './stats-view';

interface Props {
  /** Current streak (`getStats().streakDays`); the chip is hidden at 0 or while loading. */
  streakDays: number | null;
  /** Today already has an answer, i.e. today is counted in the streak. */
  reviewedToday: boolean;
  /** Opens the settings sheet; omitted (no button) during a study session. */
  onOpenSettings?: () => void;
}

/**
 * The ALSAVI header (TASK_029): brand, the language being learned, a compact
 * streak and the settings button. Only shows data that already exists — the
 * streak shares its definition with the "Статистика" screen.
 */
export function AppHeader({ streakDays, reviewedToday, onOpenSettings }: Props) {
  const streak = streakDays ?? 0;
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          A
        </span>
        <span className="brand-text">
          <span className="brand-name">ALSAVI</span>
          <span className="brand-sub">Изучение испанского</span>
        </span>
      </div>
      <div className="header-actions">
        {streak > 0 && (
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
        )}
        {onOpenSettings && (
          <button type="button" className="icon-button" onClick={onOpenSettings} aria-label="Настройки">
            <Icon name="sliders" />
          </button>
        )}
      </div>
    </header>
  );
}
