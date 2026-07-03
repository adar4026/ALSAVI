import { LearningEngine, MemoryStore, StudySession } from '@alsavi/engine';
import { describe, expect, it } from 'vitest';
import { mapPackage } from '../src/mapper.js';
import type { AnkiNote, AnkiNoteType, AnkiPackage } from '../src/types.js';

const T0 = new Date('2026-07-01T10:00:00Z').getTime();

function engineWith() {
  let seq = 0;
  return new LearningEngine(new MemoryStore(), { now: () => T0, newId: () => `id-${seq++}` });
}

const BASIC: AnkiNoteType = { id: 1, name: 'Basic', isCloze: false, fieldNames: ['Front', 'Back'] };
const BASIC_REV: AnkiNoteType = {
  id: 2,
  name: 'Basic (and reversed card)',
  isCloze: false,
  fieldNames: ['Front', 'Back'],
};
const WITH_AUDIO: AnkiNoteType = {
  id: 3,
  name: 'Phrasal Verbs',
  isCloze: false,
  fieldNames: ['Front', 'Back', 'Audio'],
};
const CLOZE: AnkiNoteType = { id: 4, name: 'Cloze', isCloze: true, fieldNames: ['Text', 'Extra'] };

function pkg(notes: AnkiNote[], types: AnkiNoteType[] = [BASIC, BASIC_REV, WITH_AUDIO, CLOZE]): AnkiPackage {
  return {
    collectionVersion: 'anki21',
    noteTypes: new Map(types.map((t) => [t.id, t])),
    notes,
  };
}

const note = (over: Partial<AnkiNote> & Pick<AnkiNote, 'id' | 'noteTypeId' | 'fields'>): AnkiNote => ({
  cardOrds: [0],
  ...over,
});

describe('mapPackage — supported subset', () => {
  it('basic 2-field note → one forward card', async () => {
    const engine = engineWith();
    const report = await mapPackage(
      pkg([note({ id: 10, noteTypeId: 1, fields: ['der Hund', 'собака'], cardOrds: [0] })]),
      engine
    );
    expect(report.importedNotes).toBe(1);
    expect(report.importedCards).toBe(1);
    const views = await engine.listCardViews();
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ front: 'der Hund', back: 'собака' });
    expect(views[0]!.card.template).toBe('forward');
    expect(views[0]!.card.state).toBe('new'); // imported as new (fork 3a)
  });

  it('basic-and-reversed (ords 0 and 1) → forward + reverse of one note', async () => {
    const engine = engineWith();
    const report = await mapPackage(
      pkg([note({ id: 11, noteTypeId: 2, fields: ['cat', 'gato'], cardOrds: [0, 1] })]),
      engine
    );
    expect(report.importedNotes).toBe(1);
    expect(report.importedCards).toBe(2);
    const views = await engine.listCardViews();
    const noteIds = new Set(views.map((v) => v.card.noteId));
    expect(noteIds.size).toBe(1); // siblings share one note
    const fwd = views.find((v) => v.card.template === 'forward');
    const rev = views.find((v) => v.card.template === 'reverse');
    expect(fwd).toMatchObject({ front: 'cat', back: 'gato' });
    expect(rev).toMatchObject({ front: 'gato', back: 'cat' });
  });

  it('3-field note (Front/Back/Audio) → {front,back}, extra field ignored (mirrors real file)', async () => {
    const engine = engineWith();
    const report = await mapPackage(
      pkg([
        note({
          id: 12,
          noteTypeId: 3,
          fields: ['She called it off.', 'Ella lo canceló.', '[sound:1-x.mp3]'],
          cardOrds: [0],
        }),
      ]),
      engine
    );
    expect(report.importedNotes).toBe(1);
    const views = await engine.listCardViews();
    expect(views[0]).toMatchObject({ front: 'She called it off.', back: 'Ella lo canceló.' });
  });
});

describe('mapPackage — skipping (best-effort, counted)', () => {
  it('cloze notes are skipped and counted; others still import', async () => {
    const engine = engineWith();
    const report = await mapPackage(
      pkg([
        note({ id: 20, noteTypeId: 4, fields: ['{{c1::x}}', ''], cardOrds: [0] }), // cloze
        note({ id: 21, noteTypeId: 1, fields: ['a', 'b'], cardOrds: [0] }), // basic
      ]),
      engine
    );
    expect(report.importedNotes).toBe(1);
    expect(report.skipped).toContainEqual({ reason: 'cloze-note-type', count: 1 });
    expect(report.skippedSamples).toContainEqual({ noteId: 20, reason: 'cloze-note-type' });
  });

  it('note with fewer than 2 fields is skipped', async () => {
    const engine = engineWith();
    const report = await mapPackage(
      pkg([note({ id: 22, noteTypeId: 1, fields: ['only-front'], cardOrds: [0] })]),
      engine
    );
    expect(report.importedNotes).toBe(0);
    expect(report.skipped).toContainEqual({ reason: 'fewer-than-2-fields', count: 1 });
  });

  it('note with a card ord outside {0,1} is skipped (unsupported template)', async () => {
    const engine = engineWith();
    const report = await mapPackage(
      pkg([note({ id: 23, noteTypeId: 1, fields: ['a', 'b'], cardOrds: [0, 2] })]),
      engine
    );
    expect(report.importedNotes).toBe(0);
    expect(report.skipped).toContainEqual({ reason: 'unsupported-template', count: 1 });
  });

  it('note that is empty after cleanup is skipped', async () => {
    const engine = engineWith();
    const report = await mapPackage(
      pkg([note({ id: 24, noteTypeId: 1, fields: ['<img src="x.jpg">', 'b'], cardOrds: [0] })]),
      engine
    );
    expect(report.importedNotes).toBe(0);
    expect(report.skipped).toContainEqual({ reason: 'empty-after-cleanup', count: 1 });
    expect(report.skippedSamples).toContainEqual({ noteId: 24, reason: 'empty-after-cleanup' });
  });
});

describe('mapPackage — integration with engine/session', () => {
  it('adds to existing data without erasing it', async () => {
    const engine = engineWith();
    await engine.addCard({ front: 'existing', back: 'card' });
    await mapPackage(pkg([note({ id: 30, noteTypeId: 1, fields: ['imported', 'note'], cardOrds: [0] })]), engine);
    const views = await engine.listCardViews();
    const fronts = views.map((v) => v.front).sort();
    expect(fronts).toEqual(['existing', 'imported']);
  });

  it('imported cards are new and appear in StudySession', async () => {
    const engine = engineWith();
    const session = new StudySession(engine, { now: () => T0 });
    await mapPackage(pkg([note({ id: 31, noteTypeId: 1, fields: ['q', 'a'], cardOrds: [0] })]), engine);
    expect(await session.dueCount()).toBe(1);
    const next = await session.nextCard();
    expect(next?.state).toBe('new');
  });
});
