import { assertValidNewCardsPerDay, LearningEngine, StudySession, type EngineStats } from '@alsavi/engine';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppHeader } from './AppHeader';
import type { StatusFilter } from './card-list';
import { CardManager } from './CardManager';
import { DexieStore } from './dexie-store';
import { HomeScreen, type CardsIntent } from './HomeScreen';
import { ReviewSession } from './ReviewSession';
import { SettingsSheet } from './SettingsSheet';
import { StatsScreen } from './StatsScreen';
import { applyTheme, readThemePreference, writeThemePreference, type ThemePreference } from './theme';

type View = 'review' | 'cards' | 'stats';

const VIEWS: Array<[View, string]> = [
  ['review', 'Главная'],
  ['cards', 'Карточки'],
  ['stats', 'Статистика'],
];

/**
 * How "Карточки" opens: list filter plus an optional focus target (TASK_029).
 * `seq` changes on every navigation so `CardManager` re-mounts and applies
 * them — even when the same entry is chosen twice in a row.
 */
interface CardsEntry {
  status: StatusFilter;
  focus?: 'add' | 'tools';
  seq: number;
}

/** `localStorage` can throw on access (blocked site data) — treat as absent. */
function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Sub-state of the "Главная" tab (TASK_022, TASK_029): the home screen
 * before the per-card flow, and the flow itself. Local
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
  // How the "Карточки" tab opens: 'all' from the navigation, 'difficult' from
  // the statistics screen (TASK_026) and the home screen, the form or the
  // tools from the home screen / settings (TASK_029).
  const [cardsEntry, setCardsEntry] = useState<CardsEntry>({ status: 'all', seq: 0 });
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Initial value: the same stored choice the inline script in index.html
  // already applied before the first paint.
  const [theme, setTheme] = useState<ThemePreference>(() => readThemePreference(safeLocalStorage()));
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

  useEffect(() => {
    applyTheme(document, theme);
  }, [theme]);

  const onThemeChange = useCallback((next: ThemePreference) => {
    setTheme(next);
    // A failed save still applies for this visit; it only won't survive a reload.
    writeThemePreference(safeLocalStorage(), next);
  }, []);

  const openCards = useCallback((status: StatusFilter, focus?: CardsEntry['focus']) => {
    setCardsEntry((prev) => ({ status, focus, seq: prev.seq + 1 }));
    setView('cards');
  }, []);

  const onHomeOpenCards = useCallback(
    (intent: CardsIntent) => {
      if (intent === 'add') openCards('all', 'add');
      else openCards(intent);
    },
    [openCards]
  );

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

  const inSession = view === 'review' && reviewPhase === 'session';
  const onHome = view === 'review' && reviewPhase === 'home';

  return (
    <div className="app">
      <AppHeader
        streakDays={stats ? stats.streakDays : null}
        reviewedToday={(stats?.reviewsToday ?? 0) > 0}
        // No settings mid-card: the session's number hotkeys must not meet an open dialog.
        onOpenSettings={inSession ? undefined : () => setSettingsOpen(true)}
      />
      <nav className="nav" aria-label="Разделы">
        {VIEWS.map(([value, label]) => (
          <button
            key={value}
            className={view === value ? 'active' : ''}
            aria-current={view === value ? 'page' : undefined}
            onClick={() => {
              if (value === 'cards') openCards('all');
              else setView(value);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {/* The home screen shows today's numbers itself; the bar stays on the
          other screens until the next stage re-arranges navigation. */}
      {!onHome && (
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
      )}
      {view === 'review' ? (
        bootstrap === 'ready' ? (
          reviewPhase === 'home' ? (
            <HomeScreen
              engine={engine}
              session={session}
              onStart={() => setReviewPhase('session')}
              onOpenCards={onHomeOpenCards}
              onOpenStats={() => setView('stats')}
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
      ) : view === 'stats' ? (
        <StatsScreen
          engine={engine}
          onStudy={() => setView('review')}
          onShowDifficult={() => openCards('difficult')}
        />
      ) : (
        <CardManager
          key={cardsEntry.seq}
          initialStatus={cardsEntry.status}
          initialFocus={cardsEntry.focus}
          engine={engine}
          store={store}
          onChanged={() => void refreshStats()}
          newCardsPerDay={newCardsPerDay}
          onLimitChange={onLimitChange}
          limitSaving={limitSaving}
          limitSaveError={limitSaveError}
        />
      )}
      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onThemeChange={onThemeChange}
        onOpenTools={() => {
          setSettingsOpen(false);
          openCards('all', 'tools');
        }}
      />
    </div>
  );
}
