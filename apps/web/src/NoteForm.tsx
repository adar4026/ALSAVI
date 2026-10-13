import type { Note } from '@alsavi/engine';
import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent, type RefObject } from 'react';
import { parseTagInput, type NoteEntry } from './card-list';
import type { NoteFormController } from './note-form';

interface Props {
  controller: NoteFormController;
  /** Tags already used in the collection, offered as one-tap chips. */
  tagSuggestions: readonly string[];
  onSaved: (note: Note) => void;
  /** Edit mode: close the editor without saving. */
  onCancel?: () => void;
  /** Duplicate warning: show the existing card instead of adding a new one. */
  onOpenDuplicate?: (entry: NoteEntry) => void;
  /** Create mode: lets the parent focus the word field (e.g. from the empty-state CTA). */
  frontInputRef?: RefObject<HTMLInputElement | null>;
}

/** Add/edit form (TASK_023) — a thin view over `NoteFormController`. */
export function NoteForm({ controller, tagSuggestions, onSaved, onCancel, onOpenDuplicate, frontInputRef }: Props) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const { draft, fieldErrors, status, duplicate, error } = state;
  const isCreate = controller.mode.kind === 'create';
  const saving = status === 'saving';
  const id = useId();
  const ownFrontRef = useRef<HTMLInputElement>(null);
  const frontRef = frontInputRef ?? ownFrontRef;
  const [showMore, setShowMore] = useState(() => Boolean(draft.example || draft.memo));

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

  // Edit mode opens on demand ("Изменить"): move focus into the editor.
  useEffect(() => {
    if (!isCreate) frontRef.current?.focus();
  }, [isCreate, frontRef]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void controller.submit().then((outcome) => {
      if (outcome === 'invalid') {
        const field = controller.getState().fieldErrors.front ? 'front' : 'back';
        document.getElementById(`${id}-${field}`)?.focus();
      }
    });
  }

  const currentTags = parseTagInput(draft.tags);
  const suggestions = tagSuggestions.filter((t) => !currentTags.includes(t)).slice(0, 12);

  function addTag(tag: string) {
    const trimmed = draft.tags.trim().replace(/[,;]\s*$/, '');
    controller.update({ tags: trimmed ? `${trimmed}, ${tag}` : tag });
  }

  return (
    <form
      className="note-form"
      onSubmit={onSubmit}
      noValidate
      aria-label={isCreate ? 'Новая карточка' : `Редактирование: ${draft.front}`}
    >
      <div className="field">
        <label htmlFor={`${id}-front`}>Слово или фраза</label>
        <input
          id={`${id}-front`}
          ref={frontRef}
          value={draft.front}
          onChange={(e) => controller.update({ front: e.target.value })}
          placeholder="например, la práctica"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          aria-invalid={Boolean(fieldErrors.front)}
          aria-describedby={fieldErrors.front ? `${id}-front-err` : undefined}
          disabled={saving}
        />
        {fieldErrors.front && (
          <div id={`${id}-front-err`} className="field-error">
            {fieldErrors.front}
          </div>
        )}
      </div>
      <div className="field">
        <label htmlFor={`${id}-back`}>Перевод</label>
        <input
          id={`${id}-back`}
          value={draft.back}
          onChange={(e) => controller.update({ back: e.target.value })}
          placeholder="например, практика"
          autoCapitalize="none"
          enterKeyHint={isCreate ? 'done' : 'next'}
          aria-invalid={Boolean(fieldErrors.back)}
          aria-describedby={fieldErrors.back ? `${id}-back-err` : undefined}
          disabled={saving}
        />
        {fieldErrors.back && (
          <div id={`${id}-back-err`} className="field-error">
            {fieldErrors.back}
          </div>
        )}
      </div>

      {showMore ? (
        <>
          <div className="field">
            <label htmlFor={`${id}-example`}>
              Пример <span className="optional">— необязательно</span>
            </label>
            <textarea
              id={`${id}-example`}
              rows={2}
              value={draft.example}
              onChange={(e) => controller.update({ example: e.target.value })}
              placeholder="La práctica hace al maestro."
              disabled={saving}
            />
          </div>
          <div className="field">
            <label htmlFor={`${id}-memo`}>
              Личная заметка <span className="optional">— необязательно</span>
            </label>
            <textarea
              id={`${id}-memo`}
              rows={2}
              value={draft.memo}
              onChange={(e) => controller.update({ memo: e.target.value })}
              placeholder="ассоциация, контекст, где услышал"
              disabled={saving}
            />
          </div>
        </>
      ) : (
        <button type="button" className="btn-link" onClick={() => setShowMore(true)} aria-expanded={false}>
          + Пример и личная заметка
        </button>
      )}

      <div className="field">
        <label htmlFor={`${id}-tags`}>
          Теги <span className="optional">— через запятую</span>
        </label>
        <input
          id={`${id}-tags`}
          value={draft.tags}
          onChange={(e) => controller.update({ tags: e.target.value })}
          placeholder="глаголы, документы"
          autoCapitalize="none"
          autoCorrect="off"
          enterKeyHint="done"
          disabled={saving}
        />
        {suggestions.length > 0 && (
          <div className="chip-row" role="group" aria-label="Добавить существующий тег">
            {suggestions.map((t) => (
              <button
                key={t}
                type="button"
                className="chip chip-add"
                onClick={() => addTag(t)}
                aria-label={`Добавить тег ${t}`}
                disabled={saving}
              >
                + {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {isCreate && (
        <label className="reverse-toggle">
          <input
            type="checkbox"
            checked={draft.alsoReverse}
            onChange={(e) => controller.update({ alsoReverse: e.target.checked })}
            disabled={saving}
          />
          Создать также обратную карточку
        </label>
      )}

      {status === 'duplicate' && duplicate && (
        <div className="notice notice-warning" role="alert">
          <div>
            Похожая карточка уже есть{duplicate.archived ? ' (в архиве)' : ''}:{' '}
            <strong>{duplicate.note.front}</strong> — {duplicate.note.back}
          </div>
          <div className="form-actions">
            <button type="button" className="btn-primary" onClick={() => void controller.saveAnyway()}>
              Всё равно добавить
            </button>
            {onOpenDuplicate && (
              <button type="button" className="btn-secondary" onClick={() => onOpenDuplicate(duplicate)}>
                Открыть существующую
              </button>
            )}
            <button type="button" className="btn-link" onClick={() => controller.dismissDuplicate()}>
              Исправить
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}

      {status !== 'duplicate' && (
        <div className="form-actions">
          <button className="btn-primary" type="submit" disabled={saving}>
            {saving ? 'Сохранение…' : isCreate ? (draft.alsoReverse ? 'Добавить карточки' : 'Добавить карточку') : 'Сохранить'}
          </button>
          {onCancel && (
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>
              Отмена
            </button>
          )}
        </div>
      )}
    </form>
  );
}
