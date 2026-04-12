/**
 * Unit tests for reviewGenerator extended music theory validation rules.
 */

import { describe, test, expect } from 'vitest';
import { generateReviewState } from './reviewGenerator';
import type { ScoreData, Measure } from '../../shared/types/measure';
import type { NoteElement, RestElement, Duration, Pitch } from '../../shared/types/elements';
import type { MeasureAttributes } from '../../shared/types/attributes';
import type { MergeConflict } from './ensembleMerger';

// ─── Helpers ───

let noteId = 0;
function makeNote(
  step: Pitch['step'],
  octave: number = 4,
  noteType: Duration['noteType'] = 'quarter',
  extras?: Partial<NoteElement>,
): NoteElement {
  const pitch: Pitch = { step, octave, alter: extras?.pitch?.alter };
  const { pitch: _p, ...restExtras } = extras ?? {};
  return {
    type: 'note',
    id: `test-note-${++noteId}`,
    pitch,
    duration: { divisions: 4, noteType, dots: 0 },
    voice: 1,
    staff: 1,
    ...restExtras,
  };
}

function makeMeasure(
  elements: NoteElement[],
  attrs?: MeasureAttributes,
  number = 1,
): Measure {
  return { number, attributes: attrs, elements, directions: [] };
}

function makeScore(measures: Measure[]): ScoreData {
  return {
    parts: [{ id: 'P1', name: 'Test', staves: 1, measures }],
  };
}

// ─── Tests ───

describe('reviewGenerator', () => {
  beforeEach(() => {
    noteId = 0;
  });

  describe('existing rules (baseline)', () => {
    test('flags grace notes with low confidence', () => {
      const note = makeNote('C', 4, 'eighth', {
        graceNote: { type: 'grace', slash: true },
      } as any);
      const score = makeScore([makeMeasure([note])]);

      const review = generateReviewState(score, 0.7);

      expect(review.items).toHaveLength(1);
      expect(review.items[0].symbolConfidence.confidence).toBeLessThanOrEqual(0.5);
      expect(review.items[0].symbolConfidence.type).toBe('grace-note');
    });

    test('flags 32nd notes with low confidence', () => {
      const note = makeNote('C', 4, '32nd');
      const score = makeScore([makeMeasure([note])]);

      const review = generateReviewState(score, 0.7);

      expect(review.items).toHaveLength(1);
      expect(review.items[0].symbolConfidence.confidence).toBeLessThanOrEqual(0.6);
    });

    test('flags double sharps with low confidence', () => {
      const note = makeNote('F', 4, 'quarter', { pitch: { step: 'F', octave: 4, alter: 2 } });
      const score = makeScore([makeMeasure([note])]);

      const review = generateReviewState(score, 0.7);

      expect(review.items).toHaveLength(1);
      expect(review.items[0].symbolConfidence.confidence).toBeLessThanOrEqual(0.6);
    });

    test('flags measure duration mismatch with very low confidence', () => {
      const attrs: MeasureAttributes = {
        divisions: 4,
        timeSignature: { beats: 4, beatType: 4 },
      };
      // Only 2 quarter notes in 4/4 time — duration mismatch
      const notes = [makeNote('C'), makeNote('D')];
      const score = makeScore([makeMeasure(notes, attrs)]);

      const review = generateReviewState(score, 0.7);

      expect(review.items.length).toBeGreaterThanOrEqual(1);
      for (const item of review.items) {
        expect(item.symbolConfidence.confidence).toBeLessThanOrEqual(0.4);
      }
    });

    test('returns empty items for normal notes above threshold', () => {
      const attrs: MeasureAttributes = {
        divisions: 4,
        timeSignature: { beats: 4, beatType: 4 },
      };
      const notes = [
        makeNote('C'), makeNote('D'), makeNote('E'), makeNote('F'),
      ];
      const score = makeScore([makeMeasure(notes, attrs)]);

      const review = generateReviewState(score, 0.7);

      expect(review.items).toHaveLength(0);
    });
  });

  describe('voice crossing detection', () => {
    test('penalizes notes when voice 1 is lower than voice 2', () => {
      const attrs: MeasureAttributes = {
        divisions: 4,
        timeSignature: { beats: 4, beatType: 4 },
        clef: [{ sign: 'G', line: 2, staffNumber: 1 }],
      };
      // Voice 1 at C3 (low), Voice 2 at G4 (high) — crossing
      const v1Note = makeNote('C', 3, 'quarter', { voice: 1 });
      const v2Note = makeNote('G', 4, 'quarter', { voice: 2 });
      // Add two more notes to fill the measure
      const v1Note2 = makeNote('C', 3, 'quarter', { voice: 1 });
      const v2Note2 = makeNote('G', 4, 'quarter', { voice: 2 });

      const score = makeScore([makeMeasure([v1Note, v2Note, v1Note2, v2Note2], attrs)]);

      const review = generateReviewState(score, 0.85);

      // Voice crossing should flag the involved notes
      const flagged = review.items.filter(
        (item) => item.symbolConfidence.confidence < 0.85,
      );
      expect(flagged.length).toBeGreaterThanOrEqual(1);
    });

    test('does not penalize normal voice order (voice 1 higher)', () => {
      const attrs: MeasureAttributes = {
        divisions: 4,
        timeSignature: { beats: 4, beatType: 4 },
        clef: [{ sign: 'G', line: 2, staffNumber: 1 }],
      };
      // Voice 1: 4 quarter notes (G4, A4, B4, C5) — fills 4/4
      // Voice 2: 4 quarter notes (C4, D4, E4, F4) — fills 4/4
      // Voice 1 is always higher than voice 2 — correct order
      const notes = [
        makeNote('G', 4, 'quarter', { voice: 1 }),
        makeNote('A', 4, 'quarter', { voice: 1 }),
        makeNote('B', 4, 'quarter', { voice: 1 }),
        makeNote('C', 5, 'quarter', { voice: 1 }),
        makeNote('C', 4, 'quarter', { voice: 2 }),
        makeNote('D', 4, 'quarter', { voice: 2 }),
        makeNote('E', 4, 'quarter', { voice: 2 }),
        makeNote('F', 4, 'quarter', { voice: 2 }),
      ];

      const score = makeScore([makeMeasure(notes, attrs)]);

      const review = generateReviewState(score, 0.7);
      expect(review.items).toHaveLength(0);
    });
  });

  describe('tie validity', () => {
    test('flags tie between different pitches', () => {
      const attrs: MeasureAttributes = { divisions: 4, timeSignature: { beats: 4, beatType: 4 } };
      const note1 = makeNote('C', 4, 'quarter', {
        tie: { type: 'start' },
      });
      const note2 = makeNote('D', 4, 'quarter'); // Different pitch — invalid tie
      const note3 = makeNote('E', 4, 'quarter');
      const note4 = makeNote('F', 4, 'quarter');

      const score = makeScore([makeMeasure([note1, note2, note3, note4], attrs)]);

      const review = generateReviewState(score, 0.7);

      // The tied C→D should be flagged
      const flagged = review.items.filter(
        (item) => item.symbolConfidence.confidence <= 0.35,
      );
      expect(flagged.length).toBeGreaterThanOrEqual(1);
    });

    test('does not flag tie between same pitches', () => {
      const attrs: MeasureAttributes = { divisions: 4, timeSignature: { beats: 4, beatType: 4 } };
      const note1 = makeNote('C', 4, 'quarter', {
        tie: { type: 'start' },
      });
      const note2 = makeNote('C', 4, 'quarter'); // Same pitch — valid tie
      const note3 = makeNote('D', 4, 'quarter');
      const note4 = makeNote('E', 4, 'quarter');

      const score = makeScore([makeMeasure([note1, note2, note3, note4], attrs)]);

      const review = generateReviewState(score, 0.7);
      expect(review.items).toHaveLength(0);
    });
  });

  describe('lyric alignment (hymn-specific)', () => {
    test('flags notes missing lyrics when other notes in same voice have lyrics', () => {
      const attrs: MeasureAttributes = { divisions: 4, timeSignature: { beats: 4, beatType: 4 } };
      const noteWithLyric = makeNote('C', 4, 'quarter', {
        lyrics: [{ number: 1, syllabic: 'single', text: 'A' }],
      });
      const noteWithout = makeNote('D', 4, 'quarter'); // No lyrics — gap
      const noteWithLyric2 = makeNote('E', 4, 'quarter', {
        lyrics: [{ number: 1, syllabic: 'single', text: 'men' }],
      });
      const noteWithout2 = makeNote('F', 4, 'quarter');

      const score = makeScore([makeMeasure(
        [noteWithLyric, noteWithout, noteWithLyric2, noteWithout2],
        attrs,
      )]);

      const review = generateReviewState(score, 0.85);

      // Notes without lyrics in a lyric-bearing voice should get penalized
      const flaggedIds = review.items.map((i) => i.symbolConfidence.symbolId);
      expect(flaggedIds).toContain(noteWithout.id);
    });

    test('does not flag measures where no notes have lyrics', () => {
      const attrs: MeasureAttributes = { divisions: 4, timeSignature: { beats: 4, beatType: 4 } };
      const notes = [
        makeNote('C'), makeNote('D'), makeNote('E'), makeNote('F'),
      ];
      const score = makeScore([makeMeasure(notes, attrs)]);

      const review = generateReviewState(score, 0.85);

      // No lyric penalty should apply
      expect(review.items).toHaveLength(0);
    });
  });

  describe('repeat structure validation', () => {
    test('flags backward repeat without forward repeat', () => {
      const attrs: MeasureAttributes = { divisions: 4, timeSignature: { beats: 4, beatType: 4 } };
      const m1 = makeMeasure(
        [makeNote('C'), makeNote('D'), makeNote('E'), makeNote('F')],
        attrs, 1,
      );
      const m2: Measure = {
        number: 2,
        attributes: attrs,
        elements: [makeNote('G'), makeNote('A'), makeNote('B'), makeNote('C', 5)],
        directions: [],
        barline: { location: 'right', style: 'light-heavy', repeat: { direction: 'backward' } },
      };

      const score = makeScore([m1, m2]);
      const review = generateReviewState(score, 0.85);

      // Backward repeat without forward should flag measure 2
      const m2Items = review.items.filter((i) => i.measureIndex === 1);
      expect(m2Items.length).toBeGreaterThanOrEqual(1);
    });

    test('does not flag matched forward-backward repeats', () => {
      const attrs: MeasureAttributes = { divisions: 4, timeSignature: { beats: 4, beatType: 4 } };
      const m1: Measure = {
        number: 1, attributes: attrs,
        elements: [makeNote('C'), makeNote('D'), makeNote('E'), makeNote('F')],
        directions: [],
        barline: { location: 'left', style: 'heavy-light', repeat: { direction: 'forward' } },
      };
      const m2: Measure = {
        number: 2, attributes: attrs,
        elements: [makeNote('G'), makeNote('A'), makeNote('B'), makeNote('C', 5)],
        directions: [],
        barline: { location: 'right', style: 'light-heavy', repeat: { direction: 'backward' } },
      };

      const score = makeScore([m1, m2]);
      const review = generateReviewState(score, 0.7);

      expect(review.items).toHaveLength(0);
    });
  });

  describe('ensemble conflict integration', () => {
    test('lowers confidence for measures with merge conflicts', () => {
      const attrs: MeasureAttributes = { divisions: 4, timeSignature: { beats: 4, beatType: 4 } };
      const notes = [makeNote('C'), makeNote('D'), makeNote('E'), makeNote('F')];
      const score = makeScore([makeMeasure(notes, attrs)]);

      const conflicts: MergeConflict[] = [{
        partIndex: 0,
        measureIndex: 0,
        elementIndex: 0,
        resolution: 'smt',
        confidence: 0.5,
        description: 'Test conflict',
      }];

      const review = generateReviewState(score, { threshold: 0.7, mergeConflicts: conflicts });

      // All notes in conflicted measure should have lowered confidence
      expect(review.items.length).toBeGreaterThanOrEqual(1);
      for (const item of review.items) {
        expect(item.symbolConfidence.confidence).toBeLessThanOrEqual(0.6);
      }
    });

    test('boosts confidence when ensemble agrees (conflicts exist elsewhere)', () => {
      const attrs: MeasureAttributes = { divisions: 4, timeSignature: { beats: 4, beatType: 4 } };
      const m1 = makeMeasure(
        [makeNote('C'), makeNote('D'), makeNote('E'), makeNote('F')],
        attrs, 1,
      );
      const m2 = makeMeasure(
        [makeNote('G'), makeNote('A'), makeNote('B'), makeNote('C', 5)],
        attrs, 2,
      );
      const score = makeScore([m1, m2]);

      // Conflict only in measure 2
      const conflicts: MergeConflict[] = [{
        partIndex: 0,
        measureIndex: 1,
        elementIndex: 0,
        resolution: 'smt',
        confidence: 0.5,
        description: 'Test conflict in m2',
      }];

      const review = generateReviewState(score, { threshold: 0.7, mergeConflicts: conflicts });

      // Measure 1 (no conflict) should have boosted confidence — no items below threshold
      const m1Items = review.items.filter((i) => i.measureIndex === 0);
      expect(m1Items).toHaveLength(0);
    });
  });

  describe('options backward compatibility', () => {
    test('accepts number threshold (backward compatible)', () => {
      const score = makeScore([makeMeasure([makeNote('C')])]);
      const review = generateReviewState(score, 0.7);
      expect(review.threshold).toBe(0.7);
    });

    test('accepts options object with threshold', () => {
      const score = makeScore([makeMeasure([makeNote('C')])]);
      const review = generateReviewState(score, { threshold: 0.5 });
      expect(review.threshold).toBe(0.5);
    });

    test('defaults threshold to 0.7', () => {
      const score = makeScore([makeMeasure([makeNote('C')])]);
      const review = generateReviewState(score);
      expect(review.threshold).toBe(0.7);
    });
  });
});
