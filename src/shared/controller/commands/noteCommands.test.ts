import { describe, it, expect } from 'vitest';
import type { ScoreData, NoteElement, RestElement } from '../../types';
import {
  createAddNoteCommand,
  createDeleteNoteCommand,
  createModifyNoteCommand,
  createModifyPitchCommand,
  createModifyDurationCommand,
  createAddRestCommand,
  createDeleteRestCommand,
  createDeleteNoteWithRestCommand,
  createModifyDurationWithFillCommand,
  createConvertRestToNoteCommand,
} from './noteCommands';

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
        ],
      },
    ],
  };
}

function makeNote(id: string, step: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B', octave: number): NoteElement {
  return {
    type: 'note',
    id,
    pitch: { step, octave },
    duration: { divisions: 1, noteType: 'quarter', dots: 0 },
    voice: 1,
    staff: 1,
  };
}

describe('noteCommands', () => {
  describe('createAddNoteCommand', () => {
    it('should add a note and undo should restore', () => {
      const sd = makeTestScoreData();
      const note = makeNote('n3', 'E', 4);
      const cmd = createAddNoteCommand(0, 0, note);

      expect(cmd.type).toBe('addNote');
      expect(cmd.description).toContain('E4');

      const after = cmd.execute(sd);
      expect(after.parts[0].measures[0].elements).toHaveLength(3);

      const restored = cmd.undo(after);
      expect(restored.parts[0].measures[0].elements).toHaveLength(2);
    });

    it('should insert at a specific index', () => {
      const sd = makeTestScoreData();
      const note = makeNote('n3', 'E', 4);
      const cmd = createAddNoteCommand(0, 0, note, 1);

      const after = cmd.execute(sd);
      expect((after.parts[0].measures[0].elements[1] as NoteElement).id).toBe('n3');
    });
  });

  describe('createDeleteNoteCommand', () => {
    it('should delete a note and undo should restore at same index', () => {
      const sd = makeTestScoreData();
      const cmd = createDeleteNoteCommand(sd, 'n1');

      expect(cmd.type).toBe('deleteNote');

      const after = cmd.execute(sd);
      expect(after.parts[0].measures[0].elements).toHaveLength(1);
      expect((after.parts[0].measures[0].elements[0] as NoteElement).id).toBe('n2');

      const restored = cmd.undo(after);
      expect(restored.parts[0].measures[0].elements).toHaveLength(2);
      expect((restored.parts[0].measures[0].elements[0] as NoteElement).id).toBe('n1');
    });

    it('should throw for missing element', () => {
      const sd = makeTestScoreData();
      expect(() => createDeleteNoteCommand(sd, 'nonexistent')).toThrow('Element not found');
    });
  });

  describe('createModifyNoteCommand', () => {
    it('should modify note fields and undo', () => {
      const sd = makeTestScoreData();
      const cmd = createModifyNoteCommand(sd, 'n1', { voice: 2 });

      const after = cmd.execute(sd);
      expect((after.parts[0].measures[0].elements[0] as NoteElement).voice).toBe(2);

      const restored = cmd.undo(after);
      expect((restored.parts[0].measures[0].elements[0] as NoteElement).voice).toBe(1);
    });
  });

  describe('createModifyPitchCommand', () => {
    it('should change pitch step and undo', () => {
      const sd = makeTestScoreData();
      const cmd = createModifyPitchCommand(sd, 'n1', { step: 'G' });

      expect(cmd.type).toBe('modifyPitch');

      const after = cmd.execute(sd);
      expect((after.parts[0].measures[0].elements[0] as NoteElement).pitch.step).toBe('G');
      // Octave unchanged
      expect((after.parts[0].measures[0].elements[0] as NoteElement).pitch.octave).toBe(4);

      const restored = cmd.undo(after);
      expect((restored.parts[0].measures[0].elements[0] as NoteElement).pitch.step).toBe('C');
    });

    it('should change octave and undo', () => {
      const sd = makeTestScoreData();
      const cmd = createModifyPitchCommand(sd, 'n1', { octave: 5 });

      const after = cmd.execute(sd);
      expect((after.parts[0].measures[0].elements[0] as NoteElement).pitch.octave).toBe(5);

      const restored = cmd.undo(after);
      expect((restored.parts[0].measures[0].elements[0] as NoteElement).pitch.octave).toBe(4);
    });

    it('should change alter and undo', () => {
      const sd = makeTestScoreData();
      const cmd = createModifyPitchCommand(sd, 'n1', { alter: 1 });

      const after = cmd.execute(sd);
      expect((after.parts[0].measures[0].elements[0] as NoteElement).pitch.alter).toBe(1);

      const restored = cmd.undo(after);
      expect((restored.parts[0].measures[0].elements[0] as NoteElement).pitch.alter).toBeUndefined();
    });
  });

  describe('createModifyDurationCommand', () => {
    it('should change note type and undo', () => {
      const sd = makeTestScoreData();
      const cmd = createModifyDurationCommand(sd, 'n1', { noteType: 'half' });

      expect(cmd.type).toBe('modifyDuration');

      const after = cmd.execute(sd);
      expect((after.parts[0].measures[0].elements[0] as NoteElement).duration.noteType).toBe('half');

      const restored = cmd.undo(after);
      expect((restored.parts[0].measures[0].elements[0] as NoteElement).duration.noteType).toBe('quarter');
    });

    it('should change dots and undo', () => {
      const sd = makeTestScoreData();
      const cmd = createModifyDurationCommand(sd, 'n1', { dots: 1 });

      const after = cmd.execute(sd);
      expect((after.parts[0].measures[0].elements[0] as NoteElement).duration.dots).toBe(1);

      const restored = cmd.undo(after);
      expect((restored.parts[0].measures[0].elements[0] as NoteElement).duration.dots).toBe(0);
    });
  });

  describe('createAddRestCommand', () => {
    it('should add a rest and undo', () => {
      const sd = makeTestScoreData();
      const rest: RestElement = {
        type: 'rest',
        id: 'r1',
        duration: { divisions: 1, noteType: 'quarter', dots: 0 },
        voice: 1,
        staff: 1,
      };
      const cmd = createAddRestCommand(0, 0, rest);

      const after = cmd.execute(sd);
      expect(after.parts[0].measures[0].elements).toHaveLength(3);

      const restored = cmd.undo(after);
      expect(restored.parts[0].measures[0].elements).toHaveLength(2);
    });
  });

  describe('createDeleteRestCommand', () => {
    it('should delete a rest and undo', () => {
      const sd: ScoreData = {
        parts: [
          {
            id: 'P1',
            name: 'Piano',
            staves: 1,
            measures: [
              {
                number: 1,
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

      const cmd = createDeleteRestCommand(sd, 'r1');
      const after = cmd.execute(sd);
      expect(after.parts[0].measures[0].elements).toHaveLength(0);

      const restored = cmd.undo(after);
      expect(restored.parts[0].measures[0].elements).toHaveLength(1);
      expect(restored.parts[0].measures[0].elements[0].type).toBe('rest');
    });
  });

  // ─── Beat-aware commands ───

  describe('createDeleteNoteWithRestCommand', () => {
    it('should replace a note with a rest of the same duration', () => {
      const sd = makeTestScoreData();
      const cmd = createDeleteNoteWithRestCommand(sd, 'n1');

      const after = cmd.execute(sd);
      // Same number of elements
      expect(after.parts[0].measures[0].elements).toHaveLength(2);
      // First element is now a rest
      expect(after.parts[0].measures[0].elements[0].type).toBe('rest');
      expect(after.parts[0].measures[0].elements[0].duration.noteType).toBe('quarter');
    });

    it('should undo by restoring the original note', () => {
      const sd = makeTestScoreData();
      const cmd = createDeleteNoteWithRestCommand(sd, 'n1');

      const after = cmd.execute(sd);
      const restored = cmd.undo(after);
      expect(restored.parts[0].measures[0].elements[0].type).toBe('note');
      expect((restored.parts[0].measures[0].elements[0] as NoteElement).pitch.step).toBe('C');
    });
  });

  describe('createModifyDurationWithFillCommand', () => {
    function makeScoreWithRests(): ScoreData {
      return {
        parts: [{
          id: 'P1', name: 'Piano', staves: 1,
          measures: [{
            number: 1,
            attributes: {
              divisions: 1,
              timeSignature: { beats: 4, beatType: 4 },
            },
            elements: [
              {
                type: 'note', id: 'n1',
                pitch: { step: 'C', octave: 4 },
                duration: { divisions: 2, noteType: 'half', dots: 0 },
                voice: 1, staff: 1,
              } as NoteElement,
              {
                type: 'rest', id: 'r1',
                duration: { divisions: 2, noteType: 'half', dots: 0 },
                voice: 1, staff: 1,
              } as RestElement,
            ],
            directions: [],
          }],
        }],
      };
    }

    it('should shorten and fill with rests (merged)', () => {
      const sd = makeScoreWithRests();
      // half note (2 divs) → quarter note (1 div): gap 1 div
      // fill rest (1 div) + original rest (2 divs) merge → dotted half rest (3 divs)
      const cmd = createModifyDurationWithFillCommand(sd, 'n1', { noteType: 'quarter' });

      const after = cmd.execute(sd);
      const els = after.parts[0].measures[0].elements;
      expect(els).toHaveLength(2);
      expect(els[0].duration.noteType).toBe('quarter');
      expect(els[0].duration.divisions).toBe(1);
      expect(els[1].type).toBe('rest');
      expect(els[1].duration.divisions).toBe(3); // merged: 1 + 2
    });

    it('should undo shortening', () => {
      const sd = makeScoreWithRests();
      const cmd = createModifyDurationWithFillCommand(sd, 'n1', { noteType: 'quarter' });

      const after = cmd.execute(sd);
      const restored = cmd.undo(after);
      expect(restored.parts[0].measures[0].elements).toHaveLength(2);
      expect(restored.parts[0].measures[0].elements[0].duration.noteType).toBe('half');
    });

    it('should lengthen by consuming adjacent rests', () => {
      const sd = makeScoreWithRests();
      // half note (2 divs) → whole note (4 divs): consumes adjacent half rest
      const cmd = createModifyDurationWithFillCommand(sd, 'n1', { noteType: 'whole' });

      const after = cmd.execute(sd);
      const els = after.parts[0].measures[0].elements;
      expect(els).toHaveLength(1); // rest fully consumed
      expect(els[0].duration.noteType).toBe('whole');
      expect(els[0].duration.divisions).toBe(4);
    });

    it('should partially consume adjacent rest when lengthening', () => {
      const sd = makeScoreWithRests();
      // half note (2 divs) → dotted half (3 divs): consumes 1 div from adjacent rest
      const cmd = createModifyDurationWithFillCommand(sd, 'n1', { noteType: 'half', dots: 1 });

      const after = cmd.execute(sd);
      const els = after.parts[0].measures[0].elements;
      expect(els).toHaveLength(2);
      expect(els[0].duration.divisions).toBe(3); // dotted half
      expect(els[1].type).toBe('rest');
      expect(els[1].duration.divisions).toBe(1); // quarter rest remainder
    });

    it('should undo lengthening by restoring consumed rests', () => {
      const sd = makeScoreWithRests();
      const cmd = createModifyDurationWithFillCommand(sd, 'n1', { noteType: 'whole' });

      const after = cmd.execute(sd);
      const restored = cmd.undo(after);
      expect(restored.parts[0].measures[0].elements).toHaveLength(2);
      expect(restored.parts[0].measures[0].elements[0].duration.noteType).toBe('half');
      expect(restored.parts[0].measures[0].elements[1].type).toBe('rest');
      expect(restored.parts[0].measures[0].elements[1].duration.noteType).toBe('half');
    });

    it('should reject lengthening when no adjacent rests available', () => {
      const sd = makeTestScoreData(); // two notes, no rests
      // quarter → half, but next element is a note
      const cmd = createModifyDurationWithFillCommand(sd, 'n1', { noteType: 'half' });

      const after = cmd.execute(sd);
      // Should be no-op
      expect(after.parts[0].measures[0].elements).toHaveLength(2);
      expect(after.parts[0].measures[0].elements[0].duration.noteType).toBe('quarter');
    });

    it('should shorten quarter to eighth and merge fill with adjacent rest (ppq=1)', () => {
      const sd: ScoreData = {
        parts: [{
          id: 'P1', name: 'Piano', staves: 1,
          measures: [{
            number: 1,
            attributes: {
              divisions: 1,
              timeSignature: { beats: 4, beatType: 4 },
            },
            elements: [
              {
                type: 'note', id: 'n1',
                pitch: { step: 'C', octave: 4 },
                duration: { divisions: 1, noteType: 'quarter', dots: 0 },
                voice: 1, staff: 1,
              } as NoteElement,
              {
                type: 'rest', id: 'r1',
                duration: { divisions: 3, noteType: 'half', dots: 1 },
                voice: 1, staff: 1,
              } as RestElement,
            ],
            directions: [],
          }],
        }],
      };

      const cmd = createModifyDurationWithFillCommand(sd, 'n1', { noteType: 'eighth' });
      const after = cmd.execute(sd);
      const els = after.parts[0].measures[0].elements;

      // quarter (1) → eighth (0.5): gap 0.5
      // fill rest (0.5) + original rest (3) merge → 3.5 divs
      expect(els[0].duration.noteType).toBe('eighth');
      expect(els[0].duration.divisions).toBe(0.5);
      expect(els[1].type).toBe('rest');

      // Total: 0.5 + rest = 4 ✓
      const total = els.reduce((sum, e) => sum + e.duration.divisions, 0);
      expect(total).toBe(4);
    });

    it('should handle the whole→dotted-half scenario correctly', () => {
      // The bug scenario: whole rest → half (fills) → dotted half (should consume)
      const sd: ScoreData = {
        parts: [{
          id: 'P1', name: 'Piano', staves: 1,
          measures: [{
            number: 1,
            attributes: {
              divisions: 1,
              timeSignature: { beats: 4, beatType: 4 },
            },
            elements: [
              {
                type: 'rest', id: 'r1',
                duration: { divisions: 4, noteType: 'whole', dots: 0 },
                voice: 1, staff: 1,
              } as RestElement,
            ],
            directions: [],
          }],
        }],
      };

      // Step 1: whole → half
      const cmd1 = createModifyDurationWithFillCommand(sd, 'r1', { noteType: 'half' });
      const step1 = cmd1.execute(sd);
      expect(step1.parts[0].measures[0].elements).toHaveLength(2);
      expect(step1.parts[0].measures[0].elements[0].duration.divisions).toBe(2);
      expect(step1.parts[0].measures[0].elements[1].duration.divisions).toBe(2);

      // Step 2: half (2 divs) → dotted half (3 divs): consumes 1 from adjacent rest
      const step1RestId = step1.parts[0].measures[0].elements[0].type === 'rest'
        ? (step1.parts[0].measures[0].elements[0] as RestElement).id
        : 'r1';
      const cmd2 = createModifyDurationWithFillCommand(step1, step1RestId, { dots: 1 });
      const step2 = cmd2.execute(step1);
      const els = step2.parts[0].measures[0].elements;

      // Total should be 4
      const total = els.reduce((sum, e) => sum + e.duration.divisions, 0);
      expect(total).toBe(4);
      // First element is dotted half (3 divs)
      expect(els[0].duration.divisions).toBe(3);
    });

    it('full scenario: quarter→8th→16th→32nd without corrupting adjacent rests', () => {
      // User scenario steps 1-4:
      // Start: [quarter rest]
      // → 8th: [8th rest] [8th fill]
      // → one 8th to 16th: [8th rest] [16th rest] [16th fill]
      //   (or [16th rest] [16th fill] [8th rest] depending on which was selected)
      // → one 16th to 32nd: the OTHER 16th must NOT change

      const sd: ScoreData = {
        parts: [{
          id: 'P1', name: 'Piano', staves: 1,
          measures: [{
            number: 1,
            attributes: { divisions: 1, timeSignature: { beats: 4, beatType: 4 } },
            elements: [
              {
                type: 'rest', id: 'r1',
                duration: { divisions: 1, noteType: 'quarter', dots: 0 },
                voice: 1, staff: 1,
              } as RestElement,
              {
                type: 'note', id: 'n1',
                pitch: { step: 'D', octave: 4 },
                duration: { divisions: 1, noteType: 'quarter', dots: 0 },
                voice: 1, staff: 1,
              } as NoteElement,
              {
                type: 'note', id: 'n2',
                pitch: { step: 'E', octave: 4 },
                duration: { divisions: 1, noteType: 'quarter', dots: 0 },
                voice: 1, staff: 1,
              } as NoteElement,
              {
                type: 'note', id: 'n3',
                pitch: { step: 'F', octave: 4 },
                duration: { divisions: 1, noteType: 'quarter', dots: 0 },
                voice: 1, staff: 1,
              } as NoteElement,
            ],
            directions: [],
          }],
        }],
      };

      // Step 2: quarter rest → 8th rest
      const cmd1 = createModifyDurationWithFillCommand(sd, 'r1', { noteType: 'eighth' });
      const s1 = cmd1.execute(sd);
      const e1 = s1.parts[0].measures[0].elements;
      expect(e1[0].duration.noteType).toBe('eighth'); // r1 = 8th
      expect(e1[1].type).toBe('rest'); // 8th fill
      expect(e1[1].duration.noteType).toBe('eighth');
      expect(e1.reduce((s, e) => s + e.duration.divisions, 0)).toBe(4);

      // Step 3: first 8th rest (r1) → 16th rest
      const cmd2 = createModifyDurationWithFillCommand(s1, 'r1', { noteType: '16th' });
      const s2 = cmd2.execute(s1);
      const e2 = s2.parts[0].measures[0].elements;
      expect(e2[0].duration.noteType).toBe('16th'); // r1 = 16th
      expect(e2[0].duration.divisions).toBeCloseTo(0.25);
      // fill (16th) + adjacent 8th fill merge → dotted 8th (0.75)
      expect(e2[1].type).toBe('rest');
      expect(e2[1].duration.divisions).toBeCloseTo(0.75); // merged: 0.25 + 0.5
      expect(e2.reduce((s, e) => s + e.duration.divisions, 0)).toBe(4);

      // Step 4: change r1 (16th) → 32nd
      const cmd3 = createModifyDurationWithFillCommand(s2, 'r1', { noteType: '32nd' });
      const s3 = cmd3.execute(s2);
      const e3 = s3.parts[0].measures[0].elements;

      // r1 must be 32nd
      expect(e3[0].duration.noteType).toBe('32nd');
      expect(e3[0].duration.divisions).toBeCloseTo(0.125);

      // The rest after r1: 32nd fill (0.125) + dotted 8th (0.75) merged = 0.875
      // = double-dotted eighth (1 rest, not two 32nds!)
      expect(e3[1].type).toBe('rest');
      expect(e3[1].duration.divisions).toBeCloseTo(0.875);
      expect(e3[1].duration.noteType).toBe('eighth');
      expect(e3[1].duration.dots).toBe(2);

      // Should be 2 rests + 3 notes = 5 elements (not 3 rests + 3 notes)
      expect(e3.filter(e => e.type === 'rest')).toHaveLength(2);

      // Total preserved
      expect(e3.reduce((s, e) => s + e.duration.divisions, 0)).toBe(4);
    });
  });

  // ─── Multi-part operations ───

  describe('multi-part score operations', () => {
    function makeMultiPartScore(): ScoreData {
      return {
        parts: [
          {
            id: 'P1', name: 'Violin', staves: 1,
            measures: [{
              number: 1,
              attributes: { divisions: 1 },
              elements: [
                { type: 'note', id: 'v1', pitch: { step: 'A', octave: 4 }, duration: { divisions: 1, noteType: 'quarter', dots: 0 }, voice: 1, staff: 1 } as NoteElement,
              ],
              directions: [],
            }],
          },
          {
            id: 'P2', name: 'Cello', staves: 1,
            measures: [{
              number: 1,
              attributes: { divisions: 1 },
              elements: [
                { type: 'note', id: 'c1', pitch: { step: 'C', octave: 3 }, duration: { divisions: 1, noteType: 'quarter', dots: 0 }, voice: 1, staff: 1 } as NoteElement,
              ],
              directions: [],
            }],
          },
        ],
      };
    }

    it('should delete note from second part without affecting first', () => {
      const sd = makeMultiPartScore();
      const cmd = createDeleteNoteCommand(sd, 'c1');
      const after = cmd.execute(sd);

      expect(after.parts[0].measures[0].elements).toHaveLength(1); // violin untouched
      expect(after.parts[1].measures[0].elements).toHaveLength(0); // cello note deleted
    });

    it('should modify note in first part without affecting second', () => {
      const sd = makeMultiPartScore();
      const cmd = createModifyPitchCommand(sd, 'v1', { step: 'B' });
      const after = cmd.execute(sd);

      expect((after.parts[0].measures[0].elements[0] as NoteElement).pitch.step).toBe('B');
      expect((after.parts[1].measures[0].elements[0] as NoteElement).pitch.step).toBe('C'); // unchanged
    });

    it('should add note to second part', () => {
      const sd = makeMultiPartScore();
      const note = makeNote('c2', 'D', 3);
      const cmd = createAddNoteCommand(1, 0, note);
      const after = cmd.execute(sd);

      expect(after.parts[1].measures[0].elements).toHaveLength(2);
      expect(after.parts[0].measures[0].elements).toHaveLength(1); // unchanged
    });
  });

  // ─── Add to empty measure ───

  describe('add note to empty measure', () => {
    it('should add note to measure with no elements', () => {
      const sd: ScoreData = {
        parts: [{
          id: 'P1', name: 'Piano', staves: 1,
          measures: [{ number: 1, attributes: { divisions: 1 }, elements: [], directions: [] }],
        }],
      };
      const note = makeNote('n1', 'C', 4);
      const cmd = createAddNoteCommand(0, 0, note);
      const after = cmd.execute(sd);
      expect(after.parts[0].measures[0].elements).toHaveLength(1);

      const restored = cmd.undo(after);
      expect(restored.parts[0].measures[0].elements).toHaveLength(0);
    });
  });

  // ─── Immutability verification ───

  describe('immutability', () => {
    it('should not mutate original scoreData on addNote', () => {
      const sd = makeTestScoreData();
      const origLen = sd.parts[0].measures[0].elements.length;
      const note = makeNote('n3', 'E', 4);
      const cmd = createAddNoteCommand(0, 0, note);
      cmd.execute(sd);
      expect(sd.parts[0].measures[0].elements.length).toBe(origLen);
    });

    it('should not mutate original scoreData on deleteNote', () => {
      const sd = makeTestScoreData();
      const origLen = sd.parts[0].measures[0].elements.length;
      const cmd = createDeleteNoteCommand(sd, 'n1');
      cmd.execute(sd);
      expect(sd.parts[0].measures[0].elements.length).toBe(origLen);
    });

    it('should not mutate original scoreData on modifyPitch', () => {
      const sd = makeTestScoreData();
      const origStep = (sd.parts[0].measures[0].elements[0] as NoteElement).pitch.step;
      const cmd = createModifyPitchCommand(sd, 'n1', { step: 'G' });
      cmd.execute(sd);
      expect((sd.parts[0].measures[0].elements[0] as NoteElement).pitch.step).toBe(origStep);
    });

    it('should not mutate original scoreData on modifyDuration', () => {
      const sd = makeTestScoreData();
      const origType = (sd.parts[0].measures[0].elements[0] as NoteElement).duration.noteType;
      const cmd = createModifyDurationCommand(sd, 'n1', { noteType: 'whole' });
      cmd.execute(sd);
      expect((sd.parts[0].measures[0].elements[0] as NoteElement).duration.noteType).toBe(origType);
    });
  });

  // ─── Error handling ───

  describe('error handling', () => {
    it('should throw when modifying non-existent note', () => {
      const sd = makeTestScoreData();
      expect(() => createModifyNoteCommand(sd, 'nonexistent', { voice: 2 })).toThrow('Element not found');
    });

    it('should throw when modifying pitch on non-existent note', () => {
      const sd = makeTestScoreData();
      expect(() => createModifyPitchCommand(sd, 'nonexistent', { step: 'G' })).toThrow('Element not found');
    });

    it('should throw when modifying duration on non-existent note', () => {
      const sd = makeTestScoreData();
      expect(() => createModifyDurationCommand(sd, 'nonexistent', { noteType: 'half' })).toThrow('Element not found');
    });

    it('should throw when deleting rest with non-existent ID', () => {
      const sd = makeTestScoreData();
      expect(() => createDeleteRestCommand(sd, 'nonexistent')).toThrow('Element not found');
    });

    it('should throw when deleteNoteWithRest on non-existent ID', () => {
      const sd = makeTestScoreData();
      expect(() => createDeleteNoteWithRestCommand(sd, 'nonexistent')).toThrow('Element not found');
    });

    it('should throw when convertRestToNote on non-existent ID', () => {
      const sd = makeTestScoreData();
      expect(() => createConvertRestToNoteCommand(sd, 'nonexistent', { step: 'C', octave: 4 })).toThrow('Element not found');
    });

    it('should throw when modifyDurationWithFill on non-existent ID', () => {
      const sd = makeTestScoreData();
      expect(() => createModifyDurationWithFillCommand(sd, 'nonexistent', { noteType: 'half' })).toThrow('Element not found');
    });
  });

  describe('createConvertRestToNoteCommand', () => {
    it('should convert a rest to a note with given pitch', () => {
      const sd: ScoreData = {
        parts: [{
          id: 'P1', name: 'Piano', staves: 1,
          measures: [{
            number: 1,
            elements: [
              {
                type: 'rest', id: 'r1',
                duration: { divisions: 1, noteType: 'quarter', dots: 0 },
                voice: 1, staff: 1,
              } as RestElement,
            ],
            directions: [],
          }],
        }],
      };

      const cmd = createConvertRestToNoteCommand(sd, 'r1', { step: 'E', octave: 4 });
      const after = cmd.execute(sd);
      const el = after.parts[0].measures[0].elements[0] as NoteElement;
      expect(el.type).toBe('note');
      expect(el.pitch.step).toBe('E');
      expect(el.pitch.octave).toBe(4);
      expect(el.duration.noteType).toBe('quarter');
    });

    it('should undo by restoring the rest', () => {
      const sd: ScoreData = {
        parts: [{
          id: 'P1', name: 'Piano', staves: 1,
          measures: [{
            number: 1,
            elements: [
              {
                type: 'rest', id: 'r1',
                duration: { divisions: 1, noteType: 'quarter', dots: 0 },
                voice: 1, staff: 1,
              } as RestElement,
            ],
            directions: [],
          }],
        }],
      };

      const cmd = createConvertRestToNoteCommand(sd, 'r1', { step: 'E', octave: 4 });
      const after = cmd.execute(sd);
      const restored = cmd.undo(after);
      expect(restored.parts[0].measures[0].elements[0].type).toBe('rest');
    });
  });
});
