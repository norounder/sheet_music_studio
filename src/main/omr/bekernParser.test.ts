/**
 * Unit tests for bekernParser.
 * Tests Humdrum **kern notation → ScoreData conversion.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { parseBekern, resetIdCounter } from './bekernParser';

beforeEach(() => {
  resetIdCounter();
});

describe('bekernParser', () => {
  describe('basic note parsing', () => {
    test('parses a single quarter note C4', () => {
      const input = `**kern
4c
=
*-`;
      const result = parseBekern(input);
      expect(result.parts).toHaveLength(1);
      expect(result.parts[0].measures).toHaveLength(1);

      const notes = result.parts[0].measures[0].elements;
      expect(notes).toHaveLength(1);
      expect(notes[0].type).toBe('note');
      if (notes[0].type === 'note') {
        expect(notes[0].pitch.step).toBe('C');
        expect(notes[0].pitch.octave).toBe(4);
        expect(notes[0].duration.noteType).toBe('quarter');
        expect(notes[0].duration.dots).toBe(0);
      }
    });

    test('parses octave from letter repetition (cc = C5, CC = C2)', () => {
      const input = `**kern
4cc
4CC
=
*-`;
      const result = parseBekern(input);
      const notes = result.parts[0].measures[0].elements;

      expect(notes).toHaveLength(2);
      if (notes[0].type === 'note') {
        expect(notes[0].pitch.step).toBe('C');
        expect(notes[0].pitch.octave).toBe(5); // cc = octave 5
      }
      if (notes[1].type === 'note') {
        expect(notes[1].pitch.step).toBe('C');
        expect(notes[1].pitch.octave).toBe(2); // CC = octave 2
      }
    });

    test('parses all pitch steps A-G', () => {
      const input = `**kern
4c
4d
4e
4f
4g
4a
4b
=
*-`;
      const result = parseBekern(input);
      const notes = result.parts[0].measures[0].elements;

      const steps = notes
        .filter((n) => n.type === 'note')
        .map((n) => (n as any).pitch.step);
      expect(steps).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
    });

    test('parses uppercase pitch as octave 3', () => {
      const input = `**kern
4C
4D
4G
=
*-`;
      const result = parseBekern(input);
      const notes = result.parts[0].measures[0].elements;

      for (const note of notes) {
        if (note.type === 'note') {
          expect(note.pitch.octave).toBe(3);
        }
      }
    });
  });

  describe('duration parsing', () => {
    test('parses whole, half, quarter, eighth, 16th notes', () => {
      const input = `**kern
1c
2c
4c
8c
16c
=
*-`;
      const result = parseBekern(input);
      const notes = result.parts[0].measures[0].elements;

      const types = notes
        .filter((n) => n.type === 'note')
        .map((n) => (n as any).duration.noteType);
      expect(types).toEqual(['whole', 'half', 'quarter', 'eighth', '16th']);
    });

    test('parses dotted notes', () => {
      const input = `**kern
4.c
8..d
=
*-`;
      const result = parseBekern(input);
      const notes = result.parts[0].measures[0].elements;

      if (notes[0].type === 'note') {
        expect(notes[0].duration.dots).toBe(1);
      }
      if (notes[1].type === 'note') {
        expect(notes[1].duration.dots).toBe(2);
      }
    });

    test('calculates correct divisions for quarter note base=4', () => {
      const input = `**kern
1c
2c
4c
8c
=
*-`;
      const result = parseBekern(input);
      const notes = result.parts[0].measures[0].elements;

      // Base divisions = 4 per quarter note
      const divs = notes
        .filter((n) => n.type === 'note')
        .map((n) => (n as any).duration.divisions);
      expect(divs).toEqual([16, 8, 4, 2]); // whole=16, half=8, quarter=4, eighth=2
    });

    test('calculates dotted note divisions correctly', () => {
      const input = `**kern
4.c
=
*-`;
      const result = parseBekern(input);
      const note = result.parts[0].measures[0].elements[0];
      if (note.type === 'note') {
        // Dotted quarter = 4 + 2 = 6 divisions
        expect(note.duration.divisions).toBe(6);
      }
    });
  });

  describe('accidental parsing', () => {
    test('parses sharp (#)', () => {
      const input = `**kern
4c#
=
*-`;
      const result = parseBekern(input);
      const note = result.parts[0].measures[0].elements[0];
      if (note.type === 'note') {
        expect(note.pitch.alter).toBe(1);
      }
    });

    test('parses flat (-)', () => {
      const input = `**kern
4e-
=
*-`;
      const result = parseBekern(input);
      const note = result.parts[0].measures[0].elements[0];
      if (note.type === 'note') {
        expect(note.pitch.alter).toBe(-1);
      }
    });

    test('parses double sharp (##)', () => {
      const input = `**kern
4f##
=
*-`;
      const result = parseBekern(input);
      const note = result.parts[0].measures[0].elements[0];
      if (note.type === 'note') {
        expect(note.pitch.alter).toBe(2);
      }
    });

    test('parses double flat (--)', () => {
      const input = `**kern
4b--
=
*-`;
      const result = parseBekern(input);
      const note = result.parts[0].measures[0].elements[0];
      if (note.type === 'note') {
        expect(note.pitch.alter).toBe(-2);
      }
    });

    test('parses natural (no accidental) as undefined alter', () => {
      const input = `**kern
4c
=
*-`;
      const result = parseBekern(input);
      const note = result.parts[0].measures[0].elements[0];
      if (note.type === 'note') {
        expect(note.pitch.alter).toBeUndefined();
      }
    });
  });

  describe('rest parsing', () => {
    test('parses rests with duration', () => {
      const input = `**kern
4r
2r
=
*-`;
      const result = parseBekern(input);
      const elements = result.parts[0].measures[0].elements;

      expect(elements[0].type).toBe('rest');
      expect(elements[1].type).toBe('rest');
      if (elements[0].type === 'rest') {
        expect(elements[0].duration.noteType).toBe('quarter');
      }
      if (elements[1].type === 'rest') {
        expect(elements[1].duration.noteType).toBe('half');
      }
    });
  });

  describe('interpretation tokens', () => {
    test('parses clef interpretation (*clefG2)', () => {
      const input = `**kern
*clefG2
4c
=
*-`;
      const result = parseBekern(input);
      const attrs = result.parts[0].measures[0].attributes;
      expect(attrs).toBeDefined();
      expect(attrs!.clef).toBeDefined();
      expect(attrs!.clef![0].sign).toBe('G');
      expect(attrs!.clef![0].line).toBe(2);
    });

    test('parses bass clef (*clefF4)', () => {
      const input = `**kern
*clefF4
4C
=
*-`;
      const result = parseBekern(input);
      const attrs = result.parts[0].measures[0].attributes;
      expect(attrs!.clef![0].sign).toBe('F');
      expect(attrs!.clef![0].line).toBe(4);
    });

    test('parses key signature (*k[f#c#])', () => {
      const input = `**kern
*k[f#c#]
4c
=
*-`;
      const result = parseBekern(input);
      const attrs = result.parts[0].measures[0].attributes;
      expect(attrs!.keySignature).toBeDefined();
      expect(attrs!.keySignature!.fifths).toBe(2); // 2 sharps = D major
    });

    test('parses flat key signature (*k[b-e-a-])', () => {
      const input = `**kern
*k[b-e-a-]
4c
=
*-`;
      const result = parseBekern(input);
      const attrs = result.parts[0].measures[0].attributes;
      expect(attrs!.keySignature!.fifths).toBe(-3); // 3 flats = Eb major
    });

    test('parses time signature (*M4/4)', () => {
      const input = `**kern
*M4/4
4c
=
*-`;
      const result = parseBekern(input);
      const attrs = result.parts[0].measures[0].attributes;
      expect(attrs!.timeSignature).toBeDefined();
      expect(attrs!.timeSignature!.beats).toBe(4);
      expect(attrs!.timeSignature!.beatType).toBe(4);
    });

    test('parses 3/4 time signature', () => {
      const input = `**kern
*M3/4
4c
=
*-`;
      const result = parseBekern(input);
      const attrs = result.parts[0].measures[0].attributes;
      expect(attrs!.timeSignature!.beats).toBe(3);
      expect(attrs!.timeSignature!.beatType).toBe(4);
    });
  });

  describe('chord parsing', () => {
    test('parses space-separated chord notes', () => {
      const input = `**kern
4c 4e 4g
=
*-`;
      const result = parseBekern(input);
      const elements = result.parts[0].measures[0].elements;

      expect(elements).toHaveLength(3);
      expect(elements[0].type).toBe('note');
      expect(elements[1].type).toBe('note');
      expect(elements[2].type).toBe('note');

      // First note is not a chord, subsequent ones are
      if (elements[0].type === 'note') expect(elements[0].chord).toBeUndefined();
      if (elements[1].type === 'note') expect(elements[1].chord).toBe(true);
      if (elements[2].type === 'note') expect(elements[2].chord).toBe(true);
    });
  });

  describe('measure structure', () => {
    test('splits measures at barlines (=)', () => {
      const input = `**kern
4c
4d
=
4e
4f
=
*-`;
      const result = parseBekern(input);
      expect(result.parts[0].measures).toHaveLength(2);
      expect(result.parts[0].measures[0].elements).toHaveLength(2);
      expect(result.parts[0].measures[1].elements).toHaveLength(2);
    });

    test('assigns sequential measure numbers', () => {
      const input = `**kern
4c
=
4d
=
4e
=
*-`;
      const result = parseBekern(input);
      expect(result.parts[0].measures[0].number).toBe(1);
      expect(result.parts[0].measures[1].number).toBe(2);
      expect(result.parts[0].measures[2].number).toBe(3);
    });

    test('flushes remaining elements as last measure', () => {
      const input = `**kern
4c
=
4d
4e`;
      const result = parseBekern(input);
      // First measure from barline, second from flush
      expect(result.parts[0].measures).toHaveLength(2);
      expect(result.parts[0].measures[1].elements).toHaveLength(2);
    });
  });

  describe('multi-spine (grand staff)', () => {
    test('parses two spines as grand staff piano part', () => {
      const input = `**kern\t**kern
4c\t4C
=\t=
*-\t*-`;
      const result = parseBekern(input);

      expect(result.parts).toHaveLength(1);
      expect(result.parts[0].name).toBe('Piano');
      expect(result.parts[0].staves).toBe(2);
    });

    test('merges elements from both spines into one measure', () => {
      const input = `**kern\t**kern
4c\t4C
4d\t4D
=\t=
*-\t*-`;
      const result = parseBekern(input);

      const measure = result.parts[0].measures[0];
      // 4 notes total (2 from each spine)
      expect(measure.elements).toHaveLength(4);
    });

    test('assigns different staff numbers to different spines', () => {
      const input = `**kern\t**kern
4c\t4C
=\t=
*-\t*-`;
      const result = parseBekern(input);

      const notes = result.parts[0].measures[0].elements.filter(
        (e) => e.type === 'note',
      );
      // Spine 0 → staff 1, Spine 1 → staff 2
      expect((notes[0] as any).staff).toBe(1);
      expect((notes[1] as any).staff).toBe(2);
    });
  });

  describe('comments and special tokens', () => {
    test('ignores comment lines starting with !', () => {
      const input = `**kern
! This is a comment
4c
=
*-`;
      const result = parseBekern(input);
      expect(result.parts[0].measures[0].elements).toHaveLength(1);
    });

    test('ignores null tokens (.)', () => {
      const input = `**kern\t**kern
4c\t.
=\t=
*-\t*-`;
      const result = parseBekern(input);
      // Only one note (the dot is a null token)
      const notes = result.parts[0].measures[0].elements.filter(
        (e) => e.type === 'note',
      );
      expect(notes).toHaveLength(1);
    });
  });

  describe('complete hymn-like passage', () => {
    test('parses a simple 4-measure melody', () => {
      const input = `**kern
*clefG2
*k[f#]
*M4/4
4g
4a
4b
4a
=
2g
4f#
4e
=
1d
=
*-`;
      const result = parseBekern(input);
      const part = result.parts[0];

      expect(part.measures).toHaveLength(3);

      // First measure: attributes + 4 notes
      expect(part.measures[0].attributes?.clef?.[0].sign).toBe('G');
      expect(part.measures[0].attributes?.keySignature?.fifths).toBe(1);
      expect(part.measures[0].attributes?.timeSignature?.beats).toBe(4);
      expect(part.measures[0].elements).toHaveLength(4);

      // Second measure: 3 notes (half + quarter + quarter)
      expect(part.measures[1].elements).toHaveLength(3);

      // Third measure: 1 whole note
      expect(part.measures[2].elements).toHaveLength(1);
      const wholeNote = part.measures[2].elements[0];
      if (wholeNote.type === 'note') {
        expect(wholeNote.duration.noteType).toBe('whole');
        expect(wholeNote.pitch.step).toBe('D');
      }
    });
  });
});
