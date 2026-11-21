import type { LearningEngine, LearningStats, StudySession, StudySessionOverview } from '@alsavi/engine';
import { useCallback, useEffect, useState } from 'react';
import { WeekChart } from './ActivityCharts';
import { BackupBanner } from './BackupBanner';
import type { BackupStore } from './backup-export';
import { backupSuggestion, type BackupReminderState } from './backup-reminder';
import {
  dailyGoal,
  difficultTile,
  greeting,
  heroText,
  limitNote,
  queueLegend,
  showsProgress,
  startLabel,
  todayLabel,
  weekDigest,
  type DailyGoal,
} from './home-view';
import { Icon } from './Icon';
import { Banner, Button, EmptyState, ProgressBar, Skeleton, Surface, Tile } from './ui';

/** Where "Карточки" opens from the home screen. */
export type CardsIntent = 'all' | 'difficult' | 'add' | 'archived';

interface Props {
  engine: LearningEngine;
  session: StudySession;
  /** For the backup suggestion (TASK_048): its marks and the export. */
  backupStore: BackupStore;
  /** Starts the existing review session (`ReviewSession`). */
  onStart: () => void;
  onOpenCards: (intent: CardsIntent) => void;
  onOpenStats: () => void;
  /** Starts the difficult-words practice (Q7: the tile goes straight there). */
  onPractice: () => void;
  /**
   * Changes when the app returns to the foreground (TASK_033). An installed
   * iPhone app is resumed, not reloaded: without a re-read, yesterday's
   * "Очередь пройдена" would greet the learner in the morning.
   */
  refreshKey?: number;
}

interface HomeData {
  overview: StudySessionOverview;
  stats: LearningStats;
  /** `null` when it could not be read — then no suggestion, the screen still works. */
  backup: BackupReminderState | null;
}

/**
 * Home screen (TASK_029, redesigned in TASK_039): "what do I do today?" — the
 * date and a greeting, one card with one number and one button, two quick
 * actions and a compact week. Rendered by `App` only after the daily
 * new-card limit is applied to `session` (bootstrap gate), so `overview()`
 * already respects it. Read-only: the queue comes from
 * `StudySession.overview()` — the same selector the session uses — and every
 * other number from `engine.getLearningStats()`. Words and states live in
 * `home-view.ts`.
 */
export function HomeScreen({
  engine,
  session,
  backupStore,
  onStart,
  onOpenCards,
  onOpenStats,
  onPractice,
  refreshKey = 0,
}: Props) {
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Hidden for this visit after «Сохранить копию» / «Позже».
  const [backupDone, setBackupDone] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [overview, stats, backup] = await Promise.all([
        session.overview(),
        engine.getLearningStats(),
        backupStore.getBackupReminder().catch(() => null),
      ]);
      setData({ overview, stats, backup });
      setError(null);
    } catch (err) {
      setError(`Не удалось загрузить план на сегодня: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [engine, session, backupStore]);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  if (error) {
    return (
      <Banner
        tone="error"
        actions={
          <Button variant="secondary" onClick={() => void reload()}>
            Повторить
          </Button>
        }
      >
        {error}
      </Banner>
    );
  }

  if (!data) return <Skeleton variant="home" />;

  const { overview, stats, backup } = data;

  if (stats.cards.active === 0) {
    const archivedOnly = stats.cards.archived > 0;
    return (
      <div className="home">
        <Greeting />
        <Surface variant="hero" className="home-empty">
          <EmptyState
            brand
            icon="plus"
            title={archivedOnly ? 'В активной коллекции нет слов' : 'Начнём с первого слова'}
            text="Добавь слово — и оно сразу появится в очереди на сегодня."
            action={
              <Button size="lg" icon="plus" onClick={() => onOpenCards('add')}>
                Добавить слово
              </Button>
            }
          />
          {archivedOnly && (
            <Button variant="tertiary" className="home-empty-archive" onClick={() => onOpenCards('archived')}>
              Открыть архив
            </Button>
          )}
        </Surface>
      </div>
    );
  }

  const goal = dailyGoal({
    answeredToday: stats.today.reviews,
    remaining: overview.total,
    newWithheld: overview.newWithheld,
  });
  const tile = difficultTile(stats.difficult.total);
  const suggestion = backup && !backupDone ? backupSuggestion(backup, stats, Date.now()) : { show: false as const };

  return (
    <div className="home home-grid">
      <div className="home-main">
        <Greeting />
        <TodayCard
          goal={goal}
          overview={overview}
          onStart={onStart}
          onRecheck={() => void reload()}
        />
        {suggestion.show && (
          <BackupBanner engine={engine} store={backupStore} text={suggestion.text} onDone={() => setBackupDone(true)} />
        )}
      </div>

      <div className="home-side">
        <div className="home-tiles">
          <Tile
            icon="target"
            tone="warm"
            label="Трудные слова"
            detail={tile.detail}
            disabled={tile.disabled}
            onClick={onPractice}
          />
          <Tile icon="plus" label="Добавить слово" detail="в коллекцию" onClick={() => onOpenCards('add')} />
        </div>

        <Surface
          title="Неделя"
          className="home-week"
          action={
            <Button variant="tertiary" iconEnd="chevron-right" onClick={onOpenStats}>
              Статистика
            </Button>
          }
        >
          <WeekChart window={stats.activity.last7} compact />
          <p className="home-week-digest">{weekDigest(stats.activity.last7)}</p>
        </Surface>
      </div>
    </div>
  );
}

function Greeting() {
  const now = new Date();
  return (
    <div className="home-hero">
      <p className="home-date">{todayLabel(now)}</p>
      <h1 className="home-greeting">{greeting(now.getHours())}</h1>
    </div>
  );
}

function TodayCard({
  goal,
  overview,
  onStart,
  onRecheck,
}: {
  goal: DailyGoal;
  overview: StudySessionOverview;
  onStart: () => void;
  onRecheck: () => void;
}) {
  const hero = heroText(goal);
  const note = limitNote(goal);

  return (
    <section className={`ui-surface ui-surface--hero home-today home-today--${goal.kind}`} aria-labelledby="today-title">
      <h2 id="today-title" className="home-today-overline">
        Сегодня
      </h2>

      {hero.kind === 'queue' ? (
        <>
          <p className="home-today-number">
            <span className="home-today-value">{hero.number}</span> <span className="home-today-unit">{hero.unit}</span>
          </p>
          {hero.detail && <p className="home-today-detail">{hero.detail}</p>}
          <ul className="home-legend" aria-label="Из них">
            {queueLegend(overview).map((item) => (
              <li key={item.key} className={`home-legend-item is-${item.key}`}>
                {item.label}
              </li>
            ))}
          </ul>
          {showsProgress(goal) && goal.kind === 'active' && (
            <ProgressBar
              className="home-today-progress"
              value={goal.fraction}
              aria-labelledby="today-title"
              ariaValue={{ now: Math.round(goal.fraction * 100), min: 0, max: 100 }}
              valueText={`${hero.number} ${hero.unit}. ${hero.detail ?? ''}`}
            />
          )}
          {note && <p className="home-today-note">{note}</p>}
          <Button
            size="lg"
            block
            iconEnd="arrow-right"
            className="home-cta"
            onClick={onStart}
            aria-label={`${startLabel(goal)}, карточек в очереди: ${overview.total}`}
            autoFocus
          >
            {startLabel(goal)}
          </Button>
        </>
      ) : (
        <>
          {goal.kind === 'done' && (
            <span className="home-today-mark" aria-hidden="true">
              <Icon name="check" size={26} />
            </span>
          )}
          <p className="home-today-title">{hero.title}</p>
          <p className="home-today-detail">{hero.detail}</p>
          {note && <p className="home-today-note">{note}</p>}
          {/* The useful next steps (practice, a new word) are the tiles right
              below — not repeated here (D-10: no duplicate entries). */}
          <div className="home-today-actions">
            <Button variant="tertiary" icon="refresh" className="home-recheck" onClick={onRecheck}>
              Проверить снова
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
