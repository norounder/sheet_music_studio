import { describe, it, expect } from 'vitest';
import type { ScoreData, NoteElement } from '../../types';
import {
  createToggleArticulationCommand,
  createAddTieCommand,
  createDeleteTieCommand,
  createAddSlurCommand,
  createDeleteSlurCommand,
  createAddLyricCommand,
  createModifyLyricCommand,
  createDeleteLyricCommand,
} from './expressionCommands';

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
                articulations: ['staccato'],
                tie: { type: 'start' },
                slur: [{ number: 1, type: 'start' }],
                lyrics: [{ number: 1, syllabic: 'single', text: 'hello' }],
              } as NoteElement,
            ],
            directions: [],
          },
        ],
      },
    ],
  };
}

describe('expressionCommands', () => {
  describe('createToggleArticulationCommand', () => {
    it('should add articulation when not present', () => {
      const sd = makeTestScoreData();
      const cmd = createToggleArticulationCommand(sd, 'n1', 'staccato');

      expect(cmd.type).toBe('toggleArticulation');

      const after = cmd.execute(sd);
      const note = after.parts[0].measures[0].elements[0] as NoteElement;
      expect(note.articulations).toContain('staccato');

      const restored = cmd.undo(after);
      const noteR = restored.parts[0].measures[0].elements[0] as NoteElement;
      expect(noteR.articulations).toBeUndefined();
    });

    it('should remove articulation when present', () => {
      const sd = makeTestScoreData();
      const cmd = createToggleArticulationCommand(sd, 'n2', 'staccato');

      const after = cmd.execute(sd);
      const note = after.parts[0].measures[0].elements[1] as NoteElement;
      expect(note.articulations).toBeUndefined();

      const restored = cmd.undo(after);
      const noteR = restored.parts[0].measures[0].elements[1] as NoteElement;
      expect(noteR.articulations).toContain('staccato');
    });
  });

  describe('createAddTieCommand', () => {
    it('should add a tie and undo', () => {
      const sd = makeTestScoreData();
      const cmd = createAddTieCommand(sd, 'n1', { type: 'start' });

      const after = cmd.execute(sd);
      expect((after.parts[0].measures[0].elements[0] as NoteElement).tie?.type).toBe('start');

      const restored = cmd.undo(after);
      expect((restored.parts[0].measures[0].elements[0] as NoteElement).tie).toBeUndefined();
    });
  });

  describe('createDeleteTieCommand', () => {
    it('should delete a tie and undo', () => {
      const sd = makeTestScoreData();
      const cmd = createDeleteTieCommand(sd, 'n2');

      const after = cmd.execute(sd);
      expect((after.parts[0].measures[0].elements[1] as NoteElement).tie).toBeUndefined();

      const restored = cmd.undo(after);
      expect((restored.parts[0].measures[0].elements[1] as NoteElement).tie?.type).toBe('start');
    });
  });

  describe('createAddSlurCommand', () => {
    it('should add a slur and undo', () => {
      const sd = makeTestScoreData();
      const cmd = createAddSlurCommand(sd, 'n1', { number: 1, type: 'start' });

      const after = cmd.execute(sd);
      const note = after.parts[0].measures[0].elements[0] as NoteElement;
      expect(note.slur).toHaveLength(1);
      expect(note.slur![0].type).toBe('start');

      const restored = cmd.undo(after);
      expect((restored.parts[0].measures[0].elements[0] as NoteElement).slur).toBeUndefined();
    });
  });

  describe('createDeleteSlurCommand', () => {
    it('should delete a slur by number and undo', () => {
      const sd = makeTestScoreData();
      const cmd = createDeleteSlurCommand(sd, 'n2', 1);

      const after = cmd.execute(sd);
      expect((after.parts[0].measures[0].elements[1] as NoteElement).slur).toBeUndefined();

      const restored = cmd.undo(after);
      const note = restored.parts[0].measures[0].elements[1] as NoteElement;
      expect(note.slur).toHaveLength(1);
      expect(note.slur![0].number).toBe(1);
    });
  });

  describe('createAddLyricCommand', () => {
    it('should add a lyric and undo', () => {
      const sd = makeTestScoreData();
      const cmd = createAddLyricCommand(sd, 'n1', {
        number: 1,
        syllabic: 'single',
        text: 'world',
      });

      const after = cmd.execute(sd);
      const note = after.parts[0].measures[0].elements[0] as NoteElement;
      expect(note.lyrics).toHaveLength(1);
      expect(note.lyrics![0].text).toBe('world');

      const restored = cmd.undo(after);
      expect((restored.parts[0].measures[0].elements[0] as NoteElement).lyrics).toBeUndefined();
    });
  });

  describe('createModifyLyricCommand', () => {
    it('should modify lyric text and undo', () => {
      const sd = makeTestScoreData();
      const cmd = createModifyLyricCommand(sd, 'n2', 1, 'world');

      const after = cmd.execute(sd);
      const note = after.parts[0].measures[0].elements[1] as NoteElement;
      expect(note.lyrics![0].text).toBe('world');

      const restored = cmd.undo(after);
      const noteR = restored.parts[0].measures[0].elements[1] as NoteElement;
      expect(noteR.lyrics![0].text).toBe('hello');
    });
  });

  describe('createDeleteLyricCommand', () => {
    it('should delete a lyric by number and undo', () => {
      const sd = makeTestScoreData();
      const cmd = createDeleteLyricCommand(sd, 'n2', 1);

      const after = cmd.execute(sd);
      expect((after.parts[0].measures[0].elements[1] as NoteElement).lyrics).toBeUndefined();

      const restored = cmd.undo(after);
      const note = restored.parts[0].measures[0].elements[1] as NoteElement;
      expect(note.lyrics).toHaveLength(1);
      expect(note.lyrics![0].text).toBe('hello');
    });
  });

  // ─── Edge cases ───

  describe('error handling: non-existent element', () => {
    it('should throw when toggling articulation on non-existent ID', () => {
      const sd = makeTestScoreData();
      expect(() => createToggleArticulationCommand(sd, 'nonexistent', 'staccato')).toThrow('Element not found');
    });

    it('should throw when adding tie on non-existent ID', () => {
      const sd = makeTestScoreData();
      expect(() => createAddTieCommand(sd, 'nonexistent', { type: 'start' })).toThrow('Element not found');
    });

    it('should throw when deleting tie on non-existent ID', () => {
      const sd = makeTestScoreData();
      expect(() => createDeleteTieCommand(sd, 'nonexistent')).toThrow('Element not found');
    });

    it('should throw when adding slur on non-existent ID', () => {
      const sd = makeTestScoreData();
      expect(() => createAddSlurCommand(sd, 'nonexistent', { number: 1, type: 'start' })).toThrow('Element not found');
    });

    it('should throw when deleting slur on non-existent ID', () => {
      const sd = makeTestScoreData();
      expect(() => createDeleteSlurCommand(sd, 'nonexistent', 1)).toThrow('Element not found');
    });

    it('should throw when adding lyric on non-existent ID', () => {
      const sd = makeTestScoreData();
      expect(() => createAddLyricCommand(sd, 'nonexistent', { number: 1, syllabic: 'single', text: 'x' })).toThrow('Element not found');
    });

    it('should throw when modifying lyric on non-existent ID', () => {
      const sd = makeTestScoreData();
      expect(() => createModifyLyricCommand(sd, 'nonexistent', 1, 'x')).toThrow('Element not found');
    });

    it('should throw when deleting lyric on non-existent ID', () => {
      const sd = makeTestScoreData();
      expect(() => createDeleteLyricCommand(sd, 'nonexistent', 1)).toThrow('Element not found');
    });
  });

  describe('multiple articulations on same note', () => {
    it('should add multiple different articulations', () => {
      const sd = makeTestScoreData();
      const cmd1 = createToggleArticulationCommand(sd, 'n1', 'staccato');
      const s1 = cmd1.execute(sd);

      const cmd2 = createToggleArticulationCommand(s1, 'n1', 'accent');
      const s2 = cmd2.execute(s1);

      const note = s2.parts[0].measures[0].elements[0] as NoteElement;
      expect(note.articulations).toContain('staccato');
      expect(note.articulations).toContain('accent');
      expect(note.articulations).toHaveLength(2);
    });

    it('should undo only the last articulation added', () => {
      const sd = makeTestScoreData();
      const cmd1 = createToggleArticulationCommand(sd, 'n1', 'staccato');
      const s1 = cmd1.execute(sd);

      const cmd2 = createToggleArticulationCommand(s1, 'n1', 'accent');
      const s2 = cmd2.execute(s1);

      const s3 = cmd2.undo(s2);
      const note = s3.parts[0].measures[0].elements[0] as NoteElement;
      expect(note.articulations).toContain('staccato');
      expect(note.articulations).not.toContain('accent');
    });
  });

  describe('multiple slurs on same note', () => {
    it('should accumulate multiple slurs with different numbers', () => {
      const sd = makeTestScoreData();
      // n2 already has slur 1
      const cmd = createAddSlurCommand(sd, 'n2', { number: 2, type: 'stop' });
      const after = cmd.execute(sd);

      const note = after.parts[0].measures[0].elements[1] as NoteElement;
      expect(note.slur).toHaveLength(2);
      expect(note.slur![0].number).toBe(1);
      expect(note.slur![1].number).toBe(2);
    });

    it('should delete only specified slur number', () => {
      const sd = makeTestScoreData();
      // Add slur 2 first
      const cmdAdd = createAddSlurCommand(sd, 'n2', { number: 2, type: 'stop' });
      const withTwo = cmdAdd.execute(sd);

      // Delete slur 1, keep slur 2
      const cmdDel = createDeleteSlurCommand(withTwo, 'n2', 1);
      const after = cmdDel.execute(withTwo);

      const note = after.parts[0].measures[0].elements[1] as NoteElement;
      expect(note.slur).toHaveLength(1);
      expect(note.slur![0].number).toBe(2);
    });
  });

  describe('multiple lyrics on same note', () => {
    it('should accumulate lyrics with different numbers (verse 1 + verse 2)', () => {
      const sd = makeTestScoreData();
      // n2 already has lyric number 1
      const cmd = createAddLyricCommand(sd, 'n2', { number: 2, syllabic: 'single', text: 'world' });
      const after = cmd.execute(sd);

      const note = after.parts[0].measures[0].elements[1] as NoteElement;
      expect(note.lyrics).toHaveLength(2);
      expect(note.lyrics![0].text).toBe('hello');
      expect(note.lyrics![1].text).toBe('world');
    });

    it('should delete only specified lyric number', () => {
      const sd = makeTestScoreData();
      const cmdAdd = createAddLyricCommand(sd, 'n2', { number: 2, syllabic: 'single', text: 'world' });
      const withTwo = cmdAdd.execute(sd);

      const cmdDel = createDeleteLyricCommand(withTwo, 'n2', 1);
      const after = cmdDel.execute(withTwo);

      const note = after.parts[0].measures[0].elements[1] as NoteElement;
      expect(note.lyrics).toHaveLength(1);
      expect(note.lyrics![0].number).toBe(2);
      expect(note.lyrics![0].text).toBe('world');
    });
  });

  describe('immutability', () => {
    it('should not mutate original scoreData when toggling articulation', () => {
      const sd = makeTestScoreData();
      const original = (sd.parts[0].measures[0].elements[0] as NoteElement).articulations;
      const cmd = createToggleArticulationCommand(sd, 'n1', 'staccato');
      cmd.execute(sd);
      expect((sd.parts[0].measures[0].elements[0] as NoteElement).articulations).toBe(original);
    });

    it('should not mutate original scoreData when adding slur', () => {
      const sd = makeTestScoreData();
      const originalSlurs = (sd.parts[0].measures[0].elements[1] as NoteElement).slur;
      const cmd = createAddSlurCommand(sd, 'n2', { number: 2, type: 'stop' });
      cmd.execute(sd);
      expect((sd.parts[0].measures[0].elements[1] as NoteElement).slur).toBe(originalSlurs);
    });
  });

  describe('overwrite semantics', () => {
    it('addTie should overwrite existing tie', () => {
      const sd = makeTestScoreData();
      // n2 already has tie: start
      const cmd = createAddTieCommand(sd, 'n2', { type: 'stop' });
      const after = cmd.execute(sd);
      expect((after.parts[0].measures[0].elements[1] as NoteElement).tie?.type).toBe('stop');
    });

    it('deleteTie on note without tie should produce no tie', () => {
      const sd = makeTestScoreData();
      // n1 has no tie
      const cmd = createDeleteTieCommand(sd, 'n1');
      const after = cmd.execute(sd);
      expect((after.parts[0].measures[0].elements[0] as NoteElement).tie).toBeUndefined();
    });
  });
});
