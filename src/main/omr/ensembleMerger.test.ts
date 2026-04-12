/**
 * Unit tests for ensembleMerger.
 * Tests Audiveris + SMT++ ensemble result merging.
 */

import { describe, test, expect } from 'vitest';
import { mergeEnsembleResults } from './ensembleMerger';
import type { ScoreData, Measure } from '../../shared/types/measure';
import type { NoteElement, RestElement, Duration, Pitch } from '../../shared/types/elements';

// ─── Test Helpers ───

function makeNote(
  pitch: Partial<Pitch> & { step: Pitch['step'] },
  noteType: Duration['noteType'] = 'quarter',
  extras?: Partial<NoteElement>,
): NoteElement {
  return {
    type: 'note',
    id: `note-${pitch.step}${pitch.octave ?? 4}`,
    pitch: { step: pitch.step, octave: pitch.octave ?? 4, alter: pitch.alter },
    duration: { divisions: 4, noteType, dots: 0 },
    voice: 1,
    staff: 1,
    ...extras,
  };
}

function makeRest(noteType: Duration['noteType'] = 'quarter'): RestElement {
  return {
    type: 'rest',
    id: 'rest-1',
    duration: { divisions: 4, noteType, dots: 0 },
    voice: 1,
    staff: 1,
  };
}

function makeMeasure(elements: (NoteElement | RestElement)[], number = 1): Measure {
  return { number, elements, directions: [] };
}

function makeScoreData(measures: Measure[]): ScoreData {
  return {
    parts: [{
      id: 'P1',
      name: 'Piano',
      staves: 1,
      measures,
    }],
  };
}

// ─── Tests ───

describe('ensembleMerger', () => {
  describe('single engine fallback', () => {
    test('returns Audiveris as-is when no SMT++ result', () => {
      const audiveris = makeScoreData([
        makeMeasure([makeNote({ step: 'C' }), makeNote({ step: 'D' })]),
      ]);

      const result = mergeEnsembleResults({ audiveris });

      expect(result.merged).toEqual(audiveris);
      expect(result.conflicts).toHaveLength(0);
    });

    test('returns Audiveris as-is when SMT++ has empty parts', () => {
      const audiveris = makeScoreData([
        makeMeasure([makeNote({ step: 'C' })]),
      ]);
      const smt: ScoreData = { parts: [] };

      const result = mergeEnsembleResults({ audiveris, smt });

      expect(result.merged).toEqual(audiveris);
      expect(result.conflicts).toHaveLength(0);
    });
  });

  describe('matching results (agreement)', () => {
    test('boosts confidence when both engines agree on pitch and duration', () => {
      const noteC = makeNote({ step: 'C', octave: 4 }, 'quarter');
      const audiveris = makeScoreData([makeMeasure([{ ...noteC }])]);
      const smt = makeScoreData([makeMeasure([{ ...noteC, id: 'smt-C4' }])]);

      const result = mergeEnsembleResults({ audiveris, smt });

      expect(result.conflicts).toHaveLength(0);
      const mergedNote = result.merged.parts[0].measures[0].elements[0] as NoteElement;
      expect(mergedNote.confidence).toBeGreaterThanOrEqual(0.9);
      expect(result.stats.agreements).toBe(1);
    });

    test('reports zero conflicts for fully matching scores', () => {
      const notes = [
        makeNote({ step: 'C' }),
        makeNote({ step: 'E' }),
        makeNote({ step: 'G' }),
      ];
      const audiveris = makeScoreData([makeMeasure([...notes])]);
      const smt = makeScoreData([makeMeasure(notes.map((n) => ({ ...n, id: `smt-${n.id}` })))]);

      const result = mergeEnsembleResults({ audiveris, smt });

      expect(result.conflicts).toHaveLength(0);
      expect(result.stats.agreements).toBe(3);
    });
  });

  describe('pitch/duration conflicts', () => {
    test('prefers SMT++ pitch when engines disagree', () => {
      const audNote = makeNote({ step: 'C', octave: 4 });
      const smtNote = makeNote({ step: 'D', octave: 4 });

      const audiveris = makeScoreData([makeMeasure([audNote])]);
      const smt = makeScoreData([makeMeasure([smtNote])]);

      const result = mergeEnsembleResults({ audiveris, smt });

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].resolution).toBe('smt');

      const merged = result.merged.parts[0].measures[0].elements[0] as NoteElement;
      expect(merged.pitch.step).toBe('D'); // SMT++ pitch adopted
    });

    test('prefers SMT++ duration when engines disagree', () => {
      const audNote = makeNote({ step: 'C' }, 'quarter');
      const smtNote = makeNote({ step: 'C' }, 'eighth');

      const audiveris = makeScoreData([makeMeasure([audNote])]);
      const smt = makeScoreData([makeMeasure([smtNote])]);

      const result = mergeEnsembleResults({ audiveris, smt });

      expect(result.conflicts).toHaveLength(1);
      const merged = result.merged.parts[0].measures[0].elements[0] as NoteElement;
      expect(merged.duration.noteType).toBe('eighth'); // SMT++ duration
    });

    test('sets low confidence on conflicted notes', () => {
      const audNote = makeNote({ step: 'C' });
      const smtNote = makeNote({ step: 'F' });

      const audiveris = makeScoreData([makeMeasure([audNote])]);
      const smt = makeScoreData([makeMeasure([smtNote])]);

      const result = mergeEnsembleResults({ audiveris, smt });

      const merged = result.merged.parts[0].measures[0].elements[0] as NoteElement;
      expect(merged.confidence).toBeLessThanOrEqual(0.7);
    });
  });

  describe('Audiveris-only elements preservation', () => {
    test('preserves lyrics from Audiveris when SMT++ disagrees on pitch', () => {
      const audNote = makeNote({ step: 'C' }, 'quarter', {
        lyrics: [{ number: 1, syllabic: 'single', text: 'Hal' }],
      });
      const smtNote = makeNote({ step: 'D' });

      const audiveris = makeScoreData([makeMeasure([audNote])]);
      const smt = makeScoreData([makeMeasure([smtNote])]);

      const result = mergeEnsembleResults({ audiveris, smt });

      const merged = result.merged.parts[0].measures[0].elements[0] as NoteElement;
      expect(merged.pitch.step).toBe('D'); // SMT++ pitch
      expect(merged.lyrics).toBeDefined();
      expect(merged.lyrics![0].text).toBe('Hal'); // Audiveris lyrics preserved
    });

    test('preserves articulations from Audiveris', () => {
      const audNote = makeNote({ step: 'C' }, 'quarter', {
        articulations: [{ type: 'staccato', placement: 'above' }] as any,
      });
      const smtNote = makeNote({ step: 'C' }); // Same pitch, no articulations

      const audiveris = makeScoreData([makeMeasure([audNote])]);
      const smt = makeScoreData([makeMeasure([smtNote])]);

      const result = mergeEnsembleResults({ audiveris, smt });

      const merged = result.merged.parts[0].measures[0].elements[0] as NoteElement;
      expect(merged.articulations).toBeDefined();
    });
  });

  describe('note count mismatch', () => {
    test('flags entire measure when note counts differ', () => {
      const audiveris = makeScoreData([
        makeMeasure([makeNote({ step: 'C' }), makeNote({ step: 'D' })]),
      ]);
      const smt = makeScoreData([
        makeMeasure([makeNote({ step: 'C' }), makeNote({ step: 'D' }), makeNote({ step: 'E' })]),
      ]);

      const result = mergeEnsembleResults({ audiveris, smt });

      // Should have a measure-level conflict
      expect(result.conflicts.length).toBeGreaterThanOrEqual(1);
      const measureConflict = result.conflicts.find((c) => c.elementIndex === -1);
      expect(measureConflict).toBeDefined();
      expect(measureConflict!.resolution).toBe('flagged');

      // All notes should have low confidence
      const notes = result.merged.parts[0].measures[0].elements.filter(
        (e) => e.type === 'note',
      ) as NoteElement[];
      for (const note of notes) {
        expect(note.confidence).toBeLessThanOrEqual(0.5);
      }
    });
  });

  describe('non-note elements', () => {
    test('passes through rest elements unchanged', () => {
      const rest = makeRest('half');
      const note = makeNote({ step: 'C' });

      const audiveris = makeScoreData([makeMeasure([rest, note])]);
      const smt = makeScoreData([makeMeasure([makeRest('half'), { ...note, id: 'smt-C' }])]);

      const result = mergeEnsembleResults({ audiveris, smt });

      expect(result.merged.parts[0].measures[0].elements[0].type).toBe('rest');
    });
  });

  describe('multi-measure scores', () => {
    test('merges each measure independently', () => {
      const audiveris = makeScoreData([
        makeMeasure([makeNote({ step: 'C' })], 1),
        makeMeasure([makeNote({ step: 'E' })], 2),
      ]);
      const smt = makeScoreData([
        makeMeasure([makeNote({ step: 'C' })], 1), // agree
        makeMeasure([makeNote({ step: 'F' })], 2), // disagree
      ]);

      const result = mergeEnsembleResults({ audiveris, smt });

      // Measure 1: agreement
      const m1 = result.merged.parts[0].measures[0].elements[0] as NoteElement;
      expect(m1.pitch.step).toBe('C');

      // Measure 2: SMT++ wins
      const m2 = result.merged.parts[0].measures[1].elements[0] as NoteElement;
      expect(m2.pitch.step).toBe('F');

      expect(result.conflicts).toHaveLength(1);
    });
  });

  describe('merge statistics', () => {
    test('reports correct statistics', () => {
      const audiveris = makeScoreData([
        makeMeasure([makeNote({ step: 'C' }), makeNote({ step: 'D' })]),
      ]);
      const smt = makeScoreData([
        makeMeasure([makeNote({ step: 'C' }), makeNote({ step: 'E' })]),
      ]);

      const result = mergeEnsembleResults({ audiveris, smt });

      expect(result.stats.totalElements).toBe(2);
      expect(result.stats.agreements).toBe(1);  // C matches
      expect(result.stats.conflicts).toBe(1);   // D vs E
    });
  });
});
