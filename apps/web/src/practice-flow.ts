import type { CardView, LearningEngine } from '@alsavi/engine';
import { answerContext, type AnswerContext } from './review-flow';
import { focusKind, type HotkeyEvent } from './review-hotkeys';

/**
 * Difficult-words practice (TASK_032) — extra practice outside spaced
 * repetition. The learner sees each difficult card, recalls, reveals the
 * answer and grades themselves; the grades live only in this controller's
 * memory and are gone when the practice ends.
 *
 * Independence from the scheduler is structural, not a convention: the
 * controller never receives the Engine or `StudySession` — only a loader that
 * returns card views. The only Engine call in this module is
 * `loadDifficultPractice`, typed to `listCardViews` alone. So the practice
 * cannot write a review, move a due date, touch FSRS state, the daily
 * new-card limit or the main queue. Pure TypeScript, tested in
 * `practice-flow.test.ts`; `PracticeSession.tsx` only renders the state.
 */

/** The learner's self-assessment in practice. Not an FSRS rating — nothing is scheduled from it. */
export type PracticeGrade = 'forgot' | 'hard' | 'good';

export const PRACTICE_GRADES: readonly PracticeGrade[] = ['forgot', 'hard', 'good'];

export const PRACTICE_GRADE_LABELS: Record<PracticeGrade, string> = {
  forgot: 'Не помню',
  hard: 'С трудом',
  good: 'Помню',
};

/**
 * Cards to practise: cards of active (non-archived) notes with at least one
 * lapse — the same signal as the "Трудные" filter and the statistics
 * (`scheduling.lapses > 0`). A note's other direction is included only if it
 * was forgotten too: practice targets exactly what was hard.
 */
export function difficultPracticeCards(views: readonly CardView[]): CardView[] {
  return views.filter((v) => v.note.archivedAt === undefined && v.card.scheduling.lapses > 0);
}

/** The single read the practice makes. Typed so no writing method of the Engine is reachable from here. */
export async function loadDifficultPractice(engine: Pick<LearningEngine, 'listCardViews'>): Promise<CardView[]> {
  return difficultPracticeCards(await engine.listCardViews());
}

/** Fisher–Yates; returns a new array. `random` is injectable for tests. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export interface PracticeResult {
  view: CardView;
  grade: PracticeGrade;
}

export interface PracticeSummary {
  /** Cards graded in this practice. */
  practised: number;
  /** «Помню». */
  good: number;
  /** «С трудом» + «Не помню». */
  struggled: number;
  forgot: number;
  hard: number;
  /** Cards graded «С трудом» or «Не помню», in the order they were shown. */
  struggledCards: CardView[];
}

export function summarize(results: readonly PracticeResult[]): PracticeSummary {
  const count = (g: PracticeGrade) => results.filter((r) => r.grade === g).length;
  const forgot = count('forgot');
  const hard = count('hard');
  return {
    practised: results.length,
    good: count('good'),
    struggled: forgot + hard,
    forgot,
    hard,
    struggledCards: results.filter((r) => r.grade !== 'good').map((r) => r.view),
  };
}

export type PracticeStatus = 'loading' | 'active' | 'empty' | 'finished' | 'error';

export interface PracticeState {
  status: PracticeStatus;
  current: CardView | null;
  revealed: boolean;
  /** Example + memo of the current note — only after reveal (same rule as the session, TASK_024). */
  context: AnswerContext | null;
  /** `done` = cards graded so far; `total` = cards in this practice. */
  progress: { done: number; total: number };
  /** Set in 'finished'. */
  summary: PracticeSummary | null;
  /** Set in 'error'. */
  error: string | null;
}

const INITIAL_STATE: PracticeState = {
  status: 'loading',
  current: null,
  revealed: false,
  context: null,
  progress: { done: 0, total: 0 },
  summary: null,
  error: null,
};

export class PracticeController {
  private state: PracticeState = INITIAL_STATE;
  private readonly listeners = new Set<() => void>();
  private queue: CardView[] = [];
  private results: PracticeResult[] = [];
  /** Bumped by every `start()`: a slow load of a superseded start never replaces a newer one. */
  private generation = 0;

  constructor(
    private readonly loadCards: () => Promise<CardView[]>,
    private readonly random: () => number = Math.random
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): PracticeState => this.state;

  private setState(next: PracticeState): void {
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  /**
   * (Re)start: reloads the difficult cards — a word archived or no longer
   * difficult since the last round drops out — and shuffles them anew.
   */
  start(): Promise<void> {
    return this.begin((cards) => cards);
  }

  /**
   * «Повторить слова с ошибками» (TASK_033): a new round of only the cards
   * graded «Не помню» or «С трудом» in the round just finished. The cards are
   * re-read like in `start()` (one archived meanwhile drops out) and shuffled.
   * Still nothing is saved. No-op unless a finished round had such cards.
   */
  retryStruggled(): Promise<void> {
    const summary = this.state.status === 'finished' ? this.state.summary : null;
    if (!summary || summary.struggled === 0) return Promise.resolve();
    const ids = new Set(summary.struggledCards.map((v) => v.card.id));
    return this.begin((cards) => cards.filter((v) => ids.has(v.card.id)));
  }

  private async begin(select: (cards: CardView[]) => CardView[]): Promise<void> {
    const myGeneration = ++this.generation;
    this.queue = [];
    this.results = [];
    this.setState(INITIAL_STATE);
    let cards: CardView[];
    try {
      cards = await this.loadCards();
    } catch (err) {
      if (myGeneration !== this.generation) return;
      const message = err instanceof Error ? err.message : String(err);
      this.setState({ ...INITIAL_STATE, status: 'error', error: `Не удалось загрузить трудные слова: ${message}` });
      return;
    }
    if (myGeneration !== this.generation) return;
    this.queue = shuffle(select(cards), this.random);
    this.showNext();
  }

  private showNext(): void {
    const total = this.queue.length;
    const done = this.results.length;
    if (total === 0) {
      this.setState({ ...INITIAL_STATE, status: 'empty' });
      return;
    }
    if (done >= total) {
      this.finish();
      return;
    }
    this.setState({
      ...INITIAL_STATE,
      status: 'active',
      current: this.queue[done]!,
      progress: { done, total },
    });
  }

  reveal(): void {
    if (this.state.status !== 'active' || this.state.revealed || !this.state.current) return;
    this.setState({ ...this.state, revealed: true, context: answerContext(this.state.current.note) });
  }

  /** Grade the revealed card and move on. Synchronous: nothing is saved anywhere. */
  grade(grade: PracticeGrade): void {
    if (this.state.status !== 'active' || !this.state.revealed || !this.state.current) return;
    this.results.push({ view: this.state.current, grade });
    this.showNext();
  }

  /**
   * End now (also early): the summary covers the cards graded so far. Returns
   * `false` when nothing was graded — there is no result to show then.
   */
  finish(): boolean {
    if (this.state.status !== 'active') return false;
    if (this.results.length === 0) return false;
    this.setState({
      ...INITIAL_STATE,
      status: 'finished',
      progress: { done: this.results.length, total: this.queue.length },
      summary: summarize(this.results),
    });
    return true;
  }
}

export type PracticeHotkeyAction = { type: 'reveal' } | { type: 'grade'; grade: PracticeGrade };

/**
 * Keys of the practice screen, by the same rules as the study session
 * (`review-hotkeys.ts`, TASK_025): Space/Enter reveal, then mean «Помню»;
 * 1–3 grade the revealed card; a focused button or form field keeps its own
 * Enter/Space; held keys and modifier combinations are ignored.
 */
export function practiceHotkeyAction(
  e: HotkeyEvent,
  state: Pick<PracticeState, 'status' | 'revealed'>
): PracticeHotkeyAction | null {
  if (state.status !== 'active' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return null;
  const focus = focusKind(e.target);
  if (focus === 'field') return null;
  if (e.code === 'Space' || e.key === ' ' || e.key === 'Enter') {
    if (focus === 'control') return null;
    return state.revealed ? { type: 'grade', grade: 'good' } : { type: 'reveal' };
  }
  if (!state.revealed) return null;
  const idx = ['1', '2', '3'].indexOf(e.key);
  return idx === -1 ? null : { type: 'grade', grade: PRACTICE_GRADES[idx]! };
}

export function handlePracticeKeydown(e: HotkeyEvent, controller: PracticeController): PracticeHotkeyAction | null {
  const action = practiceHotkeyAction(e, controller.getState());
  if (!action) return null;
  e.preventDefault();
  if (action.type === 'reveal') controller.reveal();
  else controller.grade(action.grade);
  return action;
}
