import type { CardState, CardView, EngineStore, LearningEngine } from '@alsavi/engine';
import { backupFilename, exportBackup, restoreBackup } from '@alsavi/backup';
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
  store: EngineStore;
  onChanged: () => void;
}

export function CardManager({ engine, store, onChanged }: Props) {
  const [cards, setCards] = useState<CardView[]>([]);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [alsoReverse, setAlsoReverse] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);

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

  async function onExport() {
    setBackupStatus('Формирую резервную копию…');
    try {
      const json = await exportBackup(store);
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = backupFilename();
      a.click();
      URL.revokeObjectURL(url);
      setBackupStatus('Резервная копия сохранена.');
    } catch (err) {
      setBackupStatus(`Не удалось экспортировать: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function onRestore(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBackupStatus(null);
    const text = await file.text();
    try {
      // restoreBackup owns validate → confirm → replace; this callback is
      // only the UI's confirmation policy (window.confirm), given the parsed
      // metadata — no parsing/replace logic lives here.
      const outcome = await restoreBackup(store, text, (meta) =>
        window.confirm(
          `Восстановление заменит ВСЕ текущие данные на копию от ` +
            `${new Date(meta.exportedAt).toLocaleString()} ` +
            `(${meta.notes} заметок, ${meta.cards} карточек, ${meta.reviews} повторений).\n\n` +
            `Это действие необратимо. Продолжить?`
        )
      );
      switch (outcome.status) {
        case 'rejected':
          setBackupStatus(`Файл отклонён: ${outcome.error} Текущие данные не изменены.`);
          return;
        case 'cancelled':
          setBackupStatus('Восстановление отменено. Данные не изменены.');
          return;
        case 'restored':
          setBackupStatus(
            `Восстановлено: ${outcome.notes} заметок, ${outcome.cards} карточек, ${outcome.reviews} повторений.`
          );
          await reload();
          onChanged();
          return;
      }
    } catch (err) {
      setBackupStatus(`Ошибка восстановления: ${err instanceof Error ? err.message : String(err)}. Данные могли не измениться.`);
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
      <div className="import-row">
        <input
          ref={backupInput}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={(e) => void onRestore(e)}
        />
        <button className="btn-secondary" onClick={() => void onExport()}>
          Экспорт (резервная копия)
        </button>
        <button className="btn-secondary" onClick={() => backupInput.current?.click()}>
          Восстановить из копии
        </button>
        {backupStatus && <span className="import-status">{backupStatus}</span>}
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
