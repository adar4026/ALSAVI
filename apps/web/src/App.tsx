import { LearningEngine, type EngineStats } from '@alsavi/engine';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CardManager } from './CardManager';
import { DexieStore } from './dexie-store';
import { ReviewSession } from './ReviewSession';

type View = 'review' | 'cards';

export function App() {
  const engine = useMemo(() => new LearningEngine(new DexieStore()), []);
  const [view, setView] = useState<View>('review');
  const [stats, setStats] = useState<EngineStats | null>(null);

  const refreshStats = useCallback(async () => {
    setStats(await engine.getStats());
  }, [engine]);

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
              К повторению: <strong>{stats.dueNow}</strong>
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
        <ReviewSession engine={engine} onReviewed={() => void refreshStats()} />
      ) : (
        <CardManager engine={engine} onChanged={() => void refreshStats()} />
      )}
    </div>
  );
}
