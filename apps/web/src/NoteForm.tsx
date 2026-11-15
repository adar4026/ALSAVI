import type { Note } from '@alsavi/engine';
import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent, type RefObject } from 'react';
import { parseTagInput, type NoteEntry } from './card-list';
import { Icon } from './Icon';
import type { NoteFormController } from './note-form';
import { Banner, Button, Chip, ChipRow, Switch, TextArea, TextField } from './ui';

interface Props {
  controller: NoteFormController;
  /** Tags already used in the collection, offered as one-tap chips. */
  tagSuggestions: readonly string[];
  onSaved: (note: Note) => void;
  /** Duplicate warning: show the existing card instead of adding a new one. */
  onOpenDuplicate?: (entry: NoteEntry) => void;
  /** Put the cursor into "Слово" when the form appears (the sheet just opened). */
  autoFocus?: boolean;
  /** Lets the parent reach the word field. */
  frontInputRef?: RefObject<HTMLInputElement | null>;
}

const TEXT_FIELDS = ['front', 'back', 'example', 'memo'] as const;

/**
 * New-word / edit form (TASK_023, redesigned for the sheet in TASK_040) — a
 * thin view over `NoteFormController`, which is unchanged. Only the word and
 * its translation are asked for; the example, the personal note and the
 * tags open on demand. Enter in "Слово" moves to "Перевод", Enter there
 * saves. The action sits at the bottom of the sheet and stays above the
 * on-screen keyboard (`Sheet`).
 */
export function NoteForm({ controller, tagSuggestions, onSaved, onOpenDuplicate, autoFocus = false, frontInputRef }: Props) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const { draft, fieldErrors, status, duplicate, error } = state;
  const isCreate = controller.mode.kind === 'create';
  const saving = status === 'saving';
  const id = useId();
  const ownFrontRef = useRef<HTMLInputElement>(null);
  const frontRef = frontInputRef ?? ownFrontRef;
  const backRef = useRef<HTMLInputElement>(null);
  // Optional parts open on demand, or right away when they already hold text.
  const [showExample, setShowExample] = useState(() => Boolean(draft.example));
  const [showMemo, setShowMemo] = useState(() => Boolean(draft.memo));
  const [showTags, setShowTags] = useState(() => Boolean(draft.tags));

  // After a successful save: report it, and in create mode put the cursor
  // back into the word field for the next word. Starts at the controller's
  // current `lastSaved`: the create form's controller outlives this view
  // (TASK_033, it keeps a draft across sections), and a save from an earlier
  // visit must not be reported again on return.
  const lastSaved = state.lastSaved;
  const reported = useRef<Note | null>(lastSaved);
  useEffect(() => {
    if (!lastSaved || reported.current === lastSaved) return;
    reported.current = lastSaved;
    onSaved(lastSaved);
    if (isCreate) frontRef.current?.focus();
  }, [lastSaved, onSaved, isCreate, frontRef]);

  useEffect(() => {
    if (autoFocus) frontRef.current?.focus();
  }, [autoFocus, frontRef]);

  // The duplicate warning replaces the action at the bottom of the sheet:
  // bring its choices into view (on a short phone they start below the fold).
  const formRef = useRef<HTMLFormElement>(null);
  const isDuplicate = status === 'duplicate';
  useEffect(() => {
    if (!isDuplicate) return;
    // No animated scroll under "reduce motion" (CSS cannot reach a JS scroll).
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    formRef.current?.querySelector('.duplicate-warning')?.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }, [isDuplicate]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void controller.submit().then((outcome) => {
      if (outcome === 'invalid') {
        const field = controller.getState().fieldErrors.front ? 'front' : 'back';
        document.getElementById(`${id}-${field}`)?.focus();
      }
    });
  }

  // Enter in "Слово" goes on to "Перевод" instead of submitting half a card.
  function onFrontKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    e.preventDefault();
    backRef.current?.focus();
  }

  const currentTags = parseTagInput(draft.tags);
  const suggestions = tagSuggestions.filter((t) => !currentTags.includes(t)).slice(0, 12);
  const hasText = TEXT_FIELDS.some((f) => draft[f].trim() !== '');

  function addTag(tag: string) {
    const trimmed = draft.tags.trim().replace(/[,;]\s*$/, '');
    controller.update({ tags: trimmed ? `${trimmed}, ${tag}` : tag });
    setShowTags(true);
  }

  // "Очистить": the typed text goes, the tags and the reverse switch stay —
  // like after a save (consecutive words are usually from one topic).
  function clear() {
    controller.update({ front: '', back: '', example: '', memo: '' });
    setShowExample(false);
    setShowMemo(false);
    frontRef.current?.focus();
  }

  const submitLabel = saving
    ? 'Сохранение…'
    : isCreate
      ? draft.alsoReverse
        ? 'Добавить 2 карточки'
        : 'Добавить'
      : 'Сохранить';

  return (
    <form ref={formRef} className="note-form" onSubmit={onSubmit} noValidate aria-label={isCreate ? 'Новое слово' : `Изменить: ${draft.front}`}>
      <TextField
        id={`${id}-front`}
        ref={frontRef}
        label="Слово или фраза"
        lang="es"
        value={draft.front}
        onChange={(e) => controller.update({ front: e.target.value })}
        onKeyDown={onFrontKeyDown}
        placeholder="например, la práctica"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="next"
        error={fieldErrors.front}
        disabled={saving}
      />
      <TextField
        id={`${id}-back`}
        ref={backRef}
        label="Перевод"
        value={draft.back}
        onChange={(e) => controller.update({ back: e.target.value })}
        placeholder="например, практика"
        autoCapitalize="none"
        enterKeyHint="done"
        error={fieldErrors.back}
        disabled={saving}
      />

      <div className="note-form-more">
        {showExample ? (
          <TextArea
            label="Пример"
            lang="es"
            value={draft.example}
            onChange={(e) => controller.update({ example: e.target.value })}
            placeholder="La práctica hace al maestro."
            disabled={saving}
          />
        ) : (
          <AddRow label="Пример" onClick={() => setShowExample(true)} />
        )}
        {showMemo ? (
          <TextArea
            label="Личная заметка"
            value={draft.memo}
            onChange={(e) => controller.update({ memo: e.target.value })}
            placeholder="ассоциация, контекст, где услышал"
            disabled={saving}
          />
        ) : (
          <AddRow label="Личная заметка" onClick={() => setShowMemo(true)} />
        )}
        {showTags ? (
          <TextField
            label="Теги"
            hint="Через запятую."
            value={draft.tags}
            onChange={(e) => controller.update({ tags: e.target.value })}
            placeholder="глаголы, документы"
            autoCapitalize="none"
            autoCorrect="off"
            enterKeyHint="done"
            disabled={saving}
          />
        ) : (
          <AddRow label="Теги" onClick={() => setShowTags(true)} />
        )}
        {suggestions.length > 0 && (
          <ChipRow label="Добавить существующий тег" className="note-form-tags">
            {suggestions.map((t) => (
              <Chip key={t} variant="suggestion" onClick={() => addTag(t)} aria-label={`Добавить тег ${t}`} disabled={saving}>
                + {t}
              </Chip>
            ))}
          </ChipRow>
        )}
      </div>

      {isCreate && (
        <label className="note-form-switch">
          <span className="note-form-switch-text">
            <span className="note-form-switch-title">Обратная карточка</span>
            <span className="note-form-switch-hint">перевод → слово, своё расписание</span>
          </span>
          <Switch
            checked={draft.alsoReverse}
            onChange={(e) => controller.update({ alsoReverse: e.target.checked })}
            disabled={saving}
          />
        </label>
      )}

      {status === 'duplicate' && duplicate && (
        <Banner
          tone="warning"
          role="alert"
          className="duplicate-warning"
          actions={
            <>
              <Button onClick={() => void controller.saveAnyway()}>Всё равно добавить</Button>
              {onOpenDuplicate && (
                <Button variant="secondary" onClick={() => onOpenDuplicate(duplicate)}>
                  Открыть существующую
                </Button>
              )}
              <Button variant="tertiary" onClick={() => controller.dismissDuplicate()}>
                Исправить
              </Button>
            </>
          }
        >
          Похожее слово уже есть{duplicate.archived ? ' (в архиве)' : ''}:{' '}
          <strong>{duplicate.note.front}</strong> — {duplicate.note.back}
        </Banner>
      )}

      {error && <Banner tone="error">{error}</Banner>}

      {status !== 'duplicate' && (
        <div className="note-form-actions">
          <Button type="submit" size="lg" block disabled={saving}>
            {submitLabel}
          </Button>
          {isCreate && hasText && !saving && (
            <Button variant="tertiary" className="note-form-clear" onClick={clear}>
              Очистить
            </Button>
          )}
        </div>
      )}
    </form>
  );
}

/** A collapsed optional part: "+ Пример". */
function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="note-form-add" onClick={onClick} aria-expanded={false}>
      <Icon name="plus" size={20} />
      {label}
    </button>
  );
}
