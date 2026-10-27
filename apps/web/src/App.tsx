import { assertValidNewCardsPerDay, LearningEngine, StudySession, type EngineStats } from '@alsavi/engine';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppHeader } from './AppHeader';
import { localDayStart, shouldStartNewSession, UNSAVED_EDIT_CONFIRM } from './app-lifecycle';
import type { StatusFilter } from './card-list';
import { CardManager } from './CardManager';
import { DexieStore } from './dexie-store';
import { HomeScreen, type CardsIntent } from './HomeScreen';
import { MainNav } from './MainNav';
import { hashForView, isOpenReviewMessage, isReviewLink, urlForView, viewFromHash, type View } from './nav';
import { NoteFormController } from './note-form';
import { loadDifficultPractice } from './practice-flow';
import { PracticeSession } from './PracticeSession';
import { ProfileScreen } from './ProfileScreen';
import { appUpdate } from './registerSW';
import { browserKeyValue, browserPushPort, detectPlatform, deviceTimeZone, PUSH_API_BASE } from './reminder-browser';
import { createReminderClient } from './reminder-client';
import { snapshotFromEngine } from './reminder-snapshot';
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
  // The local day the current study session belongs to (TASK_033). An app
  // left open overnight starts a fresh `StudySession` on its first return on
  // a new day (see `shouldStartNewSession`); everything else — the queue, the
  // daily limit's usage — is derived from the Review Log and needs no reset.
  // A new session re-runs `loadSettings` below, so the stored daily limit is
  // applied to it before the home screen reads the queue.
  const [sessionDay, setSessionDay] = useState(() => localDayStart(Date.now()));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const session = useMemo(() => new StudySession(engine), [engine, sessionDay]);
  // The new-card form outlives "Карточки" (TASK_033): a word typed but not
  // yet added is still there after a visit to another section.
  const createForm = useMemo(() => new NoteFormController(engine, { kind: 'create' }), [engine]);
  // Review reminders (TASK_034): settings + push subscription on this device;
  // the push server gets the FSRS due-date snapshot read through the Engine.
  const reminders = useMemo(
    () =>
      createReminderClient({
        kv: browserKeyValue(),
        fetchImpl: (input, init) => window.fetch(input, init),
        apiBase: PUSH_API_BASE,
        push: browserPushPort(),
        getSnapshot: () => snapshotFromEngine(engine, store, Date.now(), deviceTimeZone()),
        timeZone: deviceTimeZone,
      }),
    [engine, store]
  );
  const platform = useMemo(() => detectPlatform(), []);
  // A tap on a reminder asks for the study session (`#/review` on a cold
  // start, a service-worker message in an open window); it starts once the
  // daily limit has been applied to the session.
  const [reviewRequested, setReviewRequested] = useState(() => isReviewLink(window.location.hash));
  // The section comes from the address (TASK_030): `#/stats` opens
  // "Статистика", no hash — the home screen.
  const [view, setView] = useState<View>(() => viewFromHash(window.location.hash));
  // The section on screen, readable synchronously by the navigation guards below.
  const viewRef = useRef(view);
  // How "Карточки" opens: 'all' from the navigation, 'difficult' from the
  // statistics and home screens (TASK_026), the form from "Добавить слово"
  // (TASK_029).
  const [cardsEntry, setCardsEntry] = useState<CardsEntry>({ status: 'all', seq: 0 });
  // Initial value: the same stored choice the inline script in index.html
  // already applied before the first paint.
  const [theme, setTheme] = useState<ThemePreference>(() => readThemePreference(safeLocalStorage()));
  const [reviewPhase, setReviewPhase] = useState<ReviewPhase>('home');
  const reviewPhaseRef = useRef(reviewPhase);
  useEffect(() => {
    reviewPhaseRef.current = reviewPhase;
  }, [reviewPhase]);
  // Bumped each time the app returns to the foreground (TASK_033): screens
  // that show "today" re-read their numbers.
  const [resumeTick, setResumeTick] = useState(0);
  const updateReady = useSyncExternalStore(appUpdate.subscribe, appUpdate.isReady);
  // Set by "Карточки" while it is on screen: does an open card editor hold
  // unsaved changes? (TASK_033)
  const unsavedEdit = useRef<(() => boolean) | null>(null);
  const registerUnsavedCheck = useCallback((check: (() => boolean) | null) => {
    unsavedEdit.current = check;
  }, []);
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
  // The session the loaded limit was applied to (TASK_033): when a new day
  // brings a new `StudySession`, it is not ready until its own load finishes.
  const [settingsAppliedTo, setSettingsAppliedTo] = useState<StudySession | null>(null);
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
        setSettingsAppliedTo(session);
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

  /**
   * Leaving "Карточки" (or re-opening it) would discard an open editor's
   * unsaved changes: ask first (TASK_033). `true` = go ahead.
   */
  const confirmLeaveCards = useCallback((): boolean => {
    if (viewRef.current !== 'cards' || !unsavedEdit.current?.()) return true;
    return window.confirm(UNSAVED_EDIT_CONFIRM);
  }, []);

  // Back/Forward and hand-edited addresses switch the section too.
  useEffect(() => {
    const sync = () => {
      if (isReviewLink(window.location.hash)) {
        const { pathname, search } = window.location;
        window.history.replaceState(null, '', `${pathname}${search}${hashForView(viewRef.current)}`);
        openReviewRef.current();
        return;
      }
      const next = viewFromHash(window.location.hash);
      if (next !== viewRef.current && !confirmLeaveCards()) {
        // Stay: the browser already changed the address — put it back.
        const { pathname, search } = window.location;
        window.history.pushState(null, '', `${pathname}${search}${hashForView(viewRef.current)}`);
        return;
      }
      setPracticing(false);
      viewRef.current = next;
      setView(next);
    };
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, [confirmLeaveCards]);

  const go = useCallback((next: View) => {
    const url = urlForView(next, window.location);
    if (url !== null) window.history.pushState(null, '', url);
    setPracticing(false);
    viewRef.current = next;
    setView(next);
    window.scrollTo(0, 0);
  }, []);

  /** Open the study session (from a reminder): the home section, then the session. */
  const openReview = useCallback(() => {
    if (viewRef.current !== 'home' && !confirmLeaveCards()) return;
    go('home');
    setReviewRequested(true);
  }, [confirmLeaveCards, go]);
  const openReviewRef = useRef(openReview);
  useEffect(() => {
    openReviewRef.current = openReview;
  }, [openReview]);

  // `#/review` at start: drop the hash (Back / reload are a plain home visit).
  useEffect(() => {
    if (!isReviewLink(window.location.hash)) return;
    const { pathname, search } = window.location;
    window.history.replaceState(null, '', `${pathname}${search}`);
  }, []);

  // A reminder tapped while the app is open: the service worker focuses this
  // window and posts a message — no reload, no second window.
  useEffect(() => {
    const container = 'serviceWorker' in navigator ? navigator.serviceWorker : null;
    if (!container) return;
    const onMessage = (e: MessageEvent) => {
      if (isOpenReviewMessage(e.data)) openReviewRef.current();
    };
    container.addEventListener('message', onMessage);
    return () => container.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    void reminders.repair();
  }, [reminders]);

  const navigate = useCallback(
    (next: View) => {
      if (confirmLeaveCards()) go(next);
    },
    [confirmLeaveCards, go]
  );

  const openCards = useCallback(
    (status: StatusFilter, focus?: CardsEntry['focus']) => {
      // Re-mounts "Карточки" (new `seq`), so an open editor would be lost too.
      if (!confirmLeaveCards()) return;
      setCardsEntry((prev) => ({ status, focus, seq: prev.seq + 1 }));
      go('cards');
    },
    [confirmLeaveCards, go]
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
    if (!confirmLeaveCards()) return;
    setPracticing(true);
    window.scrollTo(0, 0);
  }, [confirmLeaveCards]);

  const refreshStats = useCallback(async () => {
    setStats(await engine.getStats());
    // Everything that can move a due date (an answer, an edit, an import, a
    // restore, the daily limit, a new day) ends up here: keep the push
    // server's copy of the schedule current. Debounced; a no-op when unchanged.
    reminders.requestSync();
  }, [engine, reminders]);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  // Back in the foreground (TASK_033): an installed app is resumed, not
  // reloaded — refresh "today" and, on a new day, start a new study session.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') {
        // Leaving the app (usually right after studying): send the schedule now.
        reminders.flush();
        return;
      }
      setResumeTick((tick) => tick + 1);
      void refreshStats();
      const now = Date.now();
      setSessionDay((day) =>
        shouldStartNewSession(day, now, reviewPhaseRef.current === 'session') ? localDayStart(now) : day
      );
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refreshStats, reminders]);

  const exitReview = useCallback(() => {
    setReviewPhase('home');
    const now = Date.now();
    setSessionDay((day) => (shouldStartNewSession(day, now, false) ? localDayStart(now) : day));
  }, []);

  // Typed text that a reload or closing the tab would lose (TASK_033).
  const hasUnsavedWork = useCallback(
    () => createForm.hasUnsavedChanges() || Boolean(unsavedEdit.current?.()),
    [createForm]
  );
  const reloading = useRef(false);
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (reloading.current || !hasUnsavedWork()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsavedWork]);

  const applyUpdate = useCallback(() => {
    if (hasUnsavedWork() && !window.confirm('Введённый текст карточки не сохранён и пропадёт. Обновить сейчас?')) return;
    reloading.current = true;
    window.location.reload();
  }, [hasUnsavedWork]);

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
  const settingsReady = bootstrap === 'ready' && settingsAppliedTo === session;
  const inSession = practicing || (view === 'home' && reviewPhase === 'session');

  useEffect(() => {
    if (!reviewRequested || !settingsReady || view !== 'home' || practicing) return;
    setReviewRequested(false);
    setReviewPhase('session');
  }, [reviewRequested, settingsReady, view, practicing]);

  return (
    <div className={inSession ? 'app in-session' : 'app'}>
      <AppHeader
        streakDays={stats ? stats.streakDays : null}
        reviewedToday={(stats?.reviewsToday ?? 0) > 0}
        onOpenSettings={inSession ? undefined : () => navigate('profile')}
      />
      {!inSession && <MainNav view={view} onNavigate={onNavigate} />}
      {updateReady && !inSession && (
        <div className="notice notice-info update-banner" role="status">
          <span>Доступна новая версия ALSAVI.</span>
          <button type="button" className="btn-secondary" onClick={applyUpdate}>
            Обновить
          </button>
        </div>
      )}
      {practicing ? (
        <PracticeSession loadCards={loadPracticeCards} onExit={() => openCards('difficult')} />
      ) : view === 'home' ? (
        settingsReady ? (
          reviewPhase === 'home' ? (
            <HomeScreen
              engine={engine}
              session={session}
              onStart={() => setReviewPhase('session')}
              onOpenCards={onHomeOpenCards}
              onOpenStats={() => navigate('stats')}
              refreshKey={resumeTick}
            />
          ) : (
            <ReviewSession
              engine={engine}
              session={session}
              onReviewed={() => void refreshStats()}
              onExit={exitReview}
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
          refreshKey={resumeTick}
        />
      ) : view === 'profile' ? (
        <ProfileScreen
          engine={engine}
          store={store}
          onChanged={() => void refreshStats()}
          newCardsPerDay={newCardsPerDay}
          limitReady={settingsReady}
          onLimitChange={onLimitChange}
          limitSaving={limitSaving}
          limitSaveError={limitSaveError}
          theme={theme}
          onThemeChange={onThemeChange}
          reminders={reminders}
          platform={platform}
          refreshKey={resumeTick}
        />
      ) : (
        <CardManager
          key={cardsEntry.seq}
          initialStatus={cardsEntry.status}
          initialFocus={cardsEntry.focus}
          engine={engine}
          onChanged={() => void refreshStats()}
          onPractice={startPractice}
          createForm={createForm}
          registerUnsavedCheck={registerUnsavedCheck}
        />
      )}
    </div>
  );
}
