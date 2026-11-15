import type { LearningEngine, LearningStats, StudySession } from '@alsavi/engine';
import { useCallback, useEffect, useState } from 'react';
import { ActivityChart } from './ActivityCharts';
import { WORD_FORMS } from './home-view';
import {
  Badge,
  Banner,
  Button,
  EmptyState,
  IconButton,
  ListRow,
  ProgressRing,
  ScreenHeader,
  SegmentedControl,
  Sheet,
  Skeleton,
  Stat,
  StatGroup,
  Surface,
} from './ui';
import {
  ACTIVITY_PERIODS,
  activityDigest,
  activityFor,
  activityLine,
  countLabel,
  dayLong,
  DAY_FORMS,
  isStatsEmpty,
  learnedHero,
  pluralRu,
  progressSegments,
  STAT_DEFINITIONS,
  stagesTotal,
  statsKpis,
  TIME_FORMS,
  todayLine,
  type ActivityPeriod,
  type QueueOverview,
} from './stats-view';

interface Props {
  engine: LearningEngine;
  /**
   * The study session — read for "В очереди" (`overview()`, the number on
   * "Главная", S-1). Only once `queueReady`: before the bootstrap gate the
   * daily new-card limit is not applied to it yet.
   */
  session: StudySession;
  queueReady: boolean;
  /** Go to the home screen ("Главная") to study. */
  onStudy: () => void;
  /** Open the "Новое слово" sheet. */
  onAddWord: () => void;
  /** Open "Карточки" with the "Трудные" filter. */
  onShowDifficult: () => void;
  /** Start the difficult-words practice. */
  onPractice: () => void;
  /** Changes when the app returns to the foreground (TASK_033): re-read, the day may have changed. */
  refreshKey?: number;
}

/** Difficult words previewed on the card; the full list is in "Карточки". */
const DIFFICULT_PREVIEW = 3;

/**
 * "Статистика" (TASK_026/031, redesigned in TASK_042): words learned in a
 * ring, three numbers (accuracy, streak, today's queue), activity over 7/30
 * days, cards by stage and difficult words; "Как считается" defines each
 * number. Read-only: one `engine.getLearningStats()` (definitions in
 * `packages/engine/src/stats.ts`) and `session.overview()` for the queue;
 * `stats-view.ts` only words and rounds them.
 */
export function StatsScreen({
  engine,
  session,
  queueReady,
  onStudy,
  onAddWord,
  onShowDifficult,
  onPractice,
  refreshKey = 0,
}: Props) {
  const [stats, setStats] = useState<LearningStats | null>(null);
  const [queue, setQueue] = useState<QueueOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [definitionsOpen, setDefinitionsOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, q] = await Promise.all([engine.getLearningStats(), queueReady ? session.overview() : null]);
      setStats(s);
      setQueue(q);
      setError(null);
    } catch (err) {
      setError(`Не удалось загрузить статистику: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [engine, session, queueReady]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (error) {
    return (
      <Banner
        tone="error"
        actions={
          <Button variant="secondary" onClick={() => void load()}>
            Повторить
          </Button>
        }
      >
        {error}
      </Banner>
    );
  }
  if (!stats) return <Skeleton variant="stats" label="Загрузка статистики" />;

  const empty = isStatsEmpty(stats);
  const hero = learnedHero(stats);
  const openDefinitions = () => setDefinitionsOpen(true);

  return (
    <div className="stats-screen">
      <ScreenHeader title="Статистика" />

      <div className="stats-top">
        <Surface variant="hero" className="stats-hero">
          <ProgressRing value={hero.learned} max={Math.max(1, stats.notes.active)}>
            {hero.percent === null ? '—' : `${hero.percent}%`}
          </ProgressRing>
          <div className="stats-hero-text">
            <h2 className="stats-hero-title">{hero.title}</h2>
            <p className="stats-hero-detail">все карточки слова на длинных интервалах</p>
          </div>
          <IconButton icon="info" label="Как считается" onClick={openDefinitions} className="stats-hero-info" />
        </Surface>

        <section aria-label="Главные числа" className="stats-kpis">
          <StatGroup columns={3}>
            {statsKpis(stats, queue).map((k) => (
              <Stat
                key={k.id}
                className={`stats-kpi stats-kpi--${k.id}`}
                label={k.label}
                value={k.value}
                unit={k.unit}
                detail={k.detail}
              />
            ))}
          </StatGroup>
          <Button variant="tertiary" icon="info" className="stats-how" onClick={openDefinitions}>
            Как считается
          </Button>
        </section>
      </div>

      {empty ? (
        <EmptyState
          brand
          icon="chart"
          title="Пока нет статистики"
          text="Добавь первые слова и начни учить — здесь появится твой прогресс."
          action={
            <Button icon="plus" onClick={onAddWord}>
              Добавить слово
            </Button>
          }
        />
      ) : (
        <div className="stats-layout">
          <ActivityCard stats={stats} onStudy={onStudy} />
          <div className="stats-side">
            <StagesCard cards={stats.cards} />
            <DifficultCard difficult={stats.difficult} onShowDifficult={onShowDifficult} onPractice={onPractice} />
          </div>
        </div>
      )}

      <Sheet
        open={definitionsOpen}
        title="Как считается"
        onRequestClose={() => setDefinitionsOpen(false)}
        trailing={
          <Button variant="tertiary" onClick={() => setDefinitionsOpen(false)}>
            Готово
          </Button>
        }
      >
        <dl className="stats-definitions">
          {STAT_DEFINITIONS.map((d) => (
            <div key={d.id} className="stats-definition">
              <dt>{d.term}</dt>
              <dd>{d.text}</dd>
            </div>
          ))}
        </dl>
      </Sheet>
    </div>
  );
}

function ActivityCard({ stats, onStudy }: { stats: LearningStats; onStudy: () => void }) {
  const [period, setPeriod] = useState<ActivityPeriod>(7);
  const window = activityFor(stats.activity, period);
  const digest = activityDigest(window);
  const today = todayLine(stats.today);

  return (
    <Surface
      title="Активность"
      className="stats-card stats-activity"
      action={
        <SegmentedControl
          legend="Период"
          legendHidden
          name="activity-period"
          fill={false}
          options={ACTIVITY_PERIODS.map((p) => ({ value: String(p), label: countLabel(p, DAY_FORMS) }))}
          value={String(period)}
          onChange={(v) => setPeriod(Number(v) as ActivityPeriod)}
        />
      }
    >
      {digest.total === 0 ? (
        <EmptyState
          icon="chart"
          title={`За последние ${countLabel(digest.days, DAY_FORMS)} ответов не было`}
          action={
            <Button variant="secondary" onClick={onStudy}>
              Перейти к обучению
            </Button>
          }
        />
      ) : (
        <>
          <ActivityChart window={window} />
          <p className="stats-line">{activityLine(digest)}</p>
          {today && <p className="stats-line stats-line--muted">{today}</p>}
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
    </Surface>
  );
}

function StagesCard({ cards }: { cards: LearningStats['cards'] }) {
  const segments = progressSegments(cards);

  return (
    <Surface title="Карточки по стадиям" className="stats-card stats-stages">
      {cards.active === 0 ? (
        <p className="stats-line stats-line--muted">В активной коллекции нет карточек.</p>
      ) : (
        <>
          <div className="stage-bar" aria-hidden="true">
            {segments.map(
              (s) => s.count > 0 && <span key={s.key} className={`stage-fill stage-${s.key}`} style={{ flexGrow: s.count }} />
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
          <p className="stats-line stats-line--muted">{stagesTotal(cards)}</p>
        </>
      )}
    </Surface>
  );
}

function DifficultCard({
  difficult,
  onShowDifficult,
  onPractice,
}: {
  difficult: LearningStats['difficult'];
  onShowDifficult: () => void;
  onPractice: () => void;
}) {
  return (
    <Surface
      title="Трудные слова"
      className="stats-card stats-difficult"
      action={<Badge tone={difficult.total > 0 ? 'warning' : 'neutral'}>{difficult.total}</Badge>}
    >
      {difficult.total === 0 ? (
        <p className="stats-line stats-line--muted">Пока нет: ни одно выученное слово не забылось.</p>
      ) : (
        <>
          <div className="stats-difficult-rows">
            {difficult.words.slice(0, DIFFICULT_PREVIEW).map((w) => (
              <ListRow
                key={w.noteId}
                title={w.front}
                lang="es"
                subtitle={w.back}
                trailing={<span>забыто {countLabel(w.lapses, TIME_FORMS)}</span>}
              />
            ))}
          </div>
          <div className="stats-difficult-actions">
            <Button icon="play" onClick={onPractice}>
              Тренировка
            </Button>
            <Button
              variant="secondary"
              iconEnd="chevron-right"
              onClick={onShowDifficult}
              aria-label={`Все трудные слова: ${difficult.total} ${pluralRu(difficult.total, WORD_FORMS)}`}
            >
              Все
            </Button>
          </div>
        </>
      )}
    </Surface>
  );
}
