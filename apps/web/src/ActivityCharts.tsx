import type { ActivityWindow } from '@alsavi/engine';
import { ANSWER_FORMS } from './home-view';
import { barPercent, countLabel, dayLong, dayShort, REVIEW_FORMS, weekdayShort } from './stats-view';

/*
 * Activity bar charts on CSS, no chart library (TASK_026). `WeekChart` is the
 * home screen's week (TASK_029); `ActivityChart` is the 7/30-day chart of
 * "Статистика" (TASK_031).
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
 * The "Активность" chart of "Статистика" (TASK_031): one bar per day for a 7-
 * or 30-day window, today on the right and highlighted. Seven days carry their
 * count and weekday; thirty days are too narrow for that on a phone, so they
 * get a date axis and a tooltip, and the bars are hidden from assistive tech —
 * the digest under the chart and the "По дням" table carry the same data as
 * text. A day without answers keeps a thin baseline, so a gap is visible.
 */
export function ActivityChart({ window }: { window: ActivityWindow }) {
  const lastIndex = window.days.length - 1;
  const detailed = window.days.length <= 7;
  const first = window.days[0];
  const middle = window.days[Math.floor(lastIndex / 2)];
  return (
    <div className={detailed ? 'activity-chart is-detailed' : 'activity-chart'}>
      <ol
        className="activity-bars"
        style={{ gridTemplateColumns: `repeat(${window.days.length}, minmax(0, 1fr))` }}
        aria-label={detailed ? `Ответы по дням за последние ${window.days.length} дней` : undefined}
        aria-hidden={detailed ? undefined : true}
      >
        {window.days.map((d, i) => (
          <li
            key={d.dayStart}
            className={i === lastIndex ? 'activity-day is-today' : 'activity-day'}
            title={detailed ? undefined : `${dayShort(d.dayStart)}: ${d.reviews}`}
          >
            {detailed && (
              <span className="sr-only">
                {i === lastIndex ? 'Сегодня, ' : ''}
                {dayLong(d.dayStart)}: {countLabel(d.reviews, ANSWER_FORMS)}
              </span>
            )}
            {detailed && (
              <span className="activity-count" aria-hidden="true">
                {d.reviews}
              </span>
            )}
            <span className="bar-track" aria-hidden="true">
              <span className="bar" style={{ height: `${barPercent(d.reviews, window)}%` }} />
            </span>
            {detailed && (
              <span className="activity-label" aria-hidden="true">
                {weekdayShort(d.dayStart)}
              </span>
            )}
          </li>
        ))}
      </ol>
      {!detailed && first && middle && (
        <div className="activity-axis" aria-hidden="true">
          <span>{dayShort(first.dayStart)}</span>
          <span>{dayShort(middle.dayStart)}</span>
          <span>сегодня</span>
        </div>
      )}
    </div>
  );
}
