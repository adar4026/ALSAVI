import { assertValidNewCardsPerDay, LearningEngine, StudySession, type EngineStats } from '@alsavi/engine';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CardManager } from './CardManager';
import { DexieStore } from './dexie-store';
import { ReviewHome } from './ReviewHome';
import { ReviewSession } from './ReviewSession';

type View = 'review' | 'cards';

/**
 * Sub-state of the "Повторение" tab (TASK_022): the home/overview screen
 * ("Учиться сегодня") before the per-card flow, and the flow itself. Local
 * UI navigation only — `StudySession` itself stays the same long-lived
 * instance for the whole app (its own bury-state lifetime is unaffected by
 * switching between these two screens).
 */
type ReviewPhase = 'home' | 'session';

/**
 * TASK_020 pre-commit fix: the persisted daily-limit setting must be loaded
 * and applied to `session` before study flow starts, but a plain boolean
 * can't represent "the load itself failed" — which previously left the app
 * stuck in an unlabeled, permanent loading state (no error, no retry) if
 * `store.getNewCardsPerDay()` ever rejected.
 */
type BootstrapState = 'loading' | 'ready' | 'error';

export function App() {
  // Keep the store reference: backup/restore operates at the storage layer.
  const store = useMemo(() => new DexieStore(), []);
  const engine = useMemo(() => new LearningEngine(store), [store]);
  const session = useMemo(() => new StudySession(engine), [engine]);
  const [view, setView] = useState<View>('review');
  const [reviewPhase, setReviewPhase] = useState<ReviewPhase>('home');
  const [stats, setStats] = useState<EngineStats | null>(null);
  // "К повторению" reflects the session queue (due + learn-ahead), so it stays
  // in sync with what StudySession.nextCard() will actually show — not the
  // strict `stats.dueNow` engine counter.
  const [dueCount, setDueCount] = useState<number | null>(null);
  const [newCardsPerDay, setNewCardsPerDayState] = useState<number | null>(null);
  // TASK_020 initialization gate: the persisted daily new-card limit must be
  // loaded and applied to `session` before ReviewSession is allowed to call
  // `nextCard()` — otherwise a persisted `0` or an already-exhausted limit
  // could briefly behave as unlimited while the load is in flight.
  // `StudySession` itself already exists (see above); only its first real
  // use is withheld until this reaches 'ready'. 'error' is distinct from
  // 'loading': a failed load must never be silently treated as unlimited,
  // and must never leave the app loading forever with no way out.
  const [bootstrap, setBootstrap] = useState<BootstrapState>('loading');
  // Runtime limit-change state (separate from `bootstrap`): a failed *save*
  // of an already-loaded setting is a local, retryable error — it must not
  // be confused with the app-wide bootstrap error above.
  const [limitSaving, setLimitSaving] = useState(false);
  const [limitSaveError, setLimitSaveError] = useState<string | null>(null);

  const loadSettings = useCallback(() => {
    setBootstrap('loading');
    void store
      .getNewCardsPerDay()
      .then((value) => {
        session.setNewCardsPerDay(value);
        setNewCardsPerDayState(value);
        setBootstrap('ready');
      })
      .catch(() => {
        setBootstrap('error');
      });
  }, [store, session]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const refreshStats = useCallback(async () => {
    const nextStats = await engine.getStats();
    setStats(nextStats);
    // Guarded like ReviewSession: don't read the study queue through a
    // session whose daily-limit policy hasn't been confirmed applied yet.
    if (bootstrap === 'ready') {
      setDueCount(await session.dueCount());
    }
  }, [engine, session, bootstrap]);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  const onLimitChange = useCallback(
    (value: number | null) => {
      try {
        // Authoritative validation — the same contract StudySession itself
        // enforces — BEFORE attempting to persist anything, so an invalid
        // value can never end up stored.
        assertValidNewCardsPerDay(value);
      } catch {
        setLimitSaveError('Не удалось сохранить дневной лимит.');
        return;
      }
      setLimitSaving(true);
      setLimitSaveError(null);
      void store
        .setNewCardsPerDay(value)
        .then(() => {
          // Applied to the session/UI only after a successful save — no
          // optimistic update while persistence is still in flight.
          session.setNewCardsPerDay(value);
          setNewCardsPerDayState(value);
          setLimitSaving(false);
          void refreshStats();
        })
        .catch(() => {
          // Persistence failed: the previous persisted/in-memory/UI value
          // stays active untouched — nothing above this point ran.
          setLimitSaving(false);
          setLimitSaveError('Не удалось сохранить дневной лимит.');
        });
    },
    [store, session, refreshStats]
  );

  return (
    <div className="app">
      <div className="topbar">
        <div className="logo">ALSAVI</div>
        <nav className="nav">
          <button className={view === 'review' ? 'active' : ''} onClick={() => setView('review')}>
            Повторение
          </button>
          <button className={view === 'cards' ? 'active' : ''} onClick={() => setView('cards')}>
            Карточки
          </button>
        </nav>
      </div>
      <div className="statsbar">
        {stats && (
          <>
            <span>
              К повторению: <strong>{dueCount ?? stats.dueNow}</strong>
            </span>
            <span>
              Всего: <strong>{stats.totalCards}</strong>
            </span>
            <span>
              Сегодня: <strong>{stats.reviewsToday}</strong>
            </span>
            {stats.accuracy !== null && (
              <span>
                Точность: <strong>{Math.round(stats.accuracy * 100)}%</strong>
              </span>
            )}
            {stats.streakDays > 0 && (
              <span>
                Серия: <strong>{stats.streakDays} дн</strong>
              </span>
            )}
          </>
        )}
      </div>
      {view === 'review' ? (
        bootstrap === 'ready' ? (
          reviewPhase === 'home' ? (
            <ReviewHome
              session={session}
              stats={stats}
              onStart={() => setReviewPhase('session')}
              onAddCard={() => setView('cards')}
            />
          ) : (
            <ReviewSession
              engine={engine}
              session={session}
              onReviewed={() => void refreshStats()}
              onExit={() => setReviewPhase('home')}
            />
          )
        ) : bootstrap === 'error' ? (
          <div className="card-panel">
            <div className="empty-state">Не удалось загрузить настройки обучения.</div>
            <button className="btn-primary" onClick={loadSettings}>
              Повторить
            </button>
          </div>
        ) : (
          // Same neutral placeholder ReviewSession itself shows while loading —
          // no new visual design, just withheld until the daily-limit policy
          // is confirmed applied to `session`.
          <div className="card-panel" />
        )
      ) : (
        <CardManager
          engine={engine}
          store={store}
          onChanged={() => void refreshStats()}
          newCardsPerDay={newCardsPerDay}
          onLimitChange={onLimitChange}
          limitSaving={limitSaving}
          limitSaveError={limitSaveError}
        />
      )}
    </div>
  );
}
