import { unzipSync } from 'fflate';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import type { AnkiCollectionVersion, AnkiNote, AnkiNoteType, AnkiPackage } from './types.js';

/** Field separator inside Anki `notes.flds`. */
const FIELD_SEP = String.fromCharCode(0x1f);

export class ApkgParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApkgParseError';
  }
}

export interface ParseOptions {
  /**
   * Locate the sql.js WASM file. In the browser (Vite) pass a bundled URL,
   * e.g. `() => wasmUrl` from `import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'`.
   * In Node/tests omit it — sql.js resolves the wasm from node_modules.
   */
  locateSqlWasm?: (file: string) => string;
}

/**
 * Anki Parser: `.apkg` bytes → intermediate `AnkiPackage`. Knows only the Anki
 * format (zip + SQLite schema 11); knows nothing about ALSAVI. Reads only the
 * collection DB — media blobs and the revlog are intentionally ignored.
 */
export async function parseApkg(bytes: Uint8Array, options: ParseOptions = {}): Promise<AnkiPackage> {
  // 1. Unzip ONLY the collection DB — never decompress the (potentially huge) media blobs.
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => f.name === 'collection.anki21' || f.name === 'collection.anki2',
    });
  } catch {
    throw new ApkgParseError('Не удалось распаковать .apkg (архив повреждён?).');
  }

  const anki21 = files['collection.anki21'];
  const anki2 = files['collection.anki2'];
  const collectionVersion: AnkiCollectionVersion = anki21 ? 'anki21' : anki2 ? 'anki2' : missingCollection();
  const dbBytes = anki21 ?? anki2!;

  // 2. Read SQLite via sql.js (WASM, offline — no runtime network).
  const SQL: SqlJsStatic = await initSqlJs(options.locateSqlWasm ? { locateFile: options.locateSqlWasm } : {});
  const db = new SQL.Database(dbBytes);
  try {
    const ver = toNumber(scalar(db, 'SELECT ver FROM col'));
    if (ver !== 11) {
      throw new ApkgParseError(`Неподдерживаемая версия схемы Anki (col.ver=${ver}; поддерживается 11).`);
    }
    const noteTypes = parseNoteTypes(db);
    const ordsByNote = parseCardOrds(db);
    const notes = parseNotes(db, ordsByNote);
    return { collectionVersion, noteTypes, notes };
  } finally {
    db.close();
  }
}

function missingCollection(): never {
  throw new ApkgParseError(
    'Неподдерживаемый .apkg: нет collection.anki21/anki2 ' +
      '(возможно новый формат .anki21b/zstd — пока не поддерживается).'
  );
}

function parseNoteTypes(db: Database): Map<number, AnkiNoteType> {
  const models = JSON.parse(String(scalar(db, 'SELECT models FROM col') ?? '{}')) as Record<
    string,
    { id?: number; name?: string; type?: number; flds?: { name: string }[] }
  >;
  const out = new Map<number, AnkiNoteType>();
  for (const [mid, model] of Object.entries(models)) {
    const id = Number(model.id ?? mid);
    out.set(id, {
      id,
      name: model.name ?? '',
      isCloze: model.type === 1,
      fieldNames: (model.flds ?? []).map((f) => f.name),
    });
  }
  return out;
}

function parseCardOrds(db: Database): Map<number, number[]> {
  const out = new Map<number, number[]>();
  eachRow(db, 'SELECT nid, ord FROM cards', (row) => {
    const nid = toNumber(row[0]);
    const ord = toNumber(row[1]);
    const list = out.get(nid);
    if (list) list.push(ord);
    else out.set(nid, [ord]);
  });
  return out;
}

function parseNotes(db: Database, ordsByNote: Map<number, number[]>): AnkiNote[] {
  const notes: AnkiNote[] = [];
  eachRow(db, 'SELECT id, mid, flds FROM notes', (row) => {
    const id = toNumber(row[0]);
    notes.push({
      id,
      noteTypeId: toNumber(row[1]),
      fields: String(row[2] ?? '').split(FIELD_SEP),
      cardOrds: ordsByNote.get(id) ?? [],
    });
  });
  return notes;
}

// --- sql.js helpers ---------------------------------------------------------

type SqlValue = ReturnType<Database['exec']>[number]['values'][number][number];

function scalar(db: Database, sql: string): SqlValue | undefined {
  return db.exec(sql)[0]?.values[0]?.[0];
}

function eachRow(db: Database, sql: string, fn: (row: SqlValue[]) => void): void {
  const stmt = db.prepare(sql);
  try {
    while (stmt.step()) fn(stmt.get());
  } finally {
    stmt.free();
  }
}

function toNumber(v: unknown): number {
  return typeof v === 'number' ? v : Number(v);
}
