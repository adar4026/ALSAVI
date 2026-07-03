import type { CardTemplate, LearningEngine } from '@alsavi/engine';
import { stripToPlainText } from './clean.js';
import type { AnkiNote, AnkiPackage, ImportReport, SkipReason } from './types.js';

const MAX_SKIPPED_SAMPLES = 20;

/**
 * Anki Import Mapper: turns the parsed intermediate representation into ALSAVI
 * notes via the engine's PUBLIC API (`addNote`). It knows nothing about
 * zip/sqlite. Unusable notes are skipped and counted (best-effort); a write
 * failure aborts and is reported in `report.error` with the counts written so
 * far. See TASK_008 forks (import-as-new; front=field0/back=field1).
 */
export async function mapPackage(pkg: AnkiPackage, engine: LearningEngine): Promise<ImportReport> {
  const report: ImportReport = {
    importedNotes: 0,
    importedCards: 0,
    skipped: [],
    skippedSamples: [],
    collectionVersion: pkg.collectionVersion,
  };
  const counts = new Map<SkipReason, number>();
  const skip = (note: AnkiNote, reason: SkipReason): void => {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
    if (report.skippedSamples.length < MAX_SKIPPED_SAMPLES) {
      report.skippedSamples.push({ noteId: note.id, reason });
    }
  };

  try {
    for (const note of pkg.notes) {
      const noteType = pkg.noteTypes.get(note.noteTypeId);
      if (!noteType || noteType.isCloze) {
        skip(note, 'cloze-note-type');
        continue;
      }
      if (note.fields.length < 2) {
        skip(note, 'fewer-than-2-fields');
        continue;
      }
      const directions = directionsFromOrds(note.cardOrds);
      if (!directions) {
        skip(note, 'unsupported-template');
        continue;
      }
      const front = stripToPlainText(note.fields[0]!);
      const back = stripToPlainText(note.fields[1]!);
      if (!front || !back) {
        skip(note, 'empty-after-cleanup');
        continue;
      }
      const { cards } = await engine.addNote({ front, back, directions });
      report.importedNotes += 1;
      report.importedCards += cards.length;
    }
  } catch (e) {
    // Operation-level failure (e.g. IndexedDB). Best-effort: keep what was
    // written, surface the error with the counts reached so far.
    report.error = e instanceof Error ? e.message : String(e);
  }

  report.skipped = [...counts.entries()].map(([reason, count]) => ({ reason, count }));
  return report;
}

/**
 * Map the actually-created card ordinals to ALSAVI directions. Supported
 * subset only: ord 0 → forward, ord 1 → reverse. Any other ordinal → the note
 * is outside the forward/reverse subset and is skipped. Using real card ords
 * (not the note type's template count) faithfully reflects which cards exist,
 * including conditional templates.
 */
function directionsFromOrds(ords: number[]): CardTemplate[] | null {
  const set = new Set(ords);
  if (set.size === 0) return null;
  for (const ord of set) {
    if (ord !== 0 && ord !== 1) return null;
  }
  const directions: CardTemplate[] = [];
  if (set.has(0)) directions.push('forward');
  if (set.has(1)) directions.push('reverse');
  return directions.length > 0 ? directions : null;
}
