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
});
