import { assertValidNewCardsPerDay, LearningEngine, StudySession, type EngineStats } from '@alsavi/engine';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppHeader } from './AppHeader';
import type { StatusFilter } from './card-list';
import { CardManager } from './CardManager';
import { DexieStore } from './dexie-store';
import { HomeScreen, type CardsIntent } from './HomeScreen';
import { MainNav } from './MainNav';
import { urlForView, viewFromHash, type View } from './nav';
import { loadDifficultPractice } from './practice-flow';
import { PracticeSession } from './PracticeSession';
import { ProfileScreen } from './ProfileScreen';
import { ReviewSession } from './ReviewSession';
import { StatsScreen } from './StatsScreen';
import { applyTheme, readThemePreference, writeThemePreference, type ThemePreference } from './theme';

/**
 * How "Карточки" opens: list filter plus an optional focus target (TASK_029).
 * `seq` changes on every navigation so `CardManager` re-mounts and applies
 * them — even when the same entry is chosen twice in a row.
 */
interface CardsEntry {
  status: StatusFilter;
  focus?: 'add';
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
 * Sub-state of the "Главная" section (TASK_022, TASK_029): the home screen
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
  // The section comes from the address (TASK_030): `#/stats` opens
  // "Статистика", no hash — the home screen.
  const [view, setView] = useState<View>(() => viewFromHash(window.location.hash));
  // How "Карточки" opens: 'all' from the navigation, 'difficult' from the
  // statistics and home screens (TASK_026), the form from "Добавить слово"
  // (TASK_029).
  const [cardsEntry, setCardsEntry] = useState<CardsEntry>({ status: 'all', seq: 0 });
  // Initial value: the same stored choice the inline script in index.html
  // already applied before the first paint.
  const [theme, setTheme] = useState<ThemePreference>(() => readThemePreference(safeLocalStorage()));
  const [reviewPhase, setReviewPhase] = useState<ReviewPhase>('home');
  // Difficult-words practice (TASK_032): a focus mode over any section, like
  // the study session. Not in the address — its state lives in memory only.
  const [practicing, setPracticing] = useState(false);
  // For the header's streak only; every screen reads its own numbers.
  const [stats, setStats] = useState<EngineStats | null>(null);
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

  // Back/Forward and hand-edited addresses switch the section too.
  useEffect(() => {
    const sync = () => {
      setPracticing(false);
      setView(viewFromHash(window.location.hash));
    };
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);

  const navigate = useCallback((next: View) => {
    const url = urlForView(next, window.location);
    if (url !== null) window.history.pushState(null, '', url);
    setPracticing(false);
    setView(next);
    window.scrollTo(0, 0);
  }, []);

  const openCards = useCallback(
    (status: StatusFilter, focus?: CardsEntry['focus']) => {
      setCardsEntry((prev) => ({ status, focus, seq: prev.seq + 1 }));
      navigate('cards');
    },
    [navigate]
  );

  const onNavigate = useCallback(
    (next: View) => {
      // "Карточки" from the navigation always opens the full list.
      if (next === 'cards') openCards('all');
      else navigate(next);
    },
    [navigate, openCards]
  );

  const onHomeOpenCards = useCallback(
    (intent: CardsIntent) => {
      if (intent === 'add') openCards('all', 'add');
      else openCards(intent);
    },
    [openCards]
  );

  // The practice's only data access: a read of the card views (see practice-flow.ts).
  const loadPracticeCards = useCallback(() => loadDifficultPractice(engine), [engine]);

  const startPractice = useCallback(() => {
    setPracticing(true);
    window.scrollTo(0, 0);
  }, []);

  const refreshStats = useCallback(async () => {
    setStats(await engine.getStats());
  }, [engine]);

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

  // A study session is a focus mode: no navigation and no settings button —
  // the session's number hotkeys stay its own; "Завершить" leads back.
  const inSession = practicing || (view === 'home' && reviewPhase === 'session');

  return (
    <div className={inSession ? 'app in-session' : 'app'}>
      <AppHeader
        streakDays={stats ? stats.streakDays : null}
        reviewedToday={(stats?.reviewsToday ?? 0) > 0}
        onOpenSettings={inSession ? undefined : () => navigate('profile')}
      />
      {!inSession && <MainNav view={view} onNavigate={onNavigate} />}
      {practicing ? (
        <PracticeSession loadCards={loadPracticeCards} onExit={() => openCards('difficult')} />
      ) : view === 'home' ? (
        bootstrap === 'ready' ? (
          reviewPhase === 'home' ? (
            <HomeScreen
              engine={engine}
              session={session}
              onStart={() => setReviewPhase('session')}
              onOpenCards={onHomeOpenCards}
              onOpenStats={() => navigate('stats')}
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
          onStudy={() => navigate('home')}
          onAddWord={() => openCards('all', 'add')}
          onShowDifficult={() => openCards('difficult')}
        />
      ) : view === 'profile' ? (
        <ProfileScreen
          engine={engine}
          store={store}
          onChanged={() => void refreshStats()}
          newCardsPerDay={newCardsPerDay}
          limitReady={bootstrap === 'ready'}
          onLimitChange={onLimitChange}
          limitSaving={limitSaving}
          limitSaveError={limitSaveError}
          theme={theme}
          onThemeChange={onThemeChange}
        />
      ) : (
        <CardManager
          key={cardsEntry.seq}
          initialStatus={cardsEntry.status}
          initialFocus={cardsEntry.focus}
          engine={engine}
          onChanged={() => void refreshStats()}
          onPractice={startPractice}
        />
      )}
    </div>
  );
}
