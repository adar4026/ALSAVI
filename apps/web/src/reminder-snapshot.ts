import type { LearningEngine } from '@alsavi/engine';
import { buildSnapshot, type ReviewSnapshot } from '@alsavi/reminders';
import { localDayStart } from './app-lifecycle';

/**
 * The schedule snapshot for the push server (TASK_034), read only through
 * the Engine's public API — the same facts `StudySession` uses:
 * active cards' `due`/`state` (`getCardsDueBy`, archived notes excluded),
 * new cards started today (`countNewCardsAnsweredSince`) and the stored
 * daily limit. Nothing is computed here that FSRS has not already decided.
 */
export async function snapshotFromEngine(
  engine: LearningEngine,
  settings: { getNewCardsPerDay(): Promise<number | null> },
  now: number,
  timeZone: string
): Promise<ReviewSnapshot> {
  const [cards, newUsedToday, newLimit] = await Promise.all([
    engine.getCardsDueBy(Number.MAX_SAFE_INTEGER),
    engine.countNewCardsAnsweredSince(localDayStart(now)),
    settings.getNewCardsPerDay(),
  ]);
  return buildSnapshot({ cards, now, timeZone, newLimit, newUsedToday });
}
