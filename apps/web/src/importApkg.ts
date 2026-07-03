import type { LearningEngine } from '@alsavi/engine';
import { importApkg as runImport, type ImportReport } from '@alsavi/anki-import';
// Bundle the sql.js WASM locally (offline, no CDN). Vite serves it as an asset.
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

/** Web entry point: import a `.apkg` File into the engine. */
export async function importApkgFile(file: File, engine: LearningEngine): Promise<ImportReport> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return runImport(bytes, engine, { locateSqlWasm: () => sqlWasmUrl });
}

export type { ImportReport } from '@alsavi/anki-import';
