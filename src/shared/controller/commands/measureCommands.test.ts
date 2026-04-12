import { describe, it, expect } from 'vitest';
import type { ScoreData, NoteElement } from '../../types';
import {
  createAddMeasureCommand,
  createDeleteMeasureCommand,
  createCopyPasteMeasureCommand,
  createChangeKeySignatureCommand,
  createChangeTimeSignatureCommand,
  createChangeClefCommand,
} from './measureCommands';

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
            attributes: {
              divisions: 1,
              keySignature: { fifths: 0, mode: 'major' as const },
              timeSignature: { beats: 4, beatType: 4 },
              clef: [{ sign: 'G' as const, line: 2, staffNumber: 1 }],
            },
            elements: [
              {
                type: 'note',
                id: 'n1',
                pitch: { step: 'C', octave: 4 },
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

describe('measureCommands', () => {
  describe('createAddMeasureCommand', () => {
    it('should add a measure and renumber', () => {
      const sd = makeTestScoreData();
      const cmd = createAddMeasureCommand(0, 0);

      const after = cmd.execute(sd);
      expect(after.parts[0].measures).toHaveLength(3);
      expect(after.parts[0].measures.map((m) => m.number)).toEqual([1, 2, 3]);
      // New measure is at index 1
      expect(after.parts[0].measures[1].elements).toHaveLength(0);
    });

    it('should undo by removing the added measure', () => {
      const sd = makeTestScoreData();
      const cmd = createAddMeasureCommand(0, 0);

      const after = cmd.execute(sd);
      const restored = cmd.undo(after);
      expect(restored.parts[0].measures).toHaveLength(2);
      expect(restored.parts[0].measures.map((m) => m.number)).toEqual([1, 2]);
    });

    it('should add at the end', () => {
      const sd = makeTestScoreData();
      const cmd = createAddMeasureCommand(0, 1);

      const after = cmd.execute(sd);
      expect(after.parts[0].measures).toHaveLength(3);
      expect(after.parts[0].measures[2].elements).toHaveLength(0);
    });
  });

  describe('createDeleteMeasureCommand', () => {
    it('should delete a measure and renumber', () => {
      const sd = makeTestScoreData();
      const cmd = createDeleteMeasureCommand(sd, 0, 0);

      const after = cmd.execute(sd);
      expect(after.parts[0].measures).toHaveLength(1);
      expect(after.parts[0].measures[0].number).toBe(1);
      expect((after.parts[0].measures[0].elements[0] as NoteElement).id).toBe('n2');
    });

    it('should undo by restoring the measure at the same index', () => {
      const sd = makeTestScoreData();
      const cmd = createDeleteMeasureCommand(sd, 0, 0);

      const after = cmd.execute(sd);
      const restored = cmd.undo(after);
      expect(restored.parts[0].measures).toHaveLength(2);
      expect(restored.parts[0].measures.map((m) => m.number)).toEqual([1, 2]);
      expect((restored.parts[0].measures[0].elements[0] as NoteElement).id).toBe('n1');
    });
  });

  describe('createCopyPasteMeasureCommand', () => {
    it('should copy a measure with new element IDs', () => {
      const sd = makeTestScoreData();
      const cmd = createCopyPasteMeasureCommand(sd, 0, 0, 0, 2);

      const after = cmd.execute(sd);
      expect(after.parts[0].measures).toHaveLength(3);
      // Pasted measure has different element IDs
      const pastedEl = after.parts[0].measures[2].elements[0] as NoteElement;
      expect(pastedEl.pitch.step).toBe('C');
      expect(pastedEl.id).not.toBe('n1');
    });

    it('should undo the paste', () => {
      const sd = makeTestScoreData();
      const cmd = createCopyPasteMeasureCommand(sd, 0, 0, 0, 2);

      const after = cmd.execute(sd);
      const restored = cmd.undo(after);
      expect(restored.parts[0].measures).toHaveLength(2);
    });
  });

  describe('createChangeKeySignatureCommand', () => {
    it('should change key signature and undo', () => {
      const sd = makeTestScoreData();
      const cmd = createChangeKeySignatureCommand(sd, 0, 0, {
        fifths: 2,
        mode: 'major',
      });

      expect(cmd.type).toBe('changeKeySignature');

      const after = cmd.execute(sd);
      expect(after.parts[0].measures[0].attributes?.keySignature?.fifths).toBe(2);

      const restored = cmd.undo(after);
      expect(restored.parts[0].measures[0].attributes?.keySignature?.fifths).toBe(0);
    });
  });

  describe('createChangeTimeSignatureCommand', () => {
    it('should change time signature and undo', () => {
      const sd = makeTestScoreData();
      const cmd = createChangeTimeSignatureCommand(sd, 0, 0, {
        beats: 3,
        beatType: 4,
      });

      const after = cmd.execute(sd);
      expect(after.parts[0].measures[0].attributes?.timeSignature?.beats).toBe(3);

      const restored = cmd.undo(after);
      expect(restored.parts[0].measures[0].attributes?.timeSignature?.beats).toBe(4);
    });
  });

  describe('createChangeClefCommand', () => {
    it('should change clef and undo', () => {
      const sd = makeTestScoreData();
      const cmd = createChangeClefCommand(sd, 0, 0, {
        sign: 'F',
        line: 4,
        staffNumber: 1,
      });

      const after = cmd.execute(sd);
      const clefs = after.parts[0].measures[0].attributes?.clef;
      expect(clefs).toHaveLength(1);
      expect(clefs![0].sign).toBe('F');

      const restored = cmd.undo(after);
      expect(restored.parts[0].measures[0].attributes?.clef![0].sign).toBe('G');
    });

    it('should add a clef for a new staff number', () => {
      const sd = makeTestScoreData();
      const cmd = createChangeClefCommand(sd, 0, 0, {
        sign: 'F',
        line: 4,
        staffNumber: 2,
      });

      const after = cmd.execute(sd);
      expect(after.parts[0].measures[0].attributes?.clef).toHaveLength(2);
    });
  });
});
