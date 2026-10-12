import type { ActivityWindow } from '@alsavi/engine';
import { barPercent, countLabel, dayLong, dayShort, REVIEW_FORMS, weekdayShort } from './stats-view';

/*
 * Activity bar charts on CSS, no chart library (TASK_026). Shared by the
 * "Статистика" screen and the home screen's week (TASK_029).
 */

/** Seven labelled bars; each day also carries a full-text label for screen readers. */
export function WeekChart({ window }: { window: ActivityWindow }) {
  const lastIndex = window.days.length - 1;
  return (
    <ol className="week-chart" aria-label="Повторения по дням за последние 7 дней">
      {window.days.map((d, i) => (
        <li key={d.dayStart} className={i === lastIndex ? 'week-day is-today' : 'week-day'}>
          <span className="sr-only">
            {i === lastIndex ? 'Сегодня, ' : ''}
            {dayLong(d.dayStart)}: {countLabel(d.reviews, REVIEW_FORMS)}
          </span>
          <span className="week-count" aria-hidden="true">
            {d.reviews}
          </span>
          <span className="bar-track" aria-hidden="true">
            <span className="bar" style={{ height: `${barPercent(d.reviews, window)}%` }} />
          </span>
          <span className="week-label" aria-hidden="true">
            {weekdayShort(d.dayStart)}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Thirty thin bars. Decorative for assistive tech — the summary sentence under
 * it and the "По дням" table carry the same data as text.
 */
export function MonthChart({ window }: { window: ActivityWindow }) {
  const first = window.days[0];
  return (
    <div className="month-chart-wrap" aria-hidden="true">
      <div className="month-chart">
        {window.days.map((d) => (
          <span key={d.dayStart} className="bar-track" title={`${dayShort(d.dayStart)}: ${d.reviews}`}>
            <span className="bar" style={{ height: `${barPercent(d.reviews, window)}%` }} />
          </span>
        ))}
      </div>
      <div className="month-axis">
        <span>{first ? dayShort(first.dayStart) : ''}</span>
        <span>сегодня</span>
      </div>
    </div>
  );
}
