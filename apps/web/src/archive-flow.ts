import type { LearningEngine } from '@alsavi/engine';

/**
 * "Убрать в архив" with explicit confirmation and a one-step "Вернуть"
 * (TASK_023). Archiving is the only removal the UI offers: it is reversible
 * and keeps the note, its cards and the Review Log intact (see
 * `LearningEngine.archiveNote`). Plain TypeScript so cancel/confirm/undo are
 * tested headless (`archive-flow.test.ts`); the component only renders state.
 */

export interface ArchiveTarget {
  noteId: string;
  /** Shown in the dialog and the undo notice, e.g. the word itself. */
  label: string;
}

export interface ArchiveFlowState {
  /** Awaiting the user's confirmation; nothing has been written yet. */
  pending: ArchiveTarget | null;
  busy: boolean;
  error: string | null;
  /** The most recently archived note — offered for "Вернуть". */
  lastArchived: ArchiveTarget | null;
}

export class ArchiveFlow {
  private state: ArchiveFlowState = { pending: null, busy: false, error: null, lastArchived: null };
  private readonly listeners = new Set<() => void>();

  constructor(private readonly engine: LearningEngine) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): ArchiveFlowState => this.state;

  private setState(patch: Partial<ArchiveFlowState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  request(target: ArchiveTarget): void {
    if (this.state.busy) return;
    this.setState({ pending: target, error: null });
  }

  /** "Отмена": closes the dialog; nothing is written. */
  cancel(): void {
    if (this.state.busy) return;
    this.setState({ pending: null, error: null });
  }

  async confirm(): Promise<boolean> {
    const target = this.state.pending;
    if (!target || this.state.busy) return false;
    this.setState({ busy: true, error: null });
    try {
      await this.engine.archiveNote(target.noteId);
    } catch (err) {
      this.setState({ busy: false, error: `Не удалось убрать в архив: ${message(err)}` });
      return false;
    }
    this.setState({ busy: false, pending: null, lastArchived: target });
    return true;
  }

  /** "Вернуть": undo the last archive (or restore any archived note from the archive view). */
  async unarchive(target: ArchiveTarget): Promise<boolean> {
    if (this.state.busy) return false;
    this.setState({ busy: true, error: null });
    try {
      await this.engine.unarchiveNote(target.noteId);
    } catch (err) {
      this.setState({ busy: false, error: `Не удалось вернуть из архива: ${message(err)}` });
      return false;
    }
    const lastArchived = this.state.lastArchived?.noteId === target.noteId ? null : this.state.lastArchived;
    this.setState({ busy: false, lastArchived });
    return true;
  }

  dismissNotice(): void {
    this.setState({ lastArchived: null, error: null });
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
