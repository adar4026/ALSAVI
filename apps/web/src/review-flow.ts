import type { CardView, IntervalPreview, LearningEngine, Note, Rating, StudySession } from '@alsavi/engine';

/**
 * Per-card study session flow (TASK_022) — the state machine behind the
 * "Учиться сегодня" screen. Deliberately plain TypeScript, not a React hook:
 * it can be constructed and driven directly in tests with a real
 * `LearningEngine`/`StudySession` (no component-testing infrastructure
 * needed — same reasoning as testing `DexieStore` directly, see
 * `add-note-dexie.test.ts`). `ReviewSession.tsx` is a thin subscriber.
 *
 * This class only ever calls `session.nextCard()`, `session.answer()`,
 * `session.dueCount()`, `session.newCardsWithheldByLimit()`, and
 * `engine.getCardView()`/`previewIntervals()` — the existing public API. It
 * invents no scheduling of its own: every interval shown to the user comes
 * straight from `engine.previewIntervals()`.
 */

export type ReviewFlowStatus = 'loading' | 'active' | 'saving' | 'empty' | 'finished';

export interface ReviewFlowSummary {
  /** Total cards answered during this screen visit. */
  reviewed: number;
  /** Of those, how many were the card's first ('new'-sourced) answer. */
  newReviewed: number;
}

/**
 * The note's optional context shown under the answer (TASK_024). `null` = the
 * field is absent or blank, so no heading/block is rendered for it.
 */
export interface AnswerContext {
  example: string | null;
  memo: string | null;
}

/**
 * Pure: a note's example and personal memo for display. The Engine already
 * trims and drops empty optional fields on write, but rows restored from a
 * backup are only type-checked — so blank values are filtered here too.
 */
export function answerContext(note: Note): AnswerContext {
  const clean = (value: string | undefined) => (value && value.trim() ? value.trim() : null);
  return { example: clean(note.example), memo: clean(note.memo) };
}

export interface ReviewFlowState {
  status: ReviewFlowStatus;
  current: CardView | null;
  preview: IntervalPreview | null;
  revealed: boolean;
  /**
   * Example + memo of the current card's note — set only once the answer is
   * revealed, `null` before. Both fields belong to the note, not to a card
   * direction: an example usually contains the word itself, so on a reverse
   * card it would give the answer away. Hence: never before reveal, in
   * either direction.
   */
  context: AnswerContext | null;
  /** Set only after a failed save; the same card stays current so the user can retry. */
  error: string | null;
  /** True in 'empty' status when the reason is the daily new-card limit, not "nothing left". */
  limitReached: boolean;
  /** `done` = cards answered so far this visit; `total` = done + still remaining right now. */
  progress: { done: number; total: number };
  /** Set only in 'finished' status. */
  summary: ReviewFlowSummary | null;
}

const INITIAL_STATE: ReviewFlowState = {
  status: 'loading',
  current: null,
  preview: null,
  revealed: false,
  context: null,
  error: null,
  limitReached: false,
  progress: { done: 0, total: 0 },
  summary: null,
};

export class ReviewFlowController {
  private state: ReviewFlowState = INITIAL_STATE;
  private readonly listeners = new Set<() => void>();
  private done = 0;
  private newReviewed = 0;
  /**
   * Bumped by every `start()`/`loadNext()` call; a stale async response (a
   * superseded `loadNext`, or a slow `answer()` whose card is no longer
   * current — e.g. the component unmounted/restarted mid-request) checks its
   * captured generation before applying its result, so a double click or a
   * slow IndexedDB round trip can never show or record the same card twice.
   */
  private generation = 0;

  constructor(
    private readonly engine: LearningEngine,
    private readonly session: StudySession
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): ReviewFlowState => this.state;

  private setState(patch: Partial<ReviewFlowState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  /** Begin (or restart) the session screen: resets tallies and loads the first card. */
  async start(): Promise<void> {
    this.done = 0;
    this.newReviewed = 0;
    this.state = INITIAL_STATE;
    for (const listener of this.listeners) listener();
    await this.loadNext();
  }

  private async loadNext(): Promise<void> {
    const myGeneration = ++this.generation;
    const card = await this.session.nextCard();
    if (myGeneration !== this.generation) return; // superseded (restart, or an in-flight answer())

    if (!card) {
      const limitReached = (await this.session.newCardsWithheldByLimit()) > 0;
      if (myGeneration !== this.generation) return;
      if (this.done === 0) {
        this.setState({
          status: 'empty',
          current: null,
          preview: null,
          revealed: false,
          context: null,
          error: null,
          limitReached,
          progress: { done: 0, total: 0 },
        });
      } else {
        this.setState({
          status: 'finished',
          current: null,
          preview: null,
          revealed: false,
          context: null,
          error: null,
          // Nothing remains: `total` catches up to `done`. Also the reason
          // this field must be set here explicitly, not left over from the
          // last active card — otherwise `progress.done` would still read
          // one answer behind, and a subscriber that watches it to react to
          // "an answer was just recorded" (e.g. refreshing app-level stats)
          // would silently miss the very last answer of the session.
          progress: { done: this.done, total: this.done },
          summary: { reviewed: this.done, newReviewed: this.newReviewed },
        });
      }
      return;
    }

    const [view, preview, remaining] = await Promise.all([
      this.engine.getCardView(card.id),
      this.engine.previewIntervals(card.id),
      this.session.dueCount(),
    ]);
    if (myGeneration !== this.generation) return;
    this.setState({
      status: 'active',
      current: view ?? null,
      preview,
      revealed: false,
      context: null,
      error: null,
      progress: { done: this.done, total: this.done + remaining },
    });
  }

  /** Reveal the back of the current card (and its note's context). No-op outside the active/unrevealed state. */
  reveal(): void {
    if (this.state.status !== 'active' || this.state.revealed || !this.state.current) return;
    this.setState({ revealed: true, context: answerContext(this.state.current.note) });
  }

  /**
   * Record a rating for the current card. Guarded so a double click or a
   * second keypress while a save is already in flight does nothing — the
   * status leaves 'active' synchronously before any `await`, so a re-entrant
   * call sees 'saving' and bails immediately.
   */
  async answer(rating: Rating): Promise<void> {
    if (this.state.status !== 'active' || !this.state.revealed || !this.state.current) return;
    const cardId = this.state.current.card.id;
    const myGeneration = this.generation;
    this.setState({ status: 'saving', error: null });
    try {
      const result = await this.session.answer(cardId, rating);
      if (myGeneration !== this.generation) return; // a restart raced ahead of this save
      this.done += 1;
      if (result.review.stateBefore === 'new') this.newReviewed += 1;
      await this.loadNext();
    } catch (err) {
      if (myGeneration !== this.generation) return;
      // Nothing was recorded: `done`/`newReviewed` stay untouched, and the
      // same card remains current (revealed) so the user can just try again.
      this.setState({
        status: 'active',
        revealed: true,
        error: err instanceof Error ? err.message : 'Не удалось сохранить ответ.',
      });
    }
  }
}
