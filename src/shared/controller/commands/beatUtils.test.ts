import { describe, it, expect } from 'vitest';
import type { Measure, NoteElement, RestElement } from '../../types';
import {
  noteTypeToDivisions,
  getMeasureTotalDivisions,
  getUsedDivisions,
  divisionsToNoteType,
  fillWithRests,
  mergeAdjacentRests,
  createMatchingRest,
  getMeasureDivisions,
} from './beatUtils';

function makeMeasure(
  divisions: number,
  beats: number,
  beatType: number,
  elements: Measure['elements'] = [],
): Measure {
  return {
    number: 1,
    attributes: {
      divisions,
      timeSignature: { beats, beatType },
    },
    elements,
    directions: [],
  };
}

describe('beatUtils', () => {
  describe('noteTypeToDivisions', () => {
    it('should calculate quarter note divisions with ppq=1', () => {
      expect(noteTypeToDivisions('quarter', 0, 1)).toBe(1);
    });

    it('should calculate half note divisions with ppq=1', () => {
      expect(noteTypeToDivisions('half', 0, 1)).toBe(2);
    });

    it('should calculate whole note divisions with ppq=1', () => {
      expect(noteTypeToDivisions('whole', 0, 1)).toBe(4);
    });

    it('should calculate eighth note divisions with ppq=2', () => {
      expect(noteTypeToDivisions('eighth', 0, 2)).toBe(1);
    });

    it('should handle dotted quarter with ppq=2', () => {
      // quarter = 2, dotted = 2 + 1 = 3
      expect(noteTypeToDivisions('quarter', 1, 2)).toBe(3);
    });

    it('should handle double-dotted half with ppq=4', () => {
      // half = 8, dot1 = 4, dot2 = 2 → total = 14
      expect(noteTypeToDivisions('half', 2, 4)).toBe(14);
    });
  });

  describe('getMeasureTotalDivisions', () => {
    it('should calculate 4/4 with ppq=1', () => {
      const m = makeMeasure(1, 4, 4);
      expect(getMeasureTotalDivisions(m)).toBe(4);
    });

    it('should calculate 3/4 with ppq=1', () => {
      const m = makeMeasure(1, 3, 4);
      expect(getMeasureTotalDivisions(m)).toBe(3);
    });

    it('should calculate 6/8 with ppq=2', () => {
      const m = makeMeasure(2, 6, 8);
      // 6 * (4/8) * 2 = 6
      expect(getMeasureTotalDivisions(m)).toBe(6);
    });

    it('should default to 4/4 with no time signature', () => {
      const m: Measure = {
        number: 1,
        attributes: { divisions: 1 },
        elements: [],
        directions: [],
      };
      expect(getMeasureTotalDivisions(m)).toBe(4);
    });
  });

  describe('getUsedDivisions', () => {
    it('should sum element divisions', () => {
      const m = makeMeasure(1, 4, 4, [
        {
          type: 'note',
          id: 'n1',
          pitch: { step: 'C', octave: 4 },
          duration: { divisions: 1, noteType: 'quarter', dots: 0 },
          voice: 1,
          staff: 1,
        } as NoteElement,
        {
          type: 'rest',
          id: 'r1',
          duration: { divisions: 1, noteType: 'quarter', dots: 0 },
          voice: 1,
          staff: 1,
        } as RestElement,
      ]);
      expect(getUsedDivisions(m)).toBe(2);
    });
  });

  describe('divisionsToNoteType', () => {
    it('should find quarter for 1 division (ppq=1)', () => {
      const result = divisionsToNoteType(1, 1);
      expect(result).toEqual({ noteType: 'quarter', dots: 0 });
    });

    it('should find half for 2 divisions (ppq=1)', () => {
      const result = divisionsToNoteType(2, 1);
      expect(result).toEqual({ noteType: 'half', dots: 0 });
    });

    it('should find whole for 4 divisions (ppq=1)', () => {
      const result = divisionsToNoteType(4, 1);
      expect(result).toEqual({ noteType: 'whole', dots: 0 });
    });

    it('should find dotted quarter for 3 divisions (ppq=2)', () => {
      const result = divisionsToNoteType(3, 2);
      expect(result).toEqual({ noteType: 'quarter', dots: 1 });
    });

    it('should return null for non-representable divisions', () => {
      // 5 divisions with ppq=1 can't be a single note
      const result = divisionsToNoteType(5, 1);
      expect(result).toBeNull();
    });
  });

  describe('fillWithRests', () => {
    it('should fill 1 division (ppq=1) with a quarter rest', () => {
      const rests = fillWithRests(1, 1);
      expect(rests).toHaveLength(1);
      expect(rests[0].type).toBe('rest');
      expect(rests[0].duration.noteType).toBe('quarter');
    });

    it('should fill 2 divisions (ppq=1) with a half rest', () => {
      const rests = fillWithRests(2, 1);
      expect(rests).toHaveLength(1);
      expect(rests[0].duration.noteType).toBe('half');
    });

    it('should fill 3 divisions (ppq=1) with dotted half', () => {
      const rests = fillWithRests(3, 1);
      expect(rests).toHaveLength(1);
      expect(rests[0].duration.noteType).toBe('half');
      expect(rests[0].duration.dots).toBe(1);
    });

    it('should fill 4 divisions (ppq=1) with a whole rest', () => {
      const rests = fillWithRests(4, 1);
      expect(rests).toHaveLength(1);
      expect(rests[0].duration.noteType).toBe('whole');
    });

    it('should fill 0.5 divisions (ppq=1) with an eighth rest', () => {
      const rests = fillWithRests(0.5, 1);
      expect(rests).toHaveLength(1);
      expect(rests[0].duration.noteType).toBe('eighth');
      expect(rests[0].duration.divisions).toBe(0.5);
    });

    it('should fill 1.5 divisions (ppq=1) with dotted quarter', () => {
      const rests = fillWithRests(1.5, 1);
      expect(rests).toHaveLength(1);
      expect(rests[0].duration.noteType).toBe('quarter');
      expect(rests[0].duration.dots).toBe(1);
    });

    it('should set voice and staff on generated rests', () => {
      const rests = fillWithRests(1, 1, 2, 3);
      expect(rests[0].voice).toBe(2);
      expect(rests[0].staff).toBe(3);
    });

    it('should generate unique IDs for each rest', () => {
      const rests = fillWithRests(3, 1);
      const ids = new Set(rests.map((r) => r.id));
      expect(ids.size).toBe(rests.length);
    });
  });

  describe('mergeAdjacentRests', () => {
    it('should merge two 8th rests into a quarter rest', () => {
      const elements = [
        { type: 'rest' as const, id: 'r1', duration: { divisions: 0.5, noteType: 'eighth' as const, dots: 0 }, voice: 1, staff: 1 },
        { type: 'rest' as const, id: 'r2', duration: { divisions: 0.5, noteType: 'eighth' as const, dots: 0 }, voice: 1, staff: 1 },
      ];
      const merged = mergeAdjacentRests(elements, 1);
      expect(merged).toHaveLength(1);
      expect(merged[0].duration.noteType).toBe('quarter');
      expect(merged[0].duration.divisions).toBe(1);
    });

    it('should merge two 16th rests into an 8th rest', () => {
      const elements = [
        { type: 'rest' as const, id: 'r1', duration: { divisions: 0.25, noteType: '16th' as const, dots: 0 }, voice: 1, staff: 1 },
        { type: 'rest' as const, id: 'r2', duration: { divisions: 0.25, noteType: '16th' as const, dots: 0 }, voice: 1, staff: 1 },
      ];
      const merged = mergeAdjacentRests(elements, 1);
      expect(merged).toHaveLength(1);
      expect(merged[0].duration.noteType).toBe('eighth');
    });

    it('should merge two 32nd rests into a 16th rest', () => {
      const elements = [
        { type: 'rest' as const, id: 'r1', duration: { divisions: 0.125, noteType: '32nd' as const, dots: 0 }, voice: 1, staff: 1 },
        { type: 'rest' as const, id: 'r2', duration: { divisions: 0.125, noteType: '32nd' as const, dots: 0 }, voice: 1, staff: 1 },
      ];
      const merged = mergeAdjacentRests(elements, 1);
      expect(merged).toHaveLength(1);
      expect(merged[0].duration.noteType).toBe('16th');
    });

    it('should not merge rests separated by a note', () => {
      const elements = [
        { type: 'rest' as const, id: 'r1', duration: { divisions: 0.5, noteType: 'eighth' as const, dots: 0 }, voice: 1, staff: 1 },
        { type: 'note' as const, id: 'n1', pitch: { step: 'C' as const, octave: 4 }, duration: { divisions: 0.5, noteType: 'eighth' as const, dots: 0 }, voice: 1, staff: 1 },
        { type: 'rest' as const, id: 'r2', duration: { divisions: 0.5, noteType: 'eighth' as const, dots: 0 }, voice: 1, staff: 1 },
      ];
      const merged = mergeAdjacentRests(elements, 1);
      expect(merged).toHaveLength(3);
    });

    it('should respect protectId and not merge across it', () => {
      const elements = [
        { type: 'rest' as const, id: 'r1', duration: { divisions: 0.25, noteType: '16th' as const, dots: 0 }, voice: 1, staff: 1 },
        { type: 'rest' as const, id: 'r2', duration: { divisions: 0.25, noteType: '16th' as const, dots: 0 }, voice: 1, staff: 1 },
      ];
      const merged = mergeAdjacentRests(elements, 1, 'r1');
      // r1 is protected → stays alone. r2 is alone → stays alone. No merge.
      expect(merged).toHaveLength(2);
    });

    it('should merge fill rest with trailing rest but not with protected element', () => {
      // Scenario: [32nd protected] [32nd fill] [16th other]
      const elements = [
        { type: 'rest' as const, id: 'target', duration: { divisions: 0.125, noteType: '32nd' as const, dots: 0 }, voice: 1, staff: 1 },
        { type: 'rest' as const, id: 'fill', duration: { divisions: 0.125, noteType: '32nd' as const, dots: 0 }, voice: 1, staff: 1 },
        { type: 'rest' as const, id: 'other', duration: { divisions: 0.25, noteType: '16th' as const, dots: 0 }, voice: 1, staff: 1 },
      ];
      const merged = mergeAdjacentRests(elements, 1, 'target');
      // target stays. fill + other merge: 0.125 + 0.25 = 0.375 = dotted 16th
      expect(merged).toHaveLength(2);
      expect(merged[0].duration.noteType).toBe('32nd'); // protected target
      expect(merged[1].duration.divisions).toBeCloseTo(0.375);
    });
  });

  describe('createMatchingRest', () => {
    it('should create a rest matching note duration', () => {
      const note: NoteElement = {
        type: 'note',
        id: 'n1',
        pitch: { step: 'C', octave: 4 },
        duration: { divisions: 2, noteType: 'half', dots: 0 },
        voice: 1,
        staff: 1,
      };
      const rest = createMatchingRest(note, 1, 1);
      expect(rest.type).toBe('rest');
      expect(rest.duration.noteType).toBe('half');
      expect(rest.duration.divisions).toBe(2);
      expect(rest.id).not.toBe('n1');
    });
  });

  describe('getMeasureDivisions', () => {
    it('should return divisions from attributes', () => {
      const m = makeMeasure(4, 4, 4);
      expect(getMeasureDivisions(m)).toBe(4);
    });

    it('should default to 1 when no attributes', () => {
      const m: Measure = { number: 1, elements: [], directions: [] };
      expect(getMeasureDivisions(m)).toBe(1);
    });
  });

  // ─── Complex time signatures ───

  describe('complex time signatures', () => {
    it('should calculate 5/4 with ppq=1', () => {
      const m = makeMeasure(1, 5, 4);
      expect(getMeasureTotalDivisions(m)).toBe(5);
    });

    it('should calculate 7/8 with ppq=2', () => {
      const m = makeMeasure(2, 7, 8);
      expect(getMeasureTotalDivisions(m)).toBe(7);
    });

    it('should calculate 2/2 with ppq=1', () => {
      const m = makeMeasure(1, 2, 2);
      expect(getMeasureTotalDivisions(m)).toBe(4); // same as 4/4 in quarter-divisions
    });

    it('should calculate 12/8 with ppq=2', () => {
      const m = makeMeasure(2, 12, 8);
      expect(getMeasureTotalDivisions(m)).toBe(12);
    });
  });

  describe('noteTypeToDivisions with higher ppq', () => {
    it('should calculate quarter note with ppq=4', () => {
      expect(noteTypeToDivisions('quarter', 0, 4)).toBe(4);
    });

    it('should calculate 16th note with ppq=4', () => {
      expect(noteTypeToDivisions('16th', 0, 4)).toBe(1);
    });

    it('should calculate dotted 8th with ppq=4', () => {
      // eighth = 2, dot = 1, total = 3
      expect(noteTypeToDivisions('eighth', 1, 4)).toBe(3);
    });

    it('should calculate 32nd note with ppq=1', () => {
      expect(noteTypeToDivisions('32nd', 0, 1)).toBe(0.125);
    });

    it('should calculate 64th note with ppq=1', () => {
      expect(noteTypeToDivisions('64th', 0, 1)).toBe(0.0625);
    });
  });

  describe('divisionsToNoteType edge cases', () => {
    it('should find dotted half for 6 divisions (ppq=2)', () => {
      const result = divisionsToNoteType(6, 2);
      expect(result).toEqual({ noteType: 'half', dots: 1 });
    });

    it('should find double-dotted quarter for 1.75 divisions (ppq=1)', () => {
      const result = divisionsToNoteType(1.75, 1);
      expect(result).toEqual({ noteType: 'quarter', dots: 2 });
    });

    it('should return null for 0 divisions', () => {
      const result = divisionsToNoteType(0, 1);
      expect(result).toBeNull();
    });

    it('should find eighth for 1 division (ppq=2)', () => {
      const result = divisionsToNoteType(1, 2);
      expect(result).toEqual({ noteType: 'eighth', dots: 0 });
    });
  });

  describe('fillWithRests edge cases', () => {
    it('should handle 0 divisions (no rests)', () => {
      const rests = fillWithRests(0, 1);
      expect(rests).toHaveLength(0);
    });

    it('should fill 5 divisions (ppq=1) as whole + quarter', () => {
      const rests = fillWithRests(5, 1);
      const total = rests.reduce((s, r) => s + r.duration.divisions, 0);
      expect(total).toBe(5);
      // Should be 2 rests: whole (4) + quarter (1), or dotted whole (6) is too big
      expect(rests.length).toBeGreaterThanOrEqual(1);
      expect(rests.length).toBeLessThanOrEqual(3);
    });

    it('should fill 7 divisions (ppq=2) correctly', () => {
      const rests = fillWithRests(7, 2);
      const total = rests.reduce((s, r) => s + r.duration.divisions, 0);
      expect(total).toBe(7);
    });

    it('should generate rests preserving voice and staff', () => {
      const rests = fillWithRests(2, 1, 3, 2);
      for (const r of rests) {
        expect(r.voice).toBe(3);
        expect(r.staff).toBe(2);
      }
    });
  });

  describe('getUsedDivisions with forward/backup', () => {
    it('should add forward duration', () => {
      const m: Measure = {
        number: 1,
        attributes: { divisions: 1 },
        elements: [
          { type: 'note', id: 'n1', pitch: { step: 'C', octave: 4 }, duration: { divisions: 1, noteType: 'quarter', dots: 0 }, voice: 1, staff: 1 } as NoteElement,
          { type: 'forward', duration: { divisions: 1, noteType: 'quarter', dots: 0 } } as any,
        ],
        directions: [],
      };
      expect(getUsedDivisions(m)).toBe(2);
    });

    it('should subtract backup duration', () => {
      const m: Measure = {
        number: 1,
        attributes: { divisions: 1 },
        elements: [
          { type: 'note', id: 'n1', pitch: { step: 'C', octave: 4 }, duration: { divisions: 2, noteType: 'half', dots: 0 }, voice: 1, staff: 1 } as NoteElement,
          { type: 'backup', duration: { divisions: 2, noteType: 'half', dots: 0 } } as any,
          { type: 'note', id: 'n2', pitch: { step: 'E', octave: 3 }, duration: { divisions: 2, noteType: 'half', dots: 0 }, voice: 2, staff: 1 } as NoteElement,
        ],
        directions: [],
      };
      // 2 - 2 + 2 = 2
      expect(getUsedDivisions(m)).toBe(2);
    });
  });

  describe('mergeAdjacentRests: complex scenarios', () => {
    it('should merge three consecutive eighth rests into dotted quarter', () => {
      const elements = [
        { type: 'rest' as const, id: 'r1', duration: { divisions: 0.5, noteType: 'eighth' as const, dots: 0 }, voice: 1, staff: 1 },
        { type: 'rest' as const, id: 'r2', duration: { divisions: 0.5, noteType: 'eighth' as const, dots: 0 }, voice: 1, staff: 1 },
        { type: 'rest' as const, id: 'r3', duration: { divisions: 0.5, noteType: 'eighth' as const, dots: 0 }, voice: 1, staff: 1 },
      ];
      const merged = mergeAdjacentRests(elements, 1);
      expect(merged).toHaveLength(1);
      expect(merged[0].duration.divisions).toBe(1.5);
      expect(merged[0].duration.noteType).toBe('quarter');
      expect(merged[0].duration.dots).toBe(1);
    });

    it('should not merge rests of different voices', () => {
      const elements = [
        { type: 'rest' as const, id: 'r1', duration: { divisions: 1, noteType: 'quarter' as const, dots: 0 }, voice: 1, staff: 1 },
        { type: 'rest' as const, id: 'r2', duration: { divisions: 1, noteType: 'quarter' as const, dots: 0 }, voice: 2, staff: 1 },
      ];
      const merged = mergeAdjacentRests(elements, 1);
      expect(merged).toHaveLength(2);
    });

    it('should handle single element (no merge needed)', () => {
      const elements = [
        { type: 'note' as const, id: 'n1', pitch: { step: 'C' as const, octave: 4 }, duration: { divisions: 4, noteType: 'whole' as const, dots: 0 }, voice: 1, staff: 1 },
      ];
      const merged = mergeAdjacentRests(elements, 1);
      expect(merged).toHaveLength(1);
    });

    it('should handle empty elements array', () => {
      const merged = mergeAdjacentRests([], 1);
      expect(merged).toHaveLength(0);
    });
  });
});
