import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating as FsrsRating,
  State as FsrsState,
  type Card as FsrsCard,
  type FSRS,
  type FSRSParameters,
  type Grade,
} from 'ts-fsrs';
import type { Scheduler, ScheduleUpdate } from './scheduler.js';
import type { Card, CardState, IntervalPreview, Rating, SchedulingState } from './types.js';

const RATING_TO_GRADE: Record<Rating, Grade> = {
  again: FsrsRating.Again,
  hard: FsrsRating.Hard,
  good: FsrsRating.Good,
  easy: FsrsRating.Easy,
};

const STATE_FROM_FSRS: Record<FsrsState, CardState> = {
  [FsrsState.New]: 'new',
  [FsrsState.Learning]: 'learning',
  [FsrsState.Review]: 'review',
  [FsrsState.Relearning]: 'relearning',
};

const STATE_TO_FSRS: Record<CardState, FsrsState> = {
  new: FsrsState.New,
  learning: FsrsState.Learning,
  review: FsrsState.Review,
  relearning: FsrsState.Relearning,
};

/**
 * FSRS-backed scheduler (via ts-fsrs). Fuzz is force-disabled: the Engine
 * guarantees that the same review history always yields the same schedule.
 */
export class FsrsScheduler implements Scheduler {
  private readonly f: FSRS;

  constructor(params: Partial<FSRSParameters> = {}) {
    this.f = fsrs(generatorParameters({ ...params, enable_fuzz: false }));
  }

  initialSchedule(now: number): ScheduleUpdate {
    return fromFsrsCard(createEmptyCard(now));
  }

  applyRating(card: Card, rating: Rating, now: number): ScheduleUpdate {
    const { card: next } = this.f.next(toFsrsCard(card), now, RATING_TO_GRADE[rating]);
    return fromFsrsCard(next);
  }

  preview(card: Card, now: number): IntervalPreview {
    const record = this.f.repeat(toFsrsCard(card), now);
    return {
      again: record[FsrsRating.Again].card.due.getTime(),
      hard: record[FsrsRating.Hard].card.due.getTime(),
      good: record[FsrsRating.Good].card.due.getTime(),
      easy: record[FsrsRating.Easy].card.due.getTime(),
    };
  }
}

function toFsrsCard(card: Card): FsrsCard {
  const s = card.scheduling;
  return {
    due: new Date(card.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: 0,
    scheduled_days: s.scheduledDays,
    learning_steps: s.learningSteps,
    reps: s.reps,
    lapses: s.lapses,
    state: STATE_TO_FSRS[card.state],
    ...(s.lastReview !== undefined ? { last_review: new Date(s.lastReview) } : {}),
  };
}

function fromFsrsCard(c: FsrsCard): ScheduleUpdate {
  const scheduling: SchedulingState = {
    stability: c.stability,
    difficulty: c.difficulty,
    reps: c.reps,
    lapses: c.lapses,
    scheduledDays: c.scheduled_days,
    learningSteps: c.learning_steps,
    ...(c.last_review ? { lastReview: c.last_review.getTime() } : {}),
  };
  return {
    due: c.due.getTime(),
    state: STATE_FROM_FSRS[c.state],
    scheduling,
  };
}
