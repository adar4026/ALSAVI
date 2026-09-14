import type { EngineStats, StudySession, StudySessionOverview } from '@alsavi/engine';
import { useCallback, useEffect, useState } from 'react';

interface Props {
  session: StudySession;
  stats: EngineStats | null;
  onStart: () => void;
  onAddCard: () => void;
}

/**
 * "Учиться сегодня" home screen (TASK_022): today's plan before diving into
 * the per-card flow. No FSRS/IndexedDB/Scheduler vocabulary — only the three
 * counts a learner cares about, all derived from `StudySession.overview()`
 * (the same selector `nextCard()`/`dueCount()` use, so this screen and the
 * session it starts can never disagree about how many cards there are).
 */
export function ReviewHome({ session, stats, onStart, onAddCard }: Props) {
  const [overview, setOverview] = useState<StudySessionOverview | null>(null);

  const reload = useCallback(async () => {
    setOverview(await session.overview());
  }, [session]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!overview) return <div className="card-panel" />;

  if (stats?.totalCards === 0) {
    return (
      <div className="card-panel">
        <div className="empty-state">
          Пока нет ни одной карточки.
          <br />
          Добавь первое слово, чтобы начать учиться.
        </div>
        <button className="btn-primary btn-start" onClick={onAddCard}>
          Добавить первую карточку
        </button>
      </div>
    );
  }

  if (overview.total === 0) {
    return (
      <div className="card-panel">
        <div className="empty-state">
          {overview.newWithheld > 0 ? (
            <>
              На сегодня всё. 🎉
              <br />
              Дневной лимит новых карточек достигнут — новые вернутся завтра.
            </>
          ) : (
            <>
              На сегодня всё. 🎉
              <br />
              Возвращайся, когда подойдёт срок следующего повторения.
            </>
          )}
        </div>
        <button className="btn-secondary" onClick={() => void reload()}>
          Проверить снова
        </button>
      </div>
    );
  }

  return (
    <div className="card-panel home-panel">
      <div className="home-counts">
        <div className="home-count">
          <span className="home-count-value">{overview.newCount}</span>
          <span className="home-count-label">Новые</span>
        </div>
        <div className="home-count">
          <span className="home-count-value">{overview.learningCount}</span>
          <span className="home-count-label">В процессе</span>
        </div>
        <div className="home-count">
          <span className="home-count-value">{overview.reviewCount}</span>
          <span className="home-count-label">Повторить сегодня</span>
        </div>
      </div>
      <div className="home-total">Всего карточек сегодня: {overview.total}</div>
      <button
        className="btn-primary btn-start"
        onClick={onStart}
        aria-label={`Начать обучение, карточек сегодня: ${overview.total}`}
        autoFocus
      >
        Начать обучение
      </button>
    </div>
  );
}
