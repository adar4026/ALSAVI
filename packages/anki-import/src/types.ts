/**
 * Intermediate representation between the Anki Parser and the Anki Import
 * Mapper. The Parser produces it from a `.apkg` (zip + SQLite); the Mapper
 * consumes it and never touches zip/sqlite. This boundary lets the Mapper be
 * tested on synthetic objects without a real file.
 *
 * It is a faithful (if minimal) view of Anki data — it does NOT know about the
 * ALSAVI Note/Card model.
 */

export interface AnkiNoteType {
  id: number;
  name: string;
  /** Anki model type 1 = cloze; we do not import cloze. */
  isCloze: boolean;
  fieldNames: string[];
}

export interface AnkiNote {
  id: number;
  noteTypeId: number;
  /** Raw field values (Anki `flds`, split on 0x1f). Not cleaned. */
  fields: string[];
  /** Template ordinals of the cards Anki actually created for this note. */
  cardOrds: number[];
}

export type AnkiCollectionVersion = 'anki21' | 'anki2';

export interface AnkiPackage {
  collectionVersion: AnkiCollectionVersion;
  noteTypes: Map<number, AnkiNoteType>;
  notes: AnkiNote[];
}

/** Why a note was not imported. */
export type SkipReason =
  | 'cloze-note-type'
  | 'fewer-than-2-fields'
  | 'unsupported-template'
  | 'empty-after-cleanup';

export interface ImportReport {
  importedNotes: number;
  importedCards: number;
  skipped: { reason: SkipReason; count: number }[];
  /** First few skipped notes (noteId + reason) — for diagnostics/tests, not
   *  necessarily surfaced to the user. Capped. */
  skippedSamples: { noteId: number; reason: SkipReason }[];
  collectionVersion: AnkiCollectionVersion;
  /**
   * Set only if the operation aborted mid-write (e.g. an IndexedDB failure).
   * The import is best-effort: notes counted above were durably written before
   * the abort. Parse-level failures throw before any write instead.
   */
  error?: string;
}
