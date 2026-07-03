import type { LearningEngine } from '@alsavi/engine';
import { mapPackage } from './mapper.js';
import { parseApkg, type ParseOptions } from './parser.js';
import type { ImportReport } from './types.js';

export { ApkgParseError, parseApkg } from './parser.js';
export type { ParseOptions } from './parser.js';
export { mapPackage } from './mapper.js';
export { stripToPlainText } from './clean.js';
export type {
  AnkiCollectionVersion,
  AnkiNote,
  AnkiNoteType,
  AnkiPackage,
  ImportReport,
  SkipReason,
} from './types.js';

/**
 * Parse a `.apkg` and import its supported notes into the engine.
 *
 * Two independent stages: parse (zip/sqlite → intermediate) fully precedes any
 * write, so an unsupported/corrupt file throws BEFORE anything is stored. Write
 * failures are best-effort and captured in `report.error` (see `mapPackage`).
 */
export async function importApkg(
  bytes: Uint8Array,
  engine: LearningEngine,
  options?: ParseOptions
): Promise<ImportReport> {
  const pkg = await parseApkg(bytes, options);
  return mapPackage(pkg, engine);
}
