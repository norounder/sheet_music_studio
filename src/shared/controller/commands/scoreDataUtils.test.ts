import { describe, it, expect } from 'vitest';
import type { ScoreData, NoteElement, RestElement } from '../../types';
import {
  findElementLocation,
  getElementAtLocation,
  updateElementInScore,
  insertElementInMeasure,
  removeElementFromMeasure,
  renumberMeasures,
  generateId,
  createEmptyMeasure,
  cloneMeasure,
  isNoteElement,
  isRestElement,
} from './scoreDataUtils';

function makeTestScoreData(): ScoreData {
  return {
    parts: [
      {
        id: 'P1',
        name: 'Piano',
        staves: 1,
        measures: [
          {
            number: 1,
            attributes: { divisions: 1 },
            elements: [
              {
                type: 'note',
                id: 'n1',
                pitch: { step: 'C', octave: 4 },
                duration: { divisions: 1, noteType: 'quarter', dots: 0 },
                voice: 1,
                staff: 1,
              } as NoteElement,
              {
                type: 'note',
                id: 'n2',
                pitch: { step: 'D', octave: 4 },
                duration: { divisions: 1, noteType: 'quarter', dots: 0 },
                voice: 1,
                staff: 1,
              } as NoteElement,
            ],
            directions: [],
          },
          {
            number: 2,
            elements: [
              {
                type: 'rest',
                id: 'r1',
                duration: { divisions: 4, noteType: 'whole', dots: 0 },
                voice: 1,
                staff: 1,
              } as RestElement,
            ],
            directions: [],
          },
        ],
      },
    ],
  };
}

describe('scoreDataUtils', () => {
  describe('findElementLocation', () => {
    it('should find a note by ID', () => {
      const sd = makeTestScoreData();
      const loc = findElementLocation(sd, 'n1');
      expect(loc).toEqual({ partIndex: 0, measureIndex: 0, elementIndex: 0 });
    });

    it('should find a note in a different position', () => {
      const sd = makeTestScoreData();
      const loc = findElementLocation(sd, 'n2');
      expect(loc).toEqual({ partIndex: 0, measureIndex: 0, elementIndex: 1 });
    });

    it('should find a rest by ID', () => {
      const sd = makeTestScoreData();
      const loc = findElementLocation(sd, 'r1');
      expect(loc).toEqual({ partIndex: 0, measureIndex: 1, elementIndex: 0 });
    });

    it('should return null for missing ID', () => {
      const sd = makeTestScoreData();
      expect(findElementLocation(sd, 'nonexistent')).toBeNull();
    });
  });

  describe('getElementAtLocation', () => {
    it('should return the element at a location', () => {
      const sd = makeTestScoreData();
      const el = getElementAtLocation(sd, {
        partIndex: 0,
        measureIndex: 0,
        elementIndex: 0,
      });
      expect(el.type).toBe('note');
      expect((el as NoteElement).pitch.step).toBe('C');
    });
  });

  describe('updateElementInScore', () => {
    it('should immutably update a single element', () => {
      const sd = makeTestScoreData();
      const loc = { partIndex: 0, measureIndex: 0, elementIndex: 0 };
      const updated = updateElementInScore(sd, loc, (el) => ({
        ...el,
        pitch: { step: 'E' as const, octave: 5 },
      }));

      // New data has changed pitch
      const note = updated.parts[0].measures[0].elements[0] as NoteElement;
      expect(note.pitch.step).toBe('E');
      expect(note.pitch.octave).toBe(5);

      // Original is untouched
      const origNote = sd.parts[0].measures[0].elements[0] as NoteElement;
      expect(origNote.pitch.step).toBe('C');
    });

    it('should not affect other elements', () => {
      const sd = makeTestScoreData();
      const loc = { partIndex: 0, measureIndex: 0, elementIndex: 0 };
      const updated = updateElementInScore(sd, loc, (el) => ({
        ...el,
        pitch: { step: 'E' as const, octave: 5 },
      }));

      const note2 = updated.parts[0].measures[0].elements[1] as NoteElement;
      expect(note2.pitch.step).toBe('D');
    });
  });

  describe('insertElementInMeasure', () => {
    it('should insert at end by default', () => {
      const sd = makeTestScoreData();
      const newNote: NoteElement = {
        type: 'note',
        id: 'n3',
        pitch: { step: 'E', octave: 4 },
        duration: { divisions: 1, noteType: 'quarter', dots: 0 },
        voice: 1,
        staff: 1,
      };
      const updated = insertElementInMeasure(sd, 0, 0, newNote);
      expect(updated.parts[0].measures[0].elements).toHaveLength(3);
      expect(
        (updated.parts[0].measures[0].elements[2] as NoteElement).id,
      ).toBe('n3');
    });

    it('should insert at a specific index', () => {
      const sd = makeTestScoreData();
      const newNote: NoteElement = {
        type: 'note',
        id: 'n3',
        pitch: { step: 'E', octave: 4 },
        duration: { divisions: 1, noteType: 'quarter', dots: 0 },
        voice: 1,
        staff: 1,
      };
      const updated = insertElementInMeasure(sd, 0, 0, newNote, 1);
      expect(updated.parts[0].measures[0].elements).toHaveLength(3);
      expect(
        (updated.parts[0].measures[0].elements[1] as NoteElement).id,
      ).toBe('n3');
    });
  });

  describe('removeElementFromMeasure', () => {
    it('should remove an element by ID', () => {
      const sd = makeTestScoreData();
      const updated = removeElementFromMeasure(sd, 0, 0, 'n1');
      expect(updated.parts[0].measures[0].elements).toHaveLength(1);
      expect(
        (updated.parts[0].measures[0].elements[0] as NoteElement).id,
      ).toBe('n2');
    });

    it('should not modify original', () => {
      const sd = makeTestScoreData();
      removeElementFromMeasure(sd, 0, 0, 'n1');
      expect(sd.parts[0].measures[0].elements).toHaveLength(2);
    });
  });

  describe('renumberMeasures', () => {
    it('should renumber measures sequentially from 1', () => {
      const measures = [
        { number: 5, elements: [], directions: [] },
        { number: 10, elements: [], directions: [] },
        { number: 3, elements: [], directions: [] },
      ];
      const result = renumberMeasures(measures);
      expect(result.map((m) => m.number)).toEqual([1, 2, 3]);
    });
  });

  describe('generateId', () => {
    it('should produce unique values', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('createEmptyMeasure', () => {
    it('should create a measure with the given number', () => {
      const m = createEmptyMeasure(3);
      expect(m.number).toBe(3);
      expect(m.elements).toEqual([]);
      expect(m.directions).toEqual([]);
    });

    it('should include divisions in attributes if provided', () => {
      const m = createEmptyMeasure(1, 4);
      expect(m.attributes?.divisions).toBe(4);
    });
  });

  describe('cloneMeasure', () => {
    it('should deep clone a measure', () => {
      const sd = makeTestScoreData();
      const original = sd.parts[0].measures[0];
      const cloned = cloneMeasure(original);

      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.elements).not.toBe(original.elements);
    });
  });

  describe('type guards', () => {
    it('isNoteElement should identify notes', () => {
      const note: NoteElement = {
        type: 'note',
        id: 'x',
        pitch: { step: 'C', octave: 4 },
        duration: { divisions: 1, noteType: 'quarter', dots: 0 },
        voice: 1,
        staff: 1,
      };
      expect(isNoteElement(note)).toBe(true);
    });

    it('isRestElement should identify rests', () => {
      const rest: RestElement = {
        type: 'rest',
        id: 'x',
        duration: { divisions: 1, noteType: 'quarter', dots: 0 },
        voice: 1,
        staff: 1,
      };
      expect(isRestElement(rest)).toBe(true);
      expect(isNoteElement(rest)).toBe(false);
    });
  });
});
