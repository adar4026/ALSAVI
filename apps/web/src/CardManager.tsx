import type { CardView, LearningEngine, Note } from '@alsavi/engine';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
  type SetStateAction,
} from 'react';
import { ArchiveFlow, type ArchiveTarget } from './archive-flow';
import {
  buildNoteEntries,
  collectTags,
  EMPTY_FILTER,
  filterEntries,
  LIST_PAGE,
  sortEntries,
  statusCounts,
  type ListFilter,
  type NoteEntry,
  type SortOrder,
  type StatusFilter,
} from './card-list';
import { CardDetail } from './CardDetail';
import { CardList } from './CardList';
import { collectionSummary } from './cards-view';
import type { CardTarget } from './nav';
import { draftFromNote, NoteFormController } from './note-form';
import { NoteForm } from './NoteForm';
import { difficultPracticeCards } from './practice-flow';
import { Button, Dialog, EmptyState, IconButton, ScreenHeader, Sheet, SheetController, toasts } from './ui';

/** The list and the card view side by side (master–detail) from this width. */
const SPLIT_QUERY = '(min-width: 1100px)';

function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia?.(query);
      mql?.addEventListener('change', onChange);
      return () => mql?.removeEventListener('change', onChange);
    },
    [query]
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia?.(query).matches ?? false);
}

interface Props {
  engine: LearningEngine;
  onChanged: () => void;
  /** State filter to open the list with (e.g. 'difficult' from the statistics screen). */
  initialStatus?: StatusFilter;
  /**
   * What the address shows besides the list (TASK_040/041): the "Новое
   * слово" sheet (`#/cards/new`) or one word (`#/cards/<id>`). Opening and
   * closing them is the address's business (`App`), so "Назад" closes them.
   */
  target?: CardTarget;
  /** "+" / empty list: open the "Новое слово" sheet. */
  onAdd: () => void;
  /** Show one word (`#/cards/<id>`): a row, the toast "Открыть", a duplicate. */
  onOpenNote: (noteId: string) => void;
  /** Close the sheet or the card view — back where it was opened from. */
  onCloseTarget: () => void;
  /** The word of `#/cards/<id>` is not in the collection. */
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

/**
 * "Карточки" (TASK_041): the list (`CardList`) and the card view
 * (`CardDetail`) over one snapshot of `engine.listCardViews()`, plus the
 * "Новое слово" / "Изменить слово" sheets and the archive dialog. On a phone
 * the card view replaces the list — the list stays mounted, so its filters,
 * order and scroll position are there on return; from 1100 px they sit side
 * by side.
 */
export function CardManager({
  engine,
  onChanged,
  initialStatus = 'all',
  target,
  onAdd,
  onOpenNote,
  onCloseTarget,
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
  const [filter, setFilterState] = useState<ListFilter>(() => ({ ...EMPTY_FILTER, status: initialStatus }));
  // Q10: chosen per visit, not saved.
  const [sort, setSortState] = useState<SortOrder>('newest');
  // Another filter or order starts again from the first page.
  const [limit, setLimit] = useState(LIST_PAGE);
  const setFilter = useCallback((next: SetStateAction<ListFilter>) => {
    setFilterState(next);
    setLimit(LIST_PAGE);
  }, []);
  const setSort = useCallback((next: SortOrder) => {
    setSortState(next);
    setLimit(LIST_PAGE);
  }, []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const split = useMediaQuery(SPLIT_QUERY);

  const createOpen = target?.kind === 'new';
  const detailId = target?.kind === 'note' ? target.id : null;

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
  const visible = useMemo(
    () => sortEntries(filterEntries(entries, filter, loadedAt), sort),
    [entries, filter, loadedAt, sort]
  );
  const counts = useMemo(() => statusCounts(entries, filter.query, loadedAt), [entries, filter.query, loadedAt]);
  // Cards the practice would show — the same selection it loads itself.
  const practiceCount = useMemo(() => difficultPracticeCards(views).length, [views]);

  const detailEntry = detailId ? (entries.find((e) => e.note.id === detailId) ?? null) : null;
  const editingEntry = editingId ? (entries.find((e) => e.note.id === editingId) ?? null) : null;

  // `#/cards/<id>` of a word that is not (or no longer) in the collection:
  // back to the list with a notice. Checked once the list has loaded.
  const reportedMissing = useRef<string | null>(null);
  useEffect(() => {
    if (!detailId || !loaded || loadError || detailEntry || reportedMissing.current === detailId) return;
    reportedMissing.current = detailId;
    onMissingNote?.();
  }, [detailId, loaded, loadError, detailEntry, onMissingNote]);

  // Phone: the card view replaces the list. Remember where the list was and
  // which row was opened; on return put both back (scroll position, focus).
  const listScroll = useRef(0);
  const openedRow = useRef<string | null>(null);
  const showingDetail = Boolean(detailEntry) && !split;
  const wasShowingDetail = useRef(showingDetail);
  useLayoutEffect(() => {
    if (showingDetail && !wasShowingDetail.current) window.scrollTo(0, 0);
    if (!showingDetail && wasShowingDetail.current) {
      window.scrollTo(0, listScroll.current);
      const id = openedRow.current;
      const row = id ? document.querySelector<HTMLElement>(`#note-${CSS.escape(id)} button`) : null;
      row?.focus({ preventScroll: true });
    }
    wasShowingDetail.current = showingDetail;
  }, [showingDetail]);

  const openRow = useCallback(
    (noteId: string) => {
      if (!detailId) listScroll.current = window.scrollY;
      openedRow.current = noteId;
      onOpenNote(noteId);
    },
    [detailId, onOpenNote]
  );

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

  // The duplicate warning's "Открыть существующую": the word's card view in
  // place of the sheet (the draft stays in `createForm`).
  const openDuplicate = useCallback((entry: NoteEntry) => onOpenNote(entry.note.id), [onOpenNote]);

  // Archive (D-18): a Dialog, then back to the list with "Вернуть" in a toast.
  const undoArchive = useCallback(
    (done: ArchiveTarget) => {
      void archive.unarchive(done).then((ok) => {
        if (ok) void afterWrite();
      });
    },
    [archive, afterWrite]
  );

  async function confirmArchive() {
    const pending = archiveState.pending;
    if (!pending || !(await archive.confirm())) return;
    archive.dismissNotice();
    if (detailId === pending.noteId) onCloseTarget();
    await afterWrite();
    toasts.show({ message: `«${pending.label}» в архиве`, action: { label: 'Вернуть', onAction: () => undoArchive(pending) } });
  }

  async function unarchive(done: ArchiveTarget) {
    if (!(await archive.unarchive(done))) return;
    await afterWrite();
    toasts.show({ message: `«${done.label}» снова в повторениях` });
  }

  const detail = detailEntry && (
    <CardDetail
      entry={detailEntry}
      now={loadedAt}
      standalone={!split}
      onBack={onCloseTarget}
      onEdit={() => setEditingId(detailEntry.note.id)}
      onArchive={() => archive.request({ noteId: detailEntry.note.id, label: detailEntry.note.front })}
      onUnarchive={() => void unarchive({ noteId: detailEntry.note.id, label: detailEntry.note.front })}
      busy={archiveState.busy}
    />
  );

  return (
    <div className={split ? 'cards-screen is-split' : 'cards-screen'}>
      <div className="cards-main" hidden={showingDetail}>
        {/* Not kept while hidden: its compact title bar (a portal on the
            body) would cover the card view's own top bar. */}
        {!showingDetail && (
          <ScreenHeader
            title="Карточки"
            subtitle={collectionSummary(entries)}
            actions={<IconButton icon="plus" label="Добавить слово" variant="accent" onClick={onAdd} />}
          />
        )}
        <div className="cards-body">
          <CardList
            entries={entries}
            visible={visible}
            limit={limit}
            onShowMore={() => setLimit((n) => n + LIST_PAGE)}
            activeCount={activeEntries.length}
            filter={filter}
            setFilter={setFilter}
            sort={sort}
            setSort={setSort}
            counts={counts}
            filterTags={filterTags}
            now={loadedAt}
            loaded={loaded}
            loadError={loadError}
            onRetry={() => void reload()}
            onAdd={onAdd}
            onOpen={openRow}
            selectedId={split ? detailId : null}
            practiceCount={practiceCount}
            onPractice={onPractice}
          />
          {split && entries.length > 0 && (
            <div className="cards-pane">
              {detail ?? (
                <EmptyState
                  icon="cards"
                  title="Выбери слово"
                  text="Здесь появится всё о нём: пример, заметка и как идёт обучение."
                />
              )}
            </div>
          )}
        </div>
      </div>

      {showingDetail && detail}

      {archiveState.error && !archiveState.pending && (
        <p className="cards-error" role="alert">
          {archiveState.error}
        </p>
      )}

      <Dialog
        open={archiveState.pending !== null}
        title={`Убрать «${archiveState.pending?.label ?? ''}» в архив?`}
        message="Слово исчезнет из повторений. История сохранится, вернуть можно из «Архива»."
        confirmLabel="Убрать"
        destructive
        busy={archiveState.busy}
        onConfirm={() => void confirmArchive()}
        onCancel={() => archive.cancel()}
      >
        {archiveState.error && (
          <p className="ui-field-error" role="alert">
            {archiveState.error}
          </p>
        )}
      </Dialog>

      <Sheet
        open={createOpen}
        title="Новое слово"
        onRequestClose={onCloseTarget}
        leading={
          addedHere === 0 && (
            <Button variant="tertiary" onClick={onCloseTarget}>
              Отмена
            </Button>
          )
        }
        trailing={
          addedHere > 0 && (
            <Button variant="tertiary" onClick={onCloseTarget}>
              Готово
            </Button>
          )
        }
      >
        <NoteForm
          controller={createForm}
          tagSuggestions={tagSuggestions}
          onSaved={onCreated}
          onOpenDuplicate={openDuplicate}
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
            setEditingId(null);
            if (saved) void afterWrite();
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
