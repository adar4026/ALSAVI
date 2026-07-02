import type { Card, Note } from './types.js';

/**
 * Pure, deterministic rendering of a card's displayed content from its note.
 * The single place that knows how a template maps note fields to front/back —
 * so no consumer (UI, tests) ever duplicates this logic.
 */
export function renderCard(card: Card, note: Note): { front: string; back: string } {
  return card.template === 'reverse'
    ? { front: note.back, back: note.front }
    : { front: note.front, back: note.back };
}
