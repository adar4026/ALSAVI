import type {
  CardState,
  CardView,
  IntervalPreview,
  LearningEngine,
  Rating,
  StudySession,
} from '@alsavi/engine';
import { useCallback, useEffect, useState } from 'react';
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
  session: StudySession;
  onReviewed: () => void;
}

export function ReviewSession({ engine, session, onReviewed }: Props) {
  const [current, setCurrent] = useState<CardView | null>(null);
  const [preview, setPreview] = useState<IntervalPreview | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  // TASK_020: distinguishes "nothing eligible at all" from "new cards exist
  // but are withheld by the daily limit" — nextCard()===null alone can't tell
  // these apart. Derived from the same selector as nextCard()/dueCount(), so
  // it never disagrees with what was (or wasn't) actually returned above.
  const [limitReached, setLimitReached] = useState(false);

  const loadNext = useCallback(async () => {
    setLoading(true);
    const card = await session.nextCard();
    if (card) {
      setCurrent((await engine.getCardView(card.id)) ?? null);
      setPreview(await engine.previewIntervals(card.id));
      setLimitReached(false);
    } else {
      setCurrent(null);
      setPreview(null);
      setLimitReached((await session.newCardsWithheldByLimit()) > 0);
    }
    setRevealed(false);
    setLoading(false);
  }, [engine, session]);

  useEffect(() => {
    void loadNext();
  }, [loadNext]);

  const answer = useCallback(
    async (rating: Rating) => {
      if (!current) return;
      // Single answer path: the session delegates recording to engine.review
      // and applies bury-siblings — no separate call to keep in sync.
      await session.answer(current.card.id, rating);
      onReviewed();
      await loadNext();
    },
    [current, session, onReviewed, loadNext]
  );

  // Keyboard shortcuts: Space reveals the answer; 1..4 grade the revealed card.
  // Active only while the session screen is mounted; ignored when typing in a
  // field or when a modifier is held.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (loading || !current) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        return;
      }
      if (!revealed) {
        if (e.code === 'Space' || e.key === ' ') {
          e.preventDefault();
          setRevealed(true);
        }
        return;
      }
      const idx = ['1', '2', '3', '4'].indexOf(e.key);
      if (idx !== -1) {
        e.preventDefault();
        void answer(RATINGS[idx]!);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loading, current, revealed, answer]);

  if (loading) return <div className="card-panel" />;

  if (!current) {
    return (
      <div className="card-panel">
        <div className="empty-state">
          {limitReached ? (
            <>
              Дневной лимит новых карточек достигнут.
              <br />
              Новые карточки вернутся завтра. Повторение уже изученных
              карточек продолжится, когда подойдёт их срок.
            </>
          ) : (
            <>
              Всё повторено. 🎉
              <br />
              Добавь новые карточки или возвращайся, когда подойдёт срок повторения.
            </>
          )}
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
        <span className={`state-badge state-${current.card.state}`}>
          {STATE_LABELS[current.card.state]}
        </span>
        <div className="card-front">{current.front}</div>
        {revealed ? (
          <div className="card-back">{current.back}</div>
        ) : (
          <>
            <button className="btn-primary" onClick={() => setRevealed(true)}>
              Показать ответ
            </button>
            <span className="hotkey-hint">Пробел</span>
          </>
        )}
      </div>
      {revealed && preview && (
        <>
          <div className="answer-buttons">
            {RATINGS.map((r) => (
              <button key={r} onClick={() => void answer(r)}>
                {RATING_LABELS[r]}
                <span className="interval">{formatInterval(now, preview[r])}</span>
              </button>
            ))}
          </div>
          <div className="hotkey-hint">1 · 2 · 3 · 4</div>
        </>
      )}
    </div>
  );
}
