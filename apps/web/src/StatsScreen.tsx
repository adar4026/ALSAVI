import type { LearningEngine, LearningStats } from '@alsavi/engine';
import { useCallback, useEffect, useState } from 'react';
import { ActivityChart } from './ActivityCharts';
import { WORD_FORMS } from './home-view';
import { Icon } from './Icon';
import {
  ACTIVITY_PERIODS,
  activityDigest,
  activityFor,
  countLabel,
  dayLong,
  DAY_FORMS,
  formatDecimal,
  isStatsEmpty,
  pluralRu,
  progressHeadline,
  progressSegments,
  statsKpis,
  TIME_FORMS,
  type ActivityPeriod,
} from './stats-view';

interface Props {
  engine: LearningEngine;
  /** Go to the home screen ("Главная") to study. */
  onStudy: () => void;
  /** Open "Карточки" with the form focused. */
  onAddWord: () => void;
  /** Open "Карточки" with the existing "Трудные" filter. */
  onShowDifficult: () => void;
}

/** Difficult words previewed on the card; the full list is in "Карточки". */
const DIFFICULT_PREVIEW = 3;

/**
 * "Статистика" (TASK_026, redesigned in TASK_031): four headline numbers,
 * activity over 7/30 days, cards by stage and difficult words. A read-only
 * view of one `engine.getLearningStats()` call — every number and definition
 * lives in the Engine (`packages/engine/src/stats.ts`); `stats-view.ts` only
 * words and rounds them. Read once per visit of the section; the period
 * toggle switches between two windows already computed, without a new query.
 */
export function StatsScreen({ engine, onStudy, onAddWord, onShowDifficult }: Props) {
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
  if (!stats) return <div className="stats-screen stats-loading" aria-busy="true" />;

  const empty = isStatsEmpty(stats);

  return (
    <div className="stats-screen">
      <div className="screen-head">
        <h1 className="screen-title">Статистика</h1>
        <p className="screen-lead">Ваш прогресс по настоящей истории ответов.</p>
      </div>

      <KpiGrid stats={stats} />

      {empty ? (
        <section className="home-card stats-empty-card" aria-labelledby="stats-empty-title">
          <h2 id="stats-empty-title" className="home-card-title">
            Пока нет статистики
          </h2>
          <p className="home-card-text">Добавьте первые слова и начните обучение, чтобы увидеть свой прогресс.</p>
          <button type="button" className="btn-primary btn-cta" onClick={onAddWord}>
            <Icon name="plus" />
            Добавить слово
          </button>
        </section>
      ) : (
        <div className="stats-layout">
          <ActivityCard activity={stats.activity} onStudy={onStudy} />
          <div className="stats-side">
            <ProgressCard cards={stats.cards} />
            <DifficultCard difficult={stats.difficult} onShowDifficult={onShowDifficult} />
          </div>
        </div>
      )}
    </div>
  );
}

function KpiGrid({ stats }: { stats: LearningStats }) {
  return (
    <section aria-labelledby="kpi-title">
      <h2 id="kpi-title" className="sr-only">
        Главное
      </h2>
      <dl className="kpi-grid">
        {statsKpis(stats).map((kpi) => (
          <div key={kpi.id} className={`kpi kpi-${kpi.id}`}>
            <dt className="kpi-label">{kpi.label}</dt>
            <dd className="kpi-value">
              {kpi.value}
              {kpi.unit && <span className="kpi-unit"> {kpi.unit}</span>}
            </dd>
            <dd className="kpi-detail">{kpi.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ActivityCard({ activity, onStudy }: { activity: LearningStats['activity']; onStudy: () => void }) {
  const [period, setPeriod] = useState<ActivityPeriod>(7);
  const window = activityFor(activity, period);
  const digest = activityDigest(window);

  return (
    <section className="home-card stats-card activity-card" aria-labelledby="activity-title">
      <div className="stats-card-head">
        <h2 id="activity-title" className="home-section-title">
          Активность
        </h2>
        <fieldset className="period-toggle">
          <legend className="sr-only">Период</legend>
          {ACTIVITY_PERIODS.map((p) => (
            <label key={p} className="period-option">
              <input
                type="radio"
                name="activity-period"
                value={p}
                checked={period === p}
                onChange={() => setPeriod(p)}
              />
              {countLabel(p, DAY_FORMS)}
            </label>
          ))}
        </fieldset>
      </div>

      {digest.total === 0 ? (
        <div className="activity-empty">
          <p className="empty-state">
            За последние {countLabel(digest.days, DAY_FORMS)} ответов не было.
          </p>
          <button type="button" className="btn-secondary" onClick={onStudy}>
            Перейти к обучению
          </button>
        </div>
      ) : (
        <>
          <ActivityChart window={window} />
          <dl className="digest">
            <div className="digest-item">
              <dt>Ответов</dt>
              <dd>{digest.total}</dd>
            </div>
            <div className="digest-item">
              <dt>Дней с занятиями</dt>
              <dd>
                {digest.activeDays}
                <span className="digest-of"> из {digest.days}</span>
              </dd>
            </div>
            <div className="digest-item">
              <dt>В среднем за день занятий</dt>
              <dd>{digest.perActiveDay === null ? '—' : formatDecimal(digest.perActiveDay)}</dd>
            </div>
          </dl>
          <details className="stats-details">
            <summary>По дням</summary>
            <table className="stats-table">
              <thead>
                <tr>
                  <th scope="col">День</th>
                  <th scope="col">Ответов</th>
                </tr>
              </thead>
              <tbody>
                {[...window.days].reverse().map((d) => (
                  <tr key={d.dayStart}>
                    <td>{dayLong(d.dayStart)}</td>
                    <td>{d.reviews}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}

function ProgressCard({ cards }: { cards: LearningStats['cards'] }) {
  const segments = progressSegments(cards);

  return (
    <section className="home-card stats-card progress-card" aria-labelledby="progress-title">
      <h2 id="progress-title" className="home-section-title">
        Прогресс изучения
      </h2>
      {cards.active === 0 ? (
        <p className="empty-state">В активной коллекции нет карточек.</p>
      ) : (
        <>
          <p className="progress-headline">{progressHeadline(cards)}</p>
          <div className="stage-bar" aria-hidden="true">
            {segments.map(
              (s) =>
                s.count > 0 && (
                  <span
                    key={s.key}
                    className={`stage-fill stage-${s.key}`}
                    style={{ flexGrow: s.count }}
                  />
                )
            )}
          </div>
          <ul className="stage-list">
            {segments.map((s) => (
              <li key={s.key} className="stage-row">
                <span className={`stage-dot stage-${s.key}`} aria-hidden="true" />
                <span className="stage-name">
                  <span className="stage-label">{s.label}</span>
                  <span className="stage-hint">{s.hint}</span>
                </span>
                <span className="stage-count">
                  {s.count}
                  <span className="stage-percent"> · {s.percent}%</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="hint">
        Прямая и обратная карточки одного слова считаются отдельно. Архивные не учитываются
        {cards.archived > 0 ? ` (в архиве: ${cards.archived})` : ''}.
      </p>
    </section>
  );
}

function DifficultCard({
  difficult,
  onShowDifficult,
}: {
  difficult: LearningStats['difficult'];
  onShowDifficult: () => void;
}) {
  return (
    <section className="home-card stats-card difficult-card" aria-labelledby="difficult-title">
      <div className="stats-card-head">
        <h2 id="difficult-title" className="home-section-title">
          Трудные слова
        </h2>
        <span className={difficult.total > 0 ? 'count-badge is-alert' : 'count-badge'}>{difficult.total}</span>
      </div>
      {difficult.total === 0 ? (
        <p className="hint">Трудных слов нет: ни одно изученное слово вы пока не забыли.</p>
      ) : (
        <>
          <p className="hint">
            Эти слова требуют больше повторений: после изучения вы хотя бы раз ответили на них «Не помню».
          </p>
          <ol className="difficult-list">
            {difficult.words.slice(0, DIFFICULT_PREVIEW).map((w) => (
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
          <button
            type="button"
            className="btn-secondary stats-link"
            onClick={onShowDifficult}
            aria-label={`Посмотреть трудные слова: ${difficult.total} ${pluralRu(difficult.total, WORD_FORMS)}`}
          >
            Посмотреть слова
            <Icon name="arrow-right" size={18} />
          </button>
        </>
      )}
    </section>
  );
}
