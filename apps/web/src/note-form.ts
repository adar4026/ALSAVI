import type { LearningEngine, Note } from '@alsavi/engine';
import { buildNoteEntries, findDuplicate, parseTagInput, type NoteEntry } from './card-list';

/**
 * Add/edit form state (TASK_023). Plain TypeScript like `ReviewFlowController`
 * (TASK_022): driven directly in tests with a real `LearningEngine`, while
 * `NoteForm.tsx` is a thin `useSyncExternalStore` subscriber.
 *
 * Writes go only through `engine.addNote()` / `engine.updateNoteContent()`.
 * The draft is cleared (create) or the editor closed (edit) only after the
 * write succeeded; on any failure the typed text stays and can be re-saved.
 */

export interface NoteDraft {
  front: string;
  back: string;
  example: string;
  memo: string;
  /** Free text, e.g. "недвижимость, разговорный"; normalized on save. */
  tags: string;
  /** Create mode only: also generate the reverse card. */
  alsoReverse: boolean;
}

export const EMPTY_DRAFT: NoteDraft = { front: '', back: '', example: '', memo: '', tags: '', alsoReverse: false };

export function draftFromNote(note: Note): NoteDraft {
  return {
    front: note.front,
    back: note.back,
    example: note.example ?? '',
    memo: note.memo ?? '',
    tags: (note.tags ?? []).join(', '),
    alsoReverse: false,
  };
}

export type NoteFormMode = { kind: 'create' } | { kind: 'edit'; noteId: string };

const TEXT_FIELDS = ['front', 'back', 'example', 'memo', 'tags'] as const;

/**
 * Whether `draft` holds typed text that `baseline` does not (TASK_033) —
 * surrounding spaces ignored, the reverse toggle is a setting, not text.
 */
export function hasUnsavedText(draft: NoteDraft, baseline: NoteDraft): boolean {
  return TEXT_FIELDS.some((field) => draft[field].trim() !== baseline[field].trim());
}

export interface NoteFormState {
  draft: NoteDraft;
  /** 'duplicate' = waiting for the user to choose after a duplicate warning. */
  status: 'editing' | 'saving' | 'duplicate';
  fieldErrors: { front?: string; back?: string };
  /** Set after a failed save; the draft is untouched so the user can retry. */
  error: string | null;
  duplicate: NoteEntry | null;
  /** The note written by the last successful save (create: cleared draft is visible feedback). */
  lastSaved: Note | null;
}

export type SubmitOutcome = 'saved' | 'invalid' | 'duplicate' | 'error' | 'busy';

export class NoteFormController {
  private state: NoteFormState;
  private readonly listeners = new Set<() => void>();
  /** The draft as last opened or saved — what "unsaved" is measured against. */
  private baseline: NoteDraft;

  constructor(
    private readonly engine: LearningEngine,
    readonly mode: NoteFormMode,
    initial: NoteDraft = EMPTY_DRAFT
  ) {
    this.state = { draft: initial, status: 'editing', fieldErrors: {}, error: null, duplicate: null, lastSaved: null };
    this.baseline = initial;
  }

  /**
   * Text typed since the form was opened or last saved (TASK_033): leaving
   * the screen now would lose it. Tags kept after a save for the next word
   * do not count — they are part of the baseline.
   */
  hasUnsavedChanges(): boolean {
    return hasUnsavedText(this.state.draft, this.baseline);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): NoteFormState => this.state;

  private setState(patch: Partial<NoteFormState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  update(patch: Partial<NoteDraft>): void {
    if (this.state.status === 'saving') return;
    const fieldErrors = { ...this.state.fieldErrors };
    if (patch.front !== undefined) delete fieldErrors.front;
    if (patch.back !== undefined) delete fieldErrors.back;
    // Changing the word or translation makes a pending duplicate warning stale.
    const staleDuplicate = this.state.status === 'duplicate' && (patch.front !== undefined || patch.back !== undefined);
    this.setState({
      draft: { ...this.state.draft, ...patch },
      fieldErrors,
      ...(staleDuplicate ? { status: 'editing' as const, duplicate: null } : {}),
    });
  }

  /** Validate → (create only) duplicate check → save. */
  async submit(): Promise<SubmitOutcome> {
    if (this.state.status === 'saving') return 'busy';
    const { draft } = this.state;
    const fieldErrors: NoteFormState['fieldErrors'] = {};
    if (!draft.front.trim()) fieldErrors.front = 'Введите слово или фразу.';
    if (!draft.back.trim()) fieldErrors.back = 'Введите перевод.';
    if (fieldErrors.front || fieldErrors.back) {
      this.setState({ fieldErrors, status: 'editing', duplicate: null });
      return 'invalid';
    }
    if (this.mode.kind === 'create') {
      this.setState({ status: 'saving', error: null, fieldErrors: {} });
      let duplicate: NoteEntry | undefined;
      try {
        const entries = buildNoteEntries(await this.engine.listCardViews(), Date.now());
        duplicate = findDuplicate(entries, draft.front, draft.back);
      } catch (err) {
        return this.fail(err);
      }
      if (duplicate) {
        this.setState({ status: 'duplicate', duplicate });
        return 'duplicate';
      }
    }
    return this.save();
  }

  /** The user chose to add despite the duplicate warning. */
  async saveAnyway(): Promise<SubmitOutcome> {
    if (this.state.status !== 'duplicate') return 'busy';
    return this.save();
  }

  /** Close the duplicate warning and keep editing the same text. */
  dismissDuplicate(): void {
    if (this.state.status === 'duplicate') this.setState({ status: 'editing', duplicate: null });
  }

  private async save(): Promise<SubmitOutcome> {
    const { draft } = this.state;
    this.setState({ status: 'saving', error: null, fieldErrors: {}, duplicate: null });
    const content = {
      front: draft.front,
      back: draft.back,
      example: draft.example,
      memo: draft.memo,
      tags: parseTagInput(draft.tags),
    };
    let saved: Note;
    try {
      if (this.mode.kind === 'create') {
        ({ note: saved } = await this.engine.addNote({
          ...content,
          directions: draft.alsoReverse ? ['forward', 'reverse'] : ['forward'],
        }));
      } else {
        saved = await this.engine.updateNoteContent(this.mode.noteId, content);
      }
    } catch (err) {
      return this.fail(err);
    }
    // Create: clear the text for the next word, but keep tags and the reverse
    // toggle — consecutive words are usually from the same topic.
    const nextDraft =
      this.mode.kind === 'create'
        ? { ...EMPTY_DRAFT, tags: (saved.tags ?? []).join(', '), alsoReverse: draft.alsoReverse }
        : draftFromNote(saved);
    this.baseline = nextDraft;
    this.setState({ status: 'editing', draft: nextDraft, lastSaved: saved });
    return 'saved';
  }

  private fail(err: unknown): SubmitOutcome {
    // First line only: IndexedDB/Dexie errors repeat the reason with a technical prefix.
    const reason = (err instanceof Error ? err.message : String(err)).split('\n')[0]!.trim();
    this.setState({
      status: 'editing',
      duplicate: null,
      error: `Не удалось сохранить карточку: ${reason}. Введённый текст сохранён — попробуйте ещё раз.`,
    });
    return 'error';
  }
}
