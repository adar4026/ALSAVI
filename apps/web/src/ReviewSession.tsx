import type { Card, CardState, IntervalPreview, LearningEngine, Rating } from '@alsavi/engine';
import { StudySession } from '@alsavi/engine';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatInterval } from './format';

const RATING_LABELS: Record<Rating, string> = {
  again: 'Снова',
  hard: 'Трудно',
  good: 'Хорошо',
  easy: 'Легко',
};

const RATINGS: Rating[] = ['again', 'hard', 'good', 'easy'];

const STATE_LABELS: Record<CardState, string> = {
  new: 'новая',
  learning: 'изучается',
  review: 'на повторении',
  relearning: 'переучивается',
};

interface Props {
  engine: LearningEngine;
  onReviewed: () => void;
}

export function ReviewSession({ engine, onReviewed }: Props) {
  const session = useMemo(() => new StudySession(engine), [engine]);
  const [current, setCurrent] = useState<Card | null>(null);
  const [preview, setPreview] = useState<IntervalPreview | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadNext = useCallback(async () => {
    setLoading(true);
    const card = await session.nextCard();
    setCurrent(card);
    setPreview(card ? await engine.previewIntervals(card.id) : null);
    setRevealed(false);
    setLoading(false);
  }, [engine, session]);

  useEffect(() => {
    void loadNext();
  }, [loadNext]);

  async function answer(rating: Rating) {
    if (!current) return;
    await engine.review(current.id, rating);
    onReviewed();
    await loadNext();
  }

  if (loading) return <div className="card-panel" />;

  if (!current) {
    return (
      <div className="card-panel">
        <div className="empty-state">
          Всё повторено. 🎉
          <br />
          Добавь новые карточки или возвращайся, когда подойдёт срок повторения.
        </div>
        <button className="btn-primary" onClick={() => void loadNext()}>
          Проверить снова
        </button>
      </div>
    );
  }

  const now = Date.now();

  return (
    <div>
      <div className="card-panel">
        <span className={`state-badge state-${current.state}`}>
          {STATE_LABELS[current.state]}
        </span>
        <div className="card-front">{current.front}</div>
        {revealed ? (
          <div className="card-back">{current.back}</div>
        ) : (
          <button className="btn-primary" onClick={() => setRevealed(true)}>
            Показать ответ
          </button>
        )}
      </div>
      {revealed && preview && (
        <div className="answer-buttons">
          {RATINGS.map((r) => (
            <button key={r} onClick={() => void answer(r)}>
              {RATING_LABELS[r]}
              <span className="interval">{formatInterval(now, preview[r])}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
