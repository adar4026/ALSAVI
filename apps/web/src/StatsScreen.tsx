import type { LearningEngine, LearningStats } from '@alsavi/engine';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { MonthChart, WeekChart } from './ActivityCharts';
import {
  activitySummary,
  countLabel,
  DAY_FORMS,
  dayLong,
  pluralRu,
  streakStatus,
  successPercent,
  TIME_FORMS,
} from './stats-view';

interface Props {
  engine: LearningEngine;
  /** Go to "Повторение". */
  onStudy: () => void;
  /** Open "Карточки" with the existing "Трудные" filter. */
  onShowDifficult: () => void;
}

/**
 * "Статистика" (TASK_026): today's answers, streaks, activity over 7 and 30
 * days, cards by state and the most-forgotten words. A read-only view of
 * `engine.getLearningStats()` — every number and definition lives in the
 * Engine (`packages/engine/src/stats.ts`); this component only lays them out.
 * Re-read each time the tab is opened.
 */
export function StatsScreen({ engine, onStudy, onShowDifficult }: Props) {
  const [stats, setStats] = useState<LearningStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStats(await engine.getLearningStats());
      setError(null);
    } catch (err) {
      setError(`Не удалось загрузить статистику: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [engine]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="notice notice-error" role="alert">
        {error}{' '}
        <button type="button" className="btn-secondary" onClick={() => void load()}>
          Повторить
        </button>
      </div>
    );
  }
  if (!stats) return <div className="card-panel" />;

  const { today, streak, activity, cards, difficult } = stats;
  const percent = successPercent(today);

  return (
    <div className="stats-screen">
      <Section id="stats-today" title="Сегодня">
        {today.reviews === 0 ? (
          <div className="stats-empty">
            <p className="empty-state">Сегодня ещё не было повторений.</p>
            <button type="button" className="btn-secondary" onClick={onStudy}>
              Перейти к обучению
            </button>
          </div>
        ) : (
          <>
            <dl className="stat-grid stat-grid-3">
              <Stat label="Всего ответов" value={today.reviews} />
              <Stat label="Успешно" value={today.successful} />
              <Stat label="Не помню" value={today.again} />
            </dl>
            <p className="hint">
              {percent !== null && <>Успешных ответов — {percent}%. </>}
              Успешный ответ — «Трудно», «Хорошо» или «Легко».
            </p>
          </>
        )}
      </Section>

      <Section id="stats-streak" title="Серия">
        <dl className="stat-grid stat-grid-2">
          <Stat label="Текущая серия" value={streak.current} unit={pluralRu(streak.current, DAY_FORMS)} />
          <Stat label="Самая длинная" value={streak.longest} unit={pluralRu(streak.longest, DAY_FORMS)} />
        </dl>
        <p className="hint">{streakStatus(streak)}</p>
        <p className="hint">
          Серия — календарные дни подряд, в каждый из которых оценена хотя бы одна карточка. Просто открыть
          приложение недостаточно.
        </p>
      </Section>

      <Section id="stats-activity" title="Активность">
        <h3 className="stats-subtitle">Последние 7 дней</h3>
        <WeekChart window={activity.last7} />
        <p className="hint">{activitySummary(activity.last7)}</p>

        <h3 className="stats-subtitle">Последние 30 дней</h3>
        <MonthChart window={activity.last30} />
        <p className="hint">{activitySummary(activity.last30)}</p>
        <details className="stats-details">
          <summary>По дням за 30 дней</summary>
          <table className="stats-table">
            <thead>
              <tr>
                <th scope="col">День</th>
                <th scope="col">Повторений</th>
              </tr>
            </thead>
            <tbody>
              {[...activity.last30.days].reverse().map((d) => (
                <tr key={d.dayStart}>
                  <td>{dayLong(d.dayStart)}</td>
                  <td>{d.reviews}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Section>

      <Section id="stats-cards" title="Карточки">
        {cards.active === 0 ? (
          <p className="empty-state">В активной коллекции пока нет карточек.</p>
        ) : (
          <dl className="stat-grid">
            <Stat label="Всего активных" value={cards.active} wide />
            <Stat label="Новые" value={cards.new} />
            <Stat label="Изучаются" value={cards.learning} />
            <Stat label="Готовы к повторению" value={cards.dueReview} />
            <Stat label="Ждут своего срока" value={cards.waiting} />
          </dl>
        )}
        <p className="hint">
          «Готовы к повторению» — выученные карточки, у которых подошёл срок; новые и изучаемые считаются
          отдельно. Прямая и обратная карточки одного слова — это две карточки.
        </p>
        <p className="hint">
          Архивные карточки не входят ни в эти числа, ни в трудные слова
          {cards.archived > 0 ? ` (в архиве: ${cards.archived})` : ''}.
        </p>
      </Section>

      <Section id="stats-difficult" title="Трудные слова">
        {difficult.total === 0 ? (
          <p className="empty-state">Трудных слов нет: ни одну выученную карточку вы пока не забыли.</p>
        ) : (
          <ol className="difficult-list">
            {difficult.words.map((w) => (
              <li key={w.noteId} className="difficult-item">
                <span className="difficult-word">
                  <span className="front" lang="es">
                    {w.front}
                  </span>
                  <span className="back">{w.back}</span>
                </span>
                <span className="difficult-lapses">забыто {countLabel(w.lapses, TIME_FORMS)}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="hint">
          Слово попадает сюда, если выученную карточку вы хотя бы раз забыли — ответили «Не помню» на
          повторении. Архивные слова не показываются.
        </p>
        {difficult.total > 0 && (
          <button type="button" className="btn-secondary stats-link" onClick={onShowDifficult}>
            Все трудные в «Карточках» ({difficult.total})
          </button>
        )}
      </Section>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="panel stats-section" aria-labelledby={id}>
      <h2 id={id} className="panel-title">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({ label, value, unit, wide }: { label: string; value: number; unit?: string; wide?: boolean }) {
  return (
    <div className={wide ? 'stat stat-wide' : 'stat'}>
      <dt className="stat-label">{label}</dt>
      <dd className="stat-value">
        {value}
        {unit && <span className="stat-unit"> {unit}</span>}
      </dd>
    </div>
  );
}
