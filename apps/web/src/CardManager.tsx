import type { CardView, LearningEngine } from '@alsavi/engine';
import type { Note } from '@alsavi/engine';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type RefObject,
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
import { CARD_FORMS } from './home-view';
import { Icon } from './Icon';
import { draftFromNote, NoteFormController } from './note-form';
import { NoteForm } from './NoteForm';
import { difficultPracticeCards } from './practice-flow';
import { countLabel } from './stats-view';
import { Banner, Button, Dialog, IconButton, ScreenHeader, Sheet, SheetController, toasts } from './ui';

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
  onChanged: () => void;
  /** State filter to open the list with (e.g. 'difficult' from the statistics screen). */
  initialStatus?: StatusFilter;
  /**
   * `#/cards/new` (TASK_040): the "Новое слово" sheet is open over the list.
   * Opening and closing it is the address's business (`App`), so "Назад"
   * closes it too.
   */
  createOpen?: boolean;
  /** "+" / empty list: open the "Новое слово" sheet. */
  onAdd: () => void;
  /**
   * Close the "Новое слово" sheet: `back` returns where it was opened from;
   * `replace` stays on the list (to show a word right after).
   */
  onCloseCreate: (how: 'back' | 'replace') => void;
  /** Show one word (`#/cards/<id>`) — from the "Добавлено · Открыть" toast. */
  onOpenNote: (noteId: string) => void;
  /**
   * `#/cards/<noteId>` (TASK_037): bring this word's row into view once the
   * list has loaded — the card view replaces this in TASK_041.
   */
  initialNoteId?: string;
  /** The word of `initialNoteId` is not in the collection. */
  onMissingNote?: () => void;
  /** Start the difficult-words practice (TASK_032). */
  onPractice?: () => void;
  /**
   * The new-card form's controller, owned by `App` (TASK_033): a word typed
   * but not yet added survives switching to another section and back.
   */
  createForm: NoteFormController;
  /**
   * Lets `App` ask, before leaving this screen, whether an open card editor
   * holds unsaved changes (TASK_033). Called with `null` on unmount.
   */
  registerUnsavedCheck?: (check: (() => boolean) | null) => void;
}

export function CardManager({
  engine,
  onChanged,
  initialStatus = 'all',
  createOpen = false,
  onAdd,
  onCloseCreate,
  onOpenNote,
  initialNoteId,
  onMissingNote,
  onPractice,
  createForm,
  registerUnsavedCheck,
}: Props) {
  // A render snapshot of `engine.listCardViews()`, re-read after every write —
  // the Engine stays the only source of truth (no parallel copy is edited).
  const [views, setViews] = useState<CardView[]>([]);
  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ListFilter>(() => ({ ...EMPTY_FILTER, status: initialStatus }));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [scrollToId, setScrollToId] = useState<string | null>(null);
  const listTitle = useRef<HTMLHeadingElement>(null);
  const undoButton = useRef<HTMLButtonElement>(null);

  // The open edit sheet's controller (at most one), for the unsaved-changes check.
  const editor = useRef<NoteFormController | null>(null);
  useEffect(() => {
    if (!registerUnsavedCheck) return;
    registerUnsavedCheck(() => editor.current?.hasUnsavedChanges() ?? false);
    return () => registerUnsavedCheck(null);
  }, [registerUnsavedCheck]);
  const archive = useMemo(() => new ArchiveFlow(engine), [engine]);
  const archiveState = useSyncExternalStore(archive.subscribe, archive.getState);

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

  // Opened on a specific filter (from "Статистика"): once the list has loaded
  // (before that the page may be too short to scroll), bring the list — not
  // the add form — into view and move focus to its heading. Only once.
  const revealedList = useRef(false);
  useEffect(() => {
    if (initialStatus === 'all' || !loaded || revealedList.current) return;
    revealedList.current = true;
    listTitle.current?.scrollIntoView({ block: 'start' });
    listTitle.current?.focus({ preventScroll: true });
  }, [initialStatus, loaded]);

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
  // Cards the practice would show — the same selection it loads itself.
  const practiceCount = useMemo(() => difficultPracticeCards(views).length, [views]);
  const filtersActive = filter.query.trim() !== '' || filter.tags.length > 0 || filter.status !== 'all';

  // Bring a card opened from elsewhere (e.g. the duplicate warning) into view.
  useEffect(() => {
    if (!scrollToId) return;
    const row = document.getElementById(`note-${scrollToId}`);
    row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // Focus the row for keyboard and screen-reader users — unless its editor
    // already took focus (the duplicate warning opens the word for editing).
    if (row && !row.contains(document.activeElement)) row.focus({ preventScroll: true });
    setScrollToId(null);
  }, [scrollToId, visible]);

  // `#/cards/<noteId>` (TASK_037): once loaded, show that word — in the archive
  // filter if it is archived — or report that it does not exist. Only once.
  const handledNote = useRef(false);
  useEffect(() => {
    if (!initialNoteId || !loaded || handledNote.current) return;
    handledNote.current = true;
    const entry = entries.find((e) => e.note.id === initialNoteId);
    if (!entry) {
      onMissingNote?.();
      return;
    }
    setFilter({ ...EMPTY_FILTER, status: entry.archived ? 'archived' : 'all' });
    setScrollToId(entry.note.id);
  }, [initialNoteId, loaded, entries, onMissingNote]);

  const afterWrite = useCallback(async () => {
    await reload();
    onChanged();
  }, [reload, onChanged]);

  // Words added since the sheet last opened: "Отмена" becomes "Готово".
  const [addedHere, setAddedHere] = useState(0);
  useEffect(() => {
    if (createOpen) setAddedHere(0);
  }, [createOpen]);
  // A new word is saved: the sheet stays open for the next one; a toast says
  // what was added and can open it.
  const onCreated = useCallback(
    (note: Note) => {
      setAddedHere((n) => n + 1);
      void afterWrite();
      toasts.show({ message: `Добавлено: ${note.front}`, action: { label: 'Открыть', onAction: () => onOpenNote(note.id) } });
    },
    [afterWrite, onOpenNote]
  );

  function toggleTag(tag: string) {
    setFilter((f) => ({ ...f, tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag] }));
  }

  // The duplicate warning's "Открыть существующую": the new-word sheet closes
  // (its draft stays), the existing word opens for editing over the list.
  function openEntry(entry: NoteEntry) {
    archive.cancel();
    if (createOpen) onCloseCreate('replace');
    setFilter({ ...EMPTY_FILTER, status: entry.archived ? 'archived' : 'all' });
    setEditingId(entry.note.id);
    setScrollToId(entry.note.id);
  }

  const editingEntry = editingId ? (entries.find((e) => e.note.id === editingId) ?? null) : null;

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

  return (
    <div className="cards-screen">
      <ScreenHeader
        title="Карточки"
        actions={<IconButton icon="plus" label="Добавить слово" variant="accent" onClick={onAdd} />}
      />

      <section aria-labelledby="list-title">
        <h2 id="list-title" className="panel-title" ref={listTitle} tabIndex={-1}>
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
            {filter.status === 'difficult' && onPractice && practiceCount > 0 && (
              <div className="practice-cta">
                <Button
                  icon="play"
                  className="practice-start"
                  onClick={onPractice}
                  aria-label={`Повторить трудные слова: ${countLabel(practiceCount, CARD_FORMS)}`}
                >
                  Повторить трудные слова
                  <span className="practice-count">{practiceCount}</span>
                </Button>
                <span className="hint">Отдельная тренировка: расписание повторений не меняется.</span>
              </div>
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
            <Banner
              tone="info"
              className="archive-undo"
              actions={
                <>
                  <Button
                    ref={undoButton}
                    variant="secondary"
                    onClick={() => void unarchive(archiveState.lastArchived!)}
                    disabled={archiveState.busy}
                  >
                    Вернуть
                  </Button>
                  <IconButton icon="close" label="Скрыть уведомление" onClick={() => archive.dismissNotice()} />
                </>
              }
            >
              «{archiveState.lastArchived.label}» убрана в архив. История повторений сохранена.
            </Banner>
          )}
          {archiveState.error && !archiveState.pending && (
            <Banner tone="error">{archiveState.error}</Banner>
          )}
        </div>

        {loadError && (
          <Banner
            tone="error"
            actions={
              <Button variant="secondary" onClick={() => void reload()}>
                Повторить
              </Button>
            }
          >
            {loadError}
          </Banner>
        )}

        {loaded && !loadError && entries.length === 0 && (
          <div className="list-empty">
            <div className="empty-state">Карточек пока нет. Добавьте первое слово — оно сразу появится в очереди на Главной.</div>
            <Button icon="plus" onClick={onAdd}>
              Добавить первое слово
            </Button>
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
              <Button variant="secondary" onClick={() => setFilter(EMPTY_FILTER)}>
                Сбросить фильтры
              </Button>
            )}
          </div>
        )}

        <ul className="card-list">
          {visible.map((entry) => (
            <li className="card-row" key={entry.note.id} id={`note-${entry.note.id}`} tabIndex={-1}>
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
                      <Button variant="danger" onClick={() => void confirmArchive()} disabled={archiveState.busy}>
                        Убрать в архив
                      </Button>
                      <Button variant="secondary" onClick={() => archive.cancel()} disabled={archiveState.busy} autoFocus>
                        Отмена
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="row-actions">
                    <Button
                      variant="secondary"
                      aria-label={`Редактировать «${entry.note.front}»`}
                      onClick={() => {
                        archive.cancel();
                        setEditingId(entry.note.id);
                      }}
                    >
                      Изменить
                    </Button>
                    {entry.archived ? (
                      <Button
                        variant="secondary"
                        aria-label={`Вернуть «${entry.note.front}» из архива`}
                        onClick={() => void unarchive({ noteId: entry.note.id, label: entry.note.front })}
                        disabled={archiveState.busy}
                      >
                        Вернуть
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        aria-label={`Убрать «${entry.note.front}» в архив`}
                        onClick={() => {
                          setEditingId(null);
                          archive.request({ noteId: entry.note.id, label: entry.note.front });
                        }}
                      >
                        В архив
                      </Button>
                    )}
                  </div>
                )}
              </>
            </li>
          ))}
        </ul>
      </section>

      <Sheet
        open={createOpen}
        title="Новое слово"
        onRequestClose={() => onCloseCreate('back')}
        leading={
          addedHere === 0 && (
            <Button variant="tertiary" onClick={() => onCloseCreate('back')}>
              Отмена
            </Button>
          )
        }
        trailing={
          addedHere > 0 && (
            <Button variant="tertiary" onClick={() => onCloseCreate('back')}>
              Готово
            </Button>
          )
        }
      >
        <NoteForm
          controller={createForm}
          tagSuggestions={tagSuggestions}
          onSaved={onCreated}
          onOpenDuplicate={openEntry}
          autoFocus
        />
      </Sheet>

      {editingEntry && (
        <EditSheet
          key={editingEntry.note.id}
          engine={engine}
          entry={editingEntry}
          controllerRef={editor}
          tagSuggestions={tagSuggestions}
          onClosed={(saved) => {
            const id = editingEntry.note.id;
            setEditingId(null);
            if (saved) void afterWrite();
            // Opened from the duplicate warning, the sheet's return target (in
            // the closed "Новое слово" sheet) is gone: land on the word's row.
            // Runs after the sheet's own focus restore.
            setTimeout(() => {
              if (document.activeElement === document.body) document.getElementById(`note-${id}`)?.focus({ preventScroll: true });
            }, 50);
          }}
        />
      )}
    </div>
  );
}

/**
 * "Изменить слово" (TASK_040): the same form in a sheet, prefilled from the
 * note, with its own `NoteFormController` — created once per opened word, so
 * list reloads do not reset what is being typed. Closing with changes asks
 * "Отменить изменения?" (D-18); a save closes it.
 */
function EditSheet({
  engine,
  entry,
  controllerRef,
  tagSuggestions,
  onClosed,
}: {
  engine: LearningEngine;
  entry: NoteEntry;
  /** Points at this editor's controller while it is open. */
  controllerRef: RefObject<NoteFormController | null>;
  tagSuggestions: readonly string[];
  onClosed: (saved: boolean) => void;
}) {
  const [form] = useState(
    () => new NoteFormController(engine, { kind: 'edit', noteId: entry.note.id }, draftFromNote(entry.note))
  );
  const [sheet] = useState(() => {
    const s = new SheetController({ hasUnsavedChanges: () => form.hasUnsavedChanges(), confirmDiscard: true });
    s.open();
    return s;
  });
  const phase = useSyncExternalStore(sheet.subscribe, sheet.getPhase);
  useEffect(() => {
    controllerRef.current = form;
    return () => {
      if (controllerRef.current === form) controllerRef.current = null;
    };
  }, [form, controllerRef]);
  const onClosedRef = useRef(onClosed);
  useEffect(() => {
    onClosedRef.current = onClosed;
  });
  useEffect(() => {
    if (phase === 'closed') onClosedRef.current(sheet.lastReason === 'done');
  }, [phase, sheet]);
  const onSaved = useCallback(() => void sheet.requestClose('done'), [sheet]);

  return (
    <>
      <Sheet
        open={phase !== 'closed'}
        title="Изменить слово"
        onRequestClose={(reason) => void sheet.requestClose(reason)}
        leading={
          <Button variant="tertiary" onClick={() => void sheet.requestClose('cancel')}>
            Отмена
          </Button>
        }
      >
        <NoteForm controller={form} tagSuggestions={tagSuggestions} onSaved={onSaved} />
      </Sheet>
      <Dialog
        open={phase === 'confirming'}
        title="Отменить изменения?"
        message={<>Изменения в «{entry.note.front}» не сохранятся.</>}
        confirmLabel="Отменить изменения"
        cancelLabel="Продолжить"
        destructive
        onConfirm={() => sheet.discard()}
        onCancel={() => sheet.keepEditing()}
      />
    </>
  );
}
