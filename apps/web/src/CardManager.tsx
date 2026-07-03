import type { CardState, CardView, LearningEngine } from '@alsavi/engine';
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { importApkgFile, type ImportReport } from './importApkg';

const STATE_LABELS: Record<CardState, string> = {
  new: 'новая',
  learning: 'изучается',
  review: 'на повторении',
  relearning: 'переучивается',
};

const SKIP_LABELS: Record<string, string> = {
  'cloze-note-type': 'cloze',
  'fewer-than-2-fields': 'меньше 2 полей',
  'unsupported-template': 'неподдерживаемый шаблон',
  'empty-after-cleanup': 'пустой текст',
};

function describeReport(r: ImportReport): string {
  const skipped = r.skipped.reduce((n, s) => n + s.count, 0);
  let msg = `Импортировано ${r.importedNotes} заметок (${r.importedCards} карточек).`;
  if (skipped > 0) {
    const parts = r.skipped.map((s) => `${SKIP_LABELS[s.reason] ?? s.reason} — ${s.count}`);
    msg += ` Пропущено ${skipped}: ${parts.join(', ')}.`;
  }
  if (r.error) msg += ` Прервано с ошибкой: ${r.error}`;
  return msg;
}

interface Props {
  engine: LearningEngine;
  onChanged: () => void;
}

export function CardManager({ engine, onChanged }: Props) {
  const [cards, setCards] = useState<CardView[]>([]);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [alsoReverse, setAlsoReverse] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

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

  async function onImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setImportStatus(`Импорт «${file.name}»…`);
    try {
      const report = await importApkgFile(file, engine);
      setImportStatus(describeReport(report));
      await reload();
      onChanged();
    } catch (err) {
      setImportStatus(`Не удалось импортировать: ${err instanceof Error ? err.message : String(err)}`);
    }
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
      <div className="import-row">
        <input
          ref={fileInput}
          type="file"
          accept=".apkg"
          style={{ display: 'none' }}
          onChange={(e) => void onImport(e)}
        />
        <button className="btn-secondary" onClick={() => fileInput.current?.click()}>
          Импорт из Anki (.apkg)
        </button>
        {importStatus && <span className="import-status">{importStatus}</span>}
      </div>
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
