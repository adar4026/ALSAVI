import type { LearningEngine, LearningStats, StudySession, StudySessionOverview } from '@alsavi/engine';
import { useCallback, useEffect, useState } from 'react';
import { WeekChart } from './ActivityCharts';
import {
  CARD_FORMS,
  dailyGoal,
  goalText,
  greeting,
  limitNote,
  quickCount,
  WORD_FORMS,
  type DailyGoal,
} from './home-view';
import { Icon, type IconName } from './Icon';
import { activitySummary } from './stats-view';

/** Where "Карточки" opens from a quick action. */
export type CardsIntent = 'all' | 'difficult' | 'add';

interface Props {
  engine: LearningEngine;
  session: StudySession;
  /** Starts the existing review session (`ReviewSession`). */
  onStart: () => void;
  onOpenCards: (intent: CardsIntent) => void;
  onOpenStats: () => void;
  /**
   * Changes when the app returns to the foreground (TASK_033). An installed
   * iPhone app is resumed, not reloaded: without a re-read, yesterday's
   * "На сегодня всё" would greet the learner in the morning.
   */
  refreshKey?: number;
}

interface HomeData {
  overview: StudySessionOverview;
  stats: LearningStats;
}

/**
 * Home screen (TASK_029, replaces the TASK_022 "Учиться сегодня" screen):
 * greeting, today's goal (finish the queue), "Продолжить обучение", quick
 * actions and the week. Rendered by `App` only after the daily new-card limit
 * is applied to `session` (bootstrap gate), so `overview()` already respects
 * it. Read-only: the queue comes from `StudySession.overview()` — the same
 * selector the session uses — and every other number from
 * `engine.getLearningStats()`. Re-read on every mount, i.e. also on return
 * from a session.
 */
export function HomeScreen({ engine, session, onStart, onOpenCards, onOpenStats, refreshKey = 0 }: Props) {
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [overview, stats] = await Promise.all([session.overview(), engine.getLearningStats()]);
      setData({ overview, stats });
      setError(null);
    } catch (err) {
      setError(`Не удалось загрузить план на сегодня: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [engine, session]);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  if (error) {
    return (
      <div className="notice notice-error" role="alert">
        {error}{' '}
        <button type="button" className="btn-secondary" onClick={() => void reload()}>
          Повторить
        </button>
      </div>
    );
  }

  if (!data) return <div className="home home-loading" aria-busy="true" />;

  const { overview, stats } = data;
  const hello = <Greeting />;

  if (stats.cards.active === 0) {
    return (
      <div className="home">
        {hello}
        <section className="home-card welcome-card" aria-labelledby="welcome-title">
          <h2 id="welcome-title" className="home-card-title">
            {stats.cards.archived > 0 ? 'В активной коллекции пока нет карточек' : 'Пока нет ни одной карточки'}
          </h2>
          <p className="home-card-text">Добавь первое слово, чтобы начать учиться.</p>
          <button type="button" className="btn-primary btn-cta" onClick={() => onOpenCards('add')}>
            <Icon name="plus" />
            Добавить первую карточку
          </button>
        </section>
      </div>
    );
  }

  const goal = dailyGoal({
    answeredToday: stats.today.reviews,
    remaining: overview.total,
    newWithheld: overview.newWithheld,
  });

  return (
    <div className="home home-grid">
      <div className="home-main">
        {hello}
        <GoalCard goal={goal} overview={overview} onStart={onStart} onRecheck={() => void reload()} />
      </div>

      <div className="home-side">
        <section aria-labelledby="quick-title">
          <h2 id="quick-title" className="home-section-title">
            Быстрые действия
          </h2>
          <div className="quick-grid">
            <QuickAction
              icon="cards"
              label="Мои карточки"
              detail={quickCount(stats.cards.active, CARD_FORMS)}
              onClick={() => onOpenCards('all')}
            />
            <QuickAction
              icon="target"
              label="Трудные слова"
              detail={quickCount(stats.difficult.total, WORD_FORMS)}
              onClick={() => onOpenCards('difficult')}
            />
            <QuickAction icon="plus" label="Добавить слово" detail="новая карточка" onClick={() => onOpenCards('add')} />
          </div>
        </section>

        <section className="home-card week-card" aria-labelledby="week-title">
          <div className="home-card-head">
            <h2 id="week-title" className="home-section-title">
              Неделя
            </h2>
            <button type="button" className="btn-link" onClick={onOpenStats}>
              Вся статистика
            </button>
          </div>
          <WeekChart window={stats.activity.last7} />
          <p className="hint week-summary">{activitySummary(stats.activity.last7)}</p>
        </section>
      </div>
    </div>
  );
}

function Greeting() {
  return (
    <div className="home-hero">
      <h1 className="home-greeting">{greeting(new Date().getHours())}</h1>
      <p className="home-lead">Продолжим учить испанский.</p>
    </div>
  );
}

function GoalCard({
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
  const text = goalText(goal);
  const note = limitNote(goal);
  const fraction = goal.kind === 'active' ? goal.fraction : goal.kind === 'done' ? 1 : null;

  return (
    <section className={`home-card goal-card goal-${goal.kind}`} aria-labelledby="goal-title">
      <span className="eyebrow">Цель дня</span>
      <h2 id="goal-title" className="goal-title">
        {text.title}
      </h2>
      <p className="goal-detail">{text.detail}</p>

      {fraction !== null && (
        <div
          className="goal-bar"
          role="progressbar"
          aria-labelledby="goal-title"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fraction * 100)}
          aria-valuetext={`${text.title}. ${text.detail}`}
        >
          <div className="goal-bar-fill" style={{ width: `${fraction * 100}%` }} />
        </div>
      )}

      {note && <p className="hint goal-note">{note}</p>}

      {goal.kind === 'active' ? (
        <>
          <dl className="queue-split">
            <QueueCount label="Новые" value={overview.newCount} />
            <QueueCount label="В процессе" value={overview.learningCount} />
            <QueueCount label="Повторить" value={overview.reviewCount} />
          </dl>
          <button
            type="button"
            className="btn-primary btn-cta"
            onClick={onStart}
            aria-label={`Продолжить обучение, карточек в очереди: ${overview.total}`}
            autoFocus
          >
            Продолжить обучение
            <Icon name="arrow-right" />
          </button>
        </>
      ) : (
        <button type="button" className="btn-secondary" onClick={onRecheck}>
          Проверить снова
        </button>
      )}
    </section>
  );
}

function QueueCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="queue-count">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function QuickAction({
  icon,
  label,
  detail,
  onClick,
}: {
  icon: IconName;
  label: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="quick-action" onClick={onClick}>
      <span className="quick-icon">
        <Icon name={icon} />
      </span>
      <span className="quick-label">{label}</span>
      <span className="quick-detail">{detail}</span>
    </button>
  );
}
