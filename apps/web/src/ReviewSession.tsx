import type { Card, IntervalPreview, LearningEngine, Rating } from '@alsavi/engine';
import { useCallback, useEffect, useState } from 'react';
import { formatInterval } from './format';

const RATING_LABELS: Record<Rating, string> = {
  again: 'Снова',
  hard: 'Трудно',
  good: 'Хорошо',
  easy: 'Легко',
};

const RATINGS: Rating[] = ['again', 'hard', 'good', 'easy'];

interface Props {
  engine: LearningEngine;
  onReviewed: () => void;
}

export function ReviewSession({ engine, onReviewed }: Props) {
  const [current, setCurrent] = useState<Card | null>(null);
  const [preview, setPreview] = useState<IntervalPreview | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadNext = useCallback(async () => {
    setLoading(true);
    const due = await engine.getDueCards(1);
    const card = due[0] ?? null;
    setCurrent(card);
    setPreview(card ? await engine.previewIntervals(card.id) : null);
    setRevealed(false);
    setLoading(false);
  }, [engine]);

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
