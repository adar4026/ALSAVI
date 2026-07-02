import type { CardState, CardView, LearningEngine } from '@alsavi/engine';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

const STATE_LABELS: Record<CardState, string> = {
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
  const [cards, setCards] = useState<CardView[]>([]);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [alsoReverse, setAlsoReverse] = useState(false);

  const reload = useCallback(async () => {
    const all = await engine.listCardViews();
    setCards(all.sort((a, b) => b.card.createdAt - a.card.createdAt));
  }, [engine]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!front.trim() || !back.trim()) return;
    await engine.addNote({
      front,
      back,
      directions: alsoReverse ? ['forward', 'reverse'] : ['forward'],
    });
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
        <label className="reverse-toggle">
          <input
            type="checkbox"
            checked={alsoReverse}
            onChange={(e) => setAlsoReverse(e.target.checked)}
          />
          Создать также обратную карточку
        </label>
        <button className="btn-primary" type="submit">
          Добавить {alsoReverse ? 'карточки' : 'карточку'}
        </button>
      </form>
      <div className="card-list">
        {cards.length === 0 && (
          <div className="empty-state">Карточек пока нет — добавь первую выше.</div>
        )}
        {cards.map((v) => (
          <div className="card-row" key={v.card.id}>
            <span className="front">{v.front}</span>
            <span className="back">{v.back}</span>
            <span className="state">{STATE_LABELS[v.card.state]}</span>
            <button className="delete" title="Удалить" onClick={() => void remove(v.card.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
