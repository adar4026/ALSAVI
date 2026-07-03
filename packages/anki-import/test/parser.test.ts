import { zipSync } from 'fflate';
import { existsSync, readFileSync } from 'node:fs';
import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import { ApkgParseError, parseApkg } from '../src/parser.js';

const SEP = String.fromCharCode(0x1f);

/** Build a minimal schema-11 collection DB and zip it into a `.apkg` buffer. */
async function buildApkg(opts: {
  collectionName?: string;
  models: Record<string, unknown>;
  notes: { id: number; mid: number; fields: string[] }[];
  cards: { nid: number; ord: number }[];
  ver?: number;
}): Promise<Uint8Array> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('CREATE TABLE col (ver INTEGER, models TEXT);');
  db.run('CREATE TABLE notes (id INTEGER, mid INTEGER, flds TEXT);');
  db.run('CREATE TABLE cards (nid INTEGER, ord INTEGER);');
  db.run('INSERT INTO col (ver, models) VALUES (?, ?);', [opts.ver ?? 11, JSON.stringify(opts.models)]);
  for (const n of opts.notes) {
    db.run('INSERT INTO notes (id, mid, flds) VALUES (?, ?, ?);', [n.id, n.mid, n.fields.join(SEP)]);
  }
  for (const c of opts.cards) {
    db.run('INSERT INTO cards (nid, ord) VALUES (?, ?);', [c.nid, c.ord]);
  }
  const bytes = db.export();
  db.close();
  return zipSync({ meta: new Uint8Array([8, 2]), [opts.collectionName ?? 'collection.anki21']: bytes });
}

describe('parseApkg — round-trip on a self-built .apkg', () => {
  it('extracts note types, notes (split fields) and card ords', async () => {
    const apkg = await buildApkg({
      models: {
        '1': { id: 1, name: 'Basic', type: 0, flds: [{ name: 'Front' }, { name: 'Back' }] },
        '2': { id: 2, name: 'Cloze', type: 1, flds: [{ name: 'Text' }] },
      },
      notes: [
        { id: 100, mid: 1, fields: ['front text', 'back text'] },
        { id: 101, mid: 1, fields: ['a', 'b'] },
      ],
      cards: [
        { nid: 100, ord: 0 },
        { nid: 100, ord: 1 },
        { nid: 101, ord: 0 },
      ],
    });

    const pkg = await parseApkg(apkg);
    expect(pkg.collectionVersion).toBe('anki21');
    expect(pkg.noteTypes.get(1)).toMatchObject({ name: 'Basic', isCloze: false, fieldNames: ['Front', 'Back'] });
    expect(pkg.noteTypes.get(2)?.isCloze).toBe(true);

    const n100 = pkg.notes.find((n) => n.id === 100)!;
    expect(n100.fields).toEqual(['front text', 'back text']);
    expect(new Set(n100.cardOrds)).toEqual(new Set([0, 1]));
    const n101 = pkg.notes.find((n) => n.id === 101)!;
    expect(n101.cardOrds).toEqual([0]);
  });

  it('prefers collection.anki21, falls back to collection.anki2', async () => {
    const apkg = await buildApkg({
      collectionName: 'collection.anki2',
      models: { '1': { id: 1, name: 'Basic', type: 0, flds: [{ name: 'F' }, { name: 'B' }] } },
      notes: [{ id: 1, mid: 1, fields: ['x', 'y'] }],
      cards: [{ nid: 1, ord: 0 }],
    });
    const pkg = await parseApkg(apkg);
    expect(pkg.collectionVersion).toBe('anki2');
  });

  it('rejects an unsupported schema version with a clear error', async () => {
    const apkg = await buildApkg({
      ver: 18,
      models: {},
      notes: [],
      cards: [],
    });
    await expect(parseApkg(apkg)).rejects.toBeInstanceOf(ApkgParseError);
  });

  it('rejects a package without a collection DB (e.g. .anki21b/zstd)', async () => {
    const apkg = zipSync({ meta: new Uint8Array([8, 3]), 'collection.anki21b': new Uint8Array([1, 2, 3]) });
    await expect(parseApkg(apkg)).rejects.toBeInstanceOf(ApkgParseError);
  });
});

// Runs only when a real .apkg is provided via ALSAVI_TEST_APKG. Never faked.
const realFile = process.env.ALSAVI_TEST_APKG;
describe.skipIf(!realFile || !existsSync(realFile))('parseApkg — real .apkg (ALSAVI_TEST_APKG)', () => {
  it('parses the real file into note types and notes', async () => {
    const bytes = new Uint8Array(readFileSync(realFile!));
    const pkg = await parseApkg(bytes);
    expect(pkg.notes.length).toBeGreaterThan(0);
    expect(pkg.noteTypes.size).toBeGreaterThan(0);
    // every note references a known note type and has at least one field
    for (const n of pkg.notes.slice(0, 50)) {
      expect(pkg.noteTypes.has(n.noteTypeId)).toBe(true);
      expect(n.fields.length).toBeGreaterThan(0);
    }
  });
});
