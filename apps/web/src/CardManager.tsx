import type { Card, LearningEngine } from '@alsavi/engine';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

const STATE_LABELS: Record<Card['state'], string> = {
  new: 'новая',
  learning: 'изучается',
  review: 'на повторении',
  relearning: 'переучивается',
};

interface Props {
  engine: LearningEngine;
  onChanged: () => void;
}

export function CardManager({ engine, onChanged }: Props) {
  const [cards, setCards] = useState<Card[]>([]);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');

  const reload = useCallback(async () => {
    const all = await engine.listCards();
    setCards(all.sort((a, b) => b.createdAt - a.createdAt));
  }, [engine]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!front.trim() || !back.trim()) return;
    await engine.addCard({ front, back });
    setFront('');
    setBack('');
    await reload();
    onChanged();
  }

  async function remove(id: string) {
    await engine.deleteCard(id);
    await reload();
    onChanged();
  }

  return (
    <div>
      <form className="add-form" onSubmit={(e) => void add(e)}>
        <div className="row">
          <input
            value={front}
            onChange={(e) => setFront(e.target.value)}
            placeholder="Слово (лицевая сторона)"
            autoFocus
          />
          <input
            value={back}
            onChange={(e) => setBack(e.target.value)}
            placeholder="Перевод (обратная сторона)"
          />
        </div>
        <button className="btn-primary" type="submit">
          Добавить карточку
        </button>
      </form>
      <div className="card-list">
        {cards.length === 0 && (
          <div className="empty-state">Карточек пока нет — добавь первую выше.</div>
        )}
        {cards.map((c) => (
          <div className="card-row" key={c.id}>
            <span className="front">{c.front}</span>
            <span className="back">{c.back}</span>
            <span className="state">{STATE_LABELS[c.state]}</span>
            <button className="delete" title="Удалить" onClick={() => void remove(c.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
