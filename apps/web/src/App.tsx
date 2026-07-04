import { LearningEngine, StudySession, type EngineStats } from '@alsavi/engine';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CardManager } from './CardManager';
import { DexieStore } from './dexie-store';
import { ReviewSession } from './ReviewSession';

type View = 'review' | 'cards';

export function App() {
  // Keep the store reference: backup/restore operates at the storage layer.
  const store = useMemo(() => new DexieStore(), []);
  const engine = useMemo(() => new LearningEngine(store), [store]);
  const session = useMemo(() => new StudySession(engine), [engine]);
  const [view, setView] = useState<View>('review');
  const [stats, setStats] = useState<EngineStats | null>(null);
  // "К повторению" reflects the session queue (due + learn-ahead), so it stays
  // in sync with what StudySession.nextCard() will actually show — not the
  // strict `stats.dueNow` engine counter.
  const [dueCount, setDueCount] = useState<number | null>(null);

  const refreshStats = useCallback(async () => {
    const [nextStats, nextDue] = await Promise.all([engine.getStats(), session.dueCount()]);
    setStats(nextStats);
    setDueCount(nextDue);
  }, [engine, session]);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

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
        <ReviewSession engine={engine} session={session} onReviewed={() => void refreshStats()} />
      ) : (
        <CardManager engine={engine} store={store} onChanged={() => void refreshStats()} />
      )}
    </div>
  );
}
