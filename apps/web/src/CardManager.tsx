import type { CardView, EngineStore, LearningEngine } from '@alsavi/engine';
import { backupFilename, exportBackup, restoreBackup } from '@alsavi/backup';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { ArchiveFlow, type ArchiveTarget } from './archive-flow';
import {
  buildNoteEntries,
  collectTags,
  EMPTY_FILTER,
  filterEntries,
  type ListFilter,
  type NoteEntry,
  type NoteStatus,
  type StatusFilter,
} from './card-list';
import { formatInterval } from './format';
import { importApkgFile, type ImportReport } from './importApkg';
import { draftFromNote, NoteFormController } from './note-form';
import { NoteForm } from './NoteForm';

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

const STATUS_FILTERS: Array<[StatusFilter, string]> = [
  ['all', 'Все'],
  ['new', 'Новые'],
  ['learning', 'Изучаются'],
  ['due', 'К повторению'],
  ['difficult', 'Трудные'],
  ['archived', 'Архив'],
];

function statusLabel(entry: NoteEntry, now: number): string {
  const labels: Record<NoteStatus, string> = {
    due: 'к повторению',
    learning: 'изучается',
    new: 'новая',
    review: `повтор через ${formatInterval(now, entry.nextDue)}`,
  };
  return labels[entry.status];
}

interface Props {
  engine: LearningEngine;
  store: EngineStore;
  onChanged: () => void;
  /** Current daily new-card limit (`null` = unlimited). Owned by `App`. */
  newCardsPerDay: number | null;
  /** Persist + apply a new daily new-card limit. Owned by `App`. */
  onLimitChange: (value: number | null) => void;
  /** A save is in flight — the control is disabled to prevent overlapping saves. */
  limitSaving: boolean;
  /** Set only when the most recent save attempt failed; cleared on the next attempt. */
  limitSaveError: string | null;
}

/** `null` -> empty (unlimited); a number -> its decimal string. */
function formatLimit(value: number | null): string {
  return value === null ? '' : String(value);
}

/** Empty/invalid/negative input -> unlimited (`null`); otherwise a non-negative integer. */
function parseLimit(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

export function CardManager({
  engine,
  store,
  onChanged,
  newCardsPerDay,
  onLimitChange,
  limitSaving,
  limitSaveError,
}: Props) {
  // A render snapshot of `engine.listCardViews()`, re-read after every write —
  // the Engine stays the only source of truth (no parallel copy is edited).
  const [views, setViews] = useState<CardView[]>([]);
  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ListFilter>(EMPTY_FILTER);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [scrollToId, setScrollToId] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [limitInput, setLimitInput] = useState(() => formatLimit(newCardsPerDay));
  const fileInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const frontInput = useRef<HTMLInputElement>(null);
  const undoButton = useRef<HTMLButtonElement>(null);

  const createForm = useMemo(() => new NoteFormController(engine, { kind: 'create' }), [engine]);
  const archive = useMemo(() => new ArchiveFlow(engine), [engine]);
  const archiveState = useSyncExternalStore(archive.subscribe, archive.getState);

  useEffect(() => {
    setLimitInput(formatLimit(newCardsPerDay));
  }, [newCardsPerDay]);

  function commitLimit() {
    const parsed = parseLimit(limitInput);
    setLimitInput(formatLimit(parsed));
    onLimitChange(parsed);
  }

  const reload = useCallback(async () => {
    try {
      const all = await engine.listCardViews();
      setViews(all);
      setLoadedAt(Date.now());
      setLoadError(null);
    } catch (err) {
      setLoadError(`Не удалось загрузить карточки: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoaded(true);
    }
  }, [engine]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const entries = useMemo(() => buildNoteEntries(views, loadedAt), [views, loadedAt]);
  const activeEntries = useMemo(() => entries.filter((e) => !e.archived), [entries]);
  const tagSuggestions = useMemo(() => collectTags(activeEntries).map((t) => t.tag), [activeEntries]);
  const showingArchive = filter.status === 'archived';
  const filterTags = useMemo(() => {
    const scoped = collectTags(entries.filter((e) => e.archived === showingArchive));
    // Keep selected tags visible even if no note in this scope carries them anymore.
    for (const tag of filter.tags) if (!scoped.some((t) => t.tag === tag)) scoped.push({ tag, count: 0 });
    return scoped;
  }, [entries, showingArchive, filter.tags]);
  const visible = useMemo(() => filterEntries(entries, filter, loadedAt), [entries, filter, loadedAt]);
  const filtersActive = filter.query.trim() !== '' || filter.tags.length > 0 || filter.status !== 'all';

  // Bring a card opened from elsewhere (e.g. the duplicate warning) into view.
  useEffect(() => {
    if (!scrollToId) return;
    document.getElementById(`note-${scrollToId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setScrollToId(null);
  }, [scrollToId, visible]);

  const afterWrite = useCallback(async () => {
    await reload();
    onChanged();
  }, [reload, onChanged]);

  const onCreated = useCallback(() => void afterWrite(), [afterWrite]);

  function toggleTag(tag: string) {
    setFilter((f) => ({ ...f, tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag] }));
  }

  function openEntry(entry: NoteEntry) {
    archive.cancel();
    setFilter({ ...EMPTY_FILTER, status: entry.archived ? 'archived' : 'all' });
    setEditingId(entry.note.id);
    setScrollToId(entry.note.id);
  }

  function focusFirstCardField() {
    frontInput.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    frontInput.current?.focus();
  }

  async function confirmArchive() {
    if (!(await archive.confirm())) return;
    await afterWrite();
    // The archived row is gone: move focus to the undo action instead of losing it.
    undoButton.current?.focus();
  }

  async function unarchive(target: ArchiveTarget) {
    if (await archive.unarchive(target)) await afterWrite();
  }

  function onDialogKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') archive.cancel();
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
    <div className="cards-screen">
      <section className="panel" aria-labelledby="add-title">
        <h2 id="add-title" className="panel-title">
          Новая карточка
        </h2>
        <NoteForm
          controller={createForm}
          tagSuggestions={tagSuggestions}
          onSaved={onCreated}
          onOpenDuplicate={openEntry}
          frontInputRef={frontInput}
        />
      </section>

      <details className="tools">
        <summary>Импорт, резервная копия и лимит новых карточек</summary>
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
          <label className="reverse-toggle">
            Новых карточек в день:
            <input
              className="limit-input"
              type="number"
              min={0}
              step={1}
              placeholder="не ограничено"
              value={limitInput}
              disabled={limitSaving}
              onChange={(e) => setLimitInput(e.target.value)}
              onBlur={commitLimit}
            />
          </label>
          {limitSaving && <span className="import-status">Сохранение…</span>}
          {limitSaveError && <span className="import-status">{limitSaveError}</span>}
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
      </details>

      <section aria-labelledby="list-title">
        <h2 id="list-title" className="panel-title">
          Мои карточки
        </h2>

        {entries.length > 0 && (
          <div className="list-controls">
            <input
              type="search"
              className="search-input"
              value={filter.query}
              onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
              placeholder="Поиск: слово, перевод, пример, заметка"
              aria-label="Поиск карточек"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
            />
            <div className="chip-row" role="group" aria-label="Состояние">
              {STATUS_FILTERS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className="chip"
                  aria-pressed={filter.status === value}
                  onClick={() =>
                    // Tags of the archive and of the active list differ — reset them only across that switch.
                    setFilter((f) => ({ ...f, status: value, tags: (value === 'archived') === showingArchive ? f.tags : [] }))
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            {filter.status === 'difficult' && (
              <div className="hint">Карточки, которые вы хотя бы раз забыли после того, как уже выучили.</div>
            )}
            {filterTags.length > 0 && (
              <div className="chip-row" role="group" aria-label="Фильтр по тегам">
                {filterTags.map(({ tag, count }) => (
                  <button
                    key={tag}
                    type="button"
                    className="chip chip-tag"
                    aria-pressed={filter.tags.includes(tag)}
                    aria-label={`Тег ${tag}, карточек: ${count}`}
                    onClick={() => toggleTag(tag)}
                  >
                    #{tag} <span className="chip-count">{count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div aria-live="polite">
          {archiveState.lastArchived && (
            <div className="notice notice-info">
              <span>
                «{archiveState.lastArchived.label}» убрана в архив. История повторений сохранена.
              </span>
              <span className="notice-actions">
                <button
                  ref={undoButton}
                  type="button"
                  className="btn-secondary"
                  onClick={() => void unarchive(archiveState.lastArchived!)}
                  disabled={archiveState.busy}
                >
                  Вернуть
                </button>
                <button
                  type="button"
                  className="btn-icon"
                  aria-label="Скрыть уведомление"
                  onClick={() => archive.dismissNotice()}
                >
                  ×
                </button>
              </span>
            </div>
          )}
          {archiveState.error && !archiveState.pending && (
            <div className="notice notice-error" role="alert">
              {archiveState.error}
            </div>
          )}
        </div>

        {loadError && (
          <div className="notice notice-error" role="alert">
            {loadError}{' '}
            <button type="button" className="btn-secondary" onClick={() => void reload()}>
              Повторить
            </button>
          </div>
        )}

        {loaded && !loadError && entries.length === 0 && (
          <div className="list-empty">
            <div className="empty-state">Карточек пока нет. Добавьте первое слово — оно сразу появится в «Учиться сегодня».</div>
            <button type="button" className="btn-primary" onClick={focusFirstCardField}>
              Добавить первую карточку
            </button>
          </div>
        )}

        {entries.length > 0 && (
          <div className="list-count">
            {showingArchive ? 'В архиве' : 'Найдено'}: {visible.length}
            {filtersActive && !showingArchive ? ` из ${activeEntries.length}` : ''}
          </div>
        )}

        {entries.length > 0 && visible.length === 0 && (
          <div className="list-empty">
            <div className="empty-state">
              {showingArchive && !filter.query && filter.tags.length === 0
                ? 'В архиве пусто.'
                : filter.query.trim()
                  ? `Ничего не найдено по запросу «${filter.query.trim()}».`
                  : 'Нет карточек с такими фильтрами.'}
            </div>
            {filtersActive && (
              <button type="button" className="btn-secondary" onClick={() => setFilter(EMPTY_FILTER)}>
                Сбросить фильтры
              </button>
            )}
          </div>
        )}

        <ul className="card-list">
          {visible.map((entry) => (
            <li className="card-row" key={entry.note.id} id={`note-${entry.note.id}`}>
              {editingId === entry.note.id ? (
                <NoteEditor
                  engine={engine}
                  entry={entry}
                  tagSuggestions={tagSuggestions}
                  onDone={(saved) => {
                    setEditingId(null);
                    if (saved) void afterWrite();
                  }}
                />
              ) : (
                <>
                  <div className="row-main">
                    <div className="row-head">
                      <span className="front" lang="es">
                        {entry.note.front}
                      </span>
                      <span className={`status status-${entry.archived ? 'archived' : entry.status}`}>
                        {entry.archived ? 'в архиве' : statusLabel(entry, loadedAt)}
                      </span>
                    </div>
                    <div className="back">{entry.note.back}</div>
                    {entry.note.example && <div className="example">{entry.note.example}</div>}
                    {entry.note.memo && <div className="memo">{entry.note.memo}</div>}
                    {(entry.tags.length > 0 || entry.cards.length > 1) && (
                      <div className="row-meta">
                        {entry.tags.map((t) => (
                          <span key={t} className="tag">
                            #{t}
                          </span>
                        ))}
                        {entry.cards.length > 1 && <span className="meta-note">+ обратная карточка</span>}
                      </div>
                    )}
                  </div>
                  {archiveState.pending?.noteId === entry.note.id ? (
                    <div
                      className="confirm"
                      role="alertdialog"
                      aria-labelledby={`confirm-${entry.note.id}`}
                      aria-describedby={`confirm-desc-${entry.note.id}`}
                      onKeyDown={onDialogKeyDown}
                    >
                      <strong id={`confirm-${entry.note.id}`}>Убрать «{entry.note.front}» в архив?</strong>
                      <p id={`confirm-desc-${entry.note.id}`}>
                        Карточка исчезнет из повторений и из списка. История повторений сохранится, вернуть
                        карточку можно в разделе «Архив». «Отмена» ничего не изменит.
                      </p>
                      {archiveState.error && <div className="field-error">{archiveState.error}</div>}
                      <div className="form-actions">
                        <button
                          type="button"
                          className="btn-danger"
                          onClick={() => void confirmArchive()}
                          disabled={archiveState.busy}
                        >
                          Убрать в архив
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => archive.cancel()}
                          disabled={archiveState.busy}
                          autoFocus
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        aria-label={`Редактировать «${entry.note.front}»`}
                        onClick={() => {
                          archive.cancel();
                          setEditingId(entry.note.id);
                        }}
                      >
                        Изменить
                      </button>
                      {entry.archived ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          aria-label={`Вернуть «${entry.note.front}» из архива`}
                          onClick={() => void unarchive({ noteId: entry.note.id, label: entry.note.front })}
                          disabled={archiveState.busy}
                        >
                          Вернуть
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-secondary btn-quiet-danger"
                          aria-label={`Убрать «${entry.note.front}» в архив`}
                          onClick={() => {
                            setEditingId(null);
                            archive.request({ noteId: entry.note.id, label: entry.note.front });
                          }}
                        >
                          В архив
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Inline editor for one note: its own `NoteFormController`, prefilled from the note. */
function NoteEditor({
  engine,
  entry,
  tagSuggestions,
  onDone,
}: {
  engine: LearningEngine;
  entry: NoteEntry;
  tagSuggestions: readonly string[];
  onDone: (saved: boolean) => void;
}) {
  // Created once per opened editor: later list reloads must not reset what
  // the user is typing.
  const [controller] = useState(
    () => new NoteFormController(engine, { kind: 'edit', noteId: entry.note.id }, draftFromNote(entry.note))
  );
  return (
    <NoteForm
      controller={controller}
      tagSuggestions={tagSuggestions}
      onSaved={() => onDone(true)}
      onCancel={() => onDone(false)}
    />
  );
}
