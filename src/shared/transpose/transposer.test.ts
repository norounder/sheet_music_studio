import { describe, it, expect } from 'vitest';
import type { ScoreData, NoteElement, RestElement, Pitch, KeySignature } from '../types';
import {
  pitchToAbsoluteSemitone,
  absoluteSemitoneToPitch,
  transposePitch,
  transposeKeySignature,
  transposeScoreData,
  detectKey,
  getTargetKey,
} from './transposer';

describe('transposer', () => {
  describe('pitchToAbsoluteSemitone', () => {
    it('C4 = 48', () => {
      expect(pitchToAbsoluteSemitone({ step: 'C', octave: 4 })).toBe(48);
    });

    it('A4 = 57', () => {
      expect(pitchToAbsoluteSemitone({ step: 'A', octave: 4 })).toBe(57);
    });

    it('C#4 = 49', () => {
      expect(pitchToAbsoluteSemitone({ step: 'C', octave: 4, alter: 1 })).toBe(49);
    });

    it('Bb3 = 46', () => {
      expect(pitchToAbsoluteSemitone({ step: 'B', octave: 3, alter: -1 })).toBe(46);
    });
  });

  describe('absoluteSemitoneToPitch', () => {
    it('48 → C4 (sharp)', () => {
      const p = absoluteSemitoneToPitch(48, true);
      expect(p.step).toBe('C');
      expect(p.octave).toBe(4);
      expect(p.alter).toBeUndefined();
    });

    it('49 → C#4 (sharp) or Db4 (flat)', () => {
      const sharp = absoluteSemitoneToPitch(49, true);
      expect(sharp.step).toBe('C');
      expect(sharp.alter).toBe(1);

      const flat = absoluteSemitoneToPitch(49, false);
      expect(flat.step).toBe('D');
      expect(flat.alter).toBe(-1);
    });

    it('60 → C5', () => {
      const p = absoluteSemitoneToPitch(60, true);
      expect(p.step).toBe('C');
      expect(p.octave).toBe(5);
    });
  });

  describe('transposePitch', () => {
    it('C4 +2 semitones = D4', () => {
      const result = transposePitch({ step: 'C', octave: 4 }, 2, 2);
      expect(result.step).toBe('D');
      expect(result.octave).toBe(4);
    });

    it('B4 +1 semitone = C5', () => {
      const result = transposePitch({ step: 'B', octave: 4 }, 1, 0);
      expect(result.step).toBe('C');
      expect(result.octave).toBe(5);
    });

    it('C4 -1 semitone = B3', () => {
      const result = transposePitch({ step: 'C', octave: 4 }, -1, 0);
      expect(result.step).toBe('B');
      expect(result.octave).toBe(3);
    });

    it('E4 +1 semitone (sharp key) = F4', () => {
      const result = transposePitch({ step: 'E', octave: 4 }, 1, 1);
      expect(result.step).toBe('F');
      expect(result.octave).toBe(4);
    });

    it('F#4 in flat context → Gb4', () => {
      const result = transposePitch({ step: 'F', octave: 4, alter: 1 }, 0, -3);
      // F# = semitone 6 → flat context → Gb
      expect(result.step).toBe('G');
      expect(result.alter).toBe(-1);
    });
  });

  describe('transposeKeySignature', () => {
    it('C major +2 semitones = D major (2 sharps)', () => {
      const result = transposeKeySignature({ fifths: 0, mode: 'major' }, 2);
      expect(result.fifths).toBe(2);
      expect(result.mode).toBe('major');
    });

    it('C major +7 semitones = G major (1 sharp)', () => {
      const result = transposeKeySignature({ fifths: 0, mode: 'major' }, 7);
      expect(result.fifths).toBe(1);
    });

    it('C major +5 semitones = F major (1 flat)', () => {
      const result = transposeKeySignature({ fifths: 0, mode: 'major' }, 5);
      expect(result.fifths).toBe(-1);
    });

    it('G major +5 semitones = C major', () => {
      const result = transposeKeySignature({ fifths: 1, mode: 'major' }, 5);
      expect(result.fifths).toBe(0);
    });

    it('preserves mode (minor)', () => {
      const result = transposeKeySignature({ fifths: 0, mode: 'minor' }, 3);
      expect(result.mode).toBe('minor');
    });
  });

  describe('transposeScoreData', () => {
    function makeTestScore(): ScoreData {
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
                  keySignature: { fifths: 0, mode: 'major' },
                  timeSignature: { beats: 4, beatType: 4 },
                  clef: [{ sign: 'G', line: 2, staffNumber: 1 }],
                },
                elements: [
                  { type: 'note', id: 'n1', pitch: { step: 'C', octave: 4 }, duration: { divisions: 1, noteType: 'quarter', dots: 0 }, voice: 1, staff: 1 } as NoteElement,
                  { type: 'note', id: 'n2', pitch: { step: 'E', octave: 4 }, duration: { divisions: 1, noteType: 'quarter', dots: 0 }, voice: 1, staff: 1 } as NoteElement,
                  { type: 'note', id: 'n3', pitch: { step: 'G', octave: 4 }, duration: { divisions: 1, noteType: 'quarter', dots: 0 }, voice: 1, staff: 1 } as NoteElement,
                  { type: 'note', id: 'n4', pitch: { step: 'C', octave: 5 }, duration: { divisions: 1, noteType: 'quarter', dots: 0 }, voice: 1, staff: 1 } as NoteElement,
                ],
                directions: [],
              },
              {
                number: 2,
                elements: [
                  { type: 'note', id: 'n5', pitch: { step: 'D', octave: 4 }, duration: { divisions: 1, noteType: 'quarter', dots: 0 }, voice: 1, staff: 1 } as NoteElement,
                  { type: 'rest', id: 'r1', duration: { divisions: 1, noteType: 'quarter', dots: 0 }, voice: 1, staff: 1 },
                ],
                directions: [],
              },
            ],
          },
        ],
        credits: [{ type: 'title', text: 'Test Score' }],
      };
    }

    it('should transpose all notes by +2 semitones (C→D major)', () => {
      const sd = makeTestScore();
      const result = transposeScoreData(sd, 2);

      const n1 = result.parts[0].measures[0].elements[0] as NoteElement;
      expect(n1.pitch.step).toBe('D');
      expect(n1.pitch.octave).toBe(4);

      const n2 = result.parts[0].measures[0].elements[1] as NoteElement;
      expect(n2.pitch.step).toBe('F');
      expect(n2.pitch.alter).toBe(1); // F#

      const key = result.parts[0].measures[0].attributes?.keySignature;
      expect(key?.fifths).toBe(2); // D major
    });

    it('should not modify rests', () => {
      const sd = makeTestScore();
      const result = transposeScoreData(sd, 5);
      expect(result.parts[0].measures[1].elements[1].type).toBe('rest');
    });

    it('should not modify original scoreData (immutability)', () => {
      const sd = makeTestScore();
      transposeScoreData(sd, 3);
      expect((sd.parts[0].measures[0].elements[0] as NoteElement).pitch.step).toBe('C');
    });

    it('should return same data for 0 semitones', () => {
      const sd = makeTestScore();
      const result = transposeScoreData(sd, 0);
      expect(result).toBe(sd);
    });

    it('round-trip: +N then -N = original pitches', () => {
      const sd = makeTestScore();
      const up = transposeScoreData(sd, 5);
      const roundTrip = transposeScoreData(up, -5);

      const origNotes = sd.parts[0].measures[0].elements.filter(
        (e) => e.type === 'note',
      ) as NoteElement[];
      const rtNotes = roundTrip.parts[0].measures[0].elements.filter(
        (e) => e.type === 'note',
      ) as NoteElement[];

      for (let i = 0; i < origNotes.length; i++) {
        expect(pitchToAbsoluteSemitone(rtNotes[i].pitch)).toBe(
          pitchToAbsoluteSemitone(origNotes[i].pitch),
        );
      }
    });

    it('round-trip: key signature preserved', () => {
      const sd = makeTestScore();
      const up = transposeScoreData(sd, 7);
      const roundTrip = transposeScoreData(up, -7);

      const origKey = sd.parts[0].measures[0].attributes?.keySignature;
      const rtKey = roundTrip.parts[0].measures[0].attributes?.keySignature;
      expect(rtKey?.fifths).toBe(origKey?.fifths);
    });

    it('should transpose only specified measure range', () => {
      const sd = makeTestScore();
      const result = transposeScoreData(sd, 2, 1, 1);

      // Measure 1: transposed
      const n1 = result.parts[0].measures[0].elements[0] as NoteElement;
      expect(n1.pitch.step).toBe('D');

      // Measure 2: NOT transposed
      const n5 = result.parts[0].measures[1].elements[0] as NoteElement;
      expect(n5.pitch.step).toBe('D'); // unchanged
    });

    it('should handle +12 semitones (full octave up)', () => {
      const sd = makeTestScore();
      const result = transposeScoreData(sd, 12);

      const n1 = result.parts[0].measures[0].elements[0] as NoteElement;
      expect(n1.pitch.step).toBe('C');
      expect(n1.pitch.octave).toBe(5); // one octave up
    });

    it('round-trip: all 12 semitone offsets preserve absolute pitch', () => {
      const sd = makeTestScore();
      for (let semi = -11; semi <= 11; semi++) {
        if (semi === 0) continue;
        const up = transposeScoreData(sd, semi);
        const rt = transposeScoreData(up, -semi);

        const origNotes = sd.parts[0].measures[0].elements
          .filter((e) => e.type === 'note') as NoteElement[];
        const rtNotes = rt.parts[0].measures[0].elements
          .filter((e) => e.type === 'note') as NoteElement[];

        for (let i = 0; i < origNotes.length; i++) {
          expect(
            pitchToAbsoluteSemitone(rtNotes[i].pitch),
            `semitones=${semi}, note index=${i}`,
          ).toBe(pitchToAbsoluteSemitone(origNotes[i].pitch));
        }
      }
    });

    it('round-trip: key signature restored for all 12 offsets', () => {
      const sd = makeTestScore();
      for (let semi = -11; semi <= 11; semi++) {
        if (semi === 0) continue;
        const up = transposeScoreData(sd, semi);
        const rt = transposeScoreData(up, -semi);

        const origKey = sd.parts[0].measures[0].attributes?.keySignature;
        const rtKey = rt.parts[0].measures[0].attributes?.keySignature;
        expect(rtKey?.fifths, `semitones=${semi}`).toBe(origKey?.fifths);
      }
    });

    it('partial range round-trip: untouched measures remain identical', () => {
      const sd = makeTestScore();
      const up = transposeScoreData(sd, 3, 1, 1); // only measure 1
      const rt = transposeScoreData(up, -3, 1, 1);

      // Measure 2 should never have changed
      const origM2 = sd.parts[0].measures[1].elements[0] as NoteElement;
      const upM2 = up.parts[0].measures[1].elements[0] as NoteElement;
      const rtM2 = rt.parts[0].measures[1].elements[0] as NoteElement;

      expect(upM2.pitch.step).toBe(origM2.pitch.step);
      expect(rtM2.pitch.step).toBe(origM2.pitch.step);
    });

    it('should preserve element count and rest types through transpose', () => {
      const sd = makeTestScore();
      const result = transposeScoreData(sd, 7);

      const m2els = result.parts[0].measures[1].elements;
      expect(m2els).toHaveLength(2);
      expect(m2els[1].type).toBe('rest');
      expect(m2els[1].duration.noteType).toBe('quarter');
    });

    it('multi-part: transpose affects all parts', () => {
      const multiPart: ScoreData = {
        parts: [
          {
            id: 'P1', name: 'Violin', staves: 1,
            measures: [{
              number: 1,
              attributes: { divisions: 1, keySignature: { fifths: 0, mode: 'major' as const } },
              elements: [
                { type: 'note', id: 'v1', pitch: { step: 'C', octave: 5 }, duration: { divisions: 1, noteType: 'quarter', dots: 0 }, voice: 1, staff: 1 } as NoteElement,
              ],
              directions: [],
            }],
          },
          {
            id: 'P2', name: 'Cello', staves: 1,
            measures: [{
              number: 1,
              attributes: { divisions: 1, keySignature: { fifths: 0, mode: 'major' as const } },
              elements: [
                { type: 'note', id: 'c1', pitch: { step: 'C', octave: 3 }, duration: { divisions: 1, noteType: 'quarter', dots: 0 }, voice: 1, staff: 1 } as NoteElement,
              ],
              directions: [],
            }],
          },
        ],
      };

      const result = transposeScoreData(multiPart, 2);
      expect((result.parts[0].measures[0].elements[0] as NoteElement).pitch.step).toBe('D');
      expect((result.parts[1].measures[0].elements[0] as NoteElement).pitch.step).toBe('D');
      expect(result.parts[0].measures[0].attributes?.keySignature?.fifths).toBe(2);
      expect(result.parts[1].measures[0].attributes?.keySignature?.fifths).toBe(2);
    });
  });

  describe('detectKey', () => {
    it('should detect explicit key signature from first measure', () => {
      const sd: ScoreData = {
        parts: [{
          id: 'P1', name: 'Piano', staves: 1,
          measures: [{
            number: 1,
            attributes: { divisions: 1, keySignature: { fifths: 2, mode: 'major' } },
            elements: [],
            directions: [],
          }],
        }],
      };
      const key = detectKey(sd);
      expect(key.fifths).toBe(2);
      expect(key.mode).toBe('major');
    });

    it('should infer C major from C major scale notes when no key signature', () => {
      const sd: ScoreData = {
        parts: [{
          id: 'P1', name: 'Piano', staves: 1,
          measures: [{
            number: 1,
            elements: [
              { type: 'note', id: 'n1', pitch: { step: 'C', octave: 4 }, duration: { divisions: 4, noteType: 'whole', dots: 0 }, voice: 1, staff: 1 } as NoteElement,
              { type: 'note', id: 'n2', pitch: { step: 'E', octave: 4 }, duration: { divisions: 4, noteType: 'whole', dots: 0 }, voice: 1, staff: 1 } as NoteElement,
              { type: 'note', id: 'n3', pitch: { step: 'G', octave: 4 }, duration: { divisions: 4, noteType: 'whole', dots: 0 }, voice: 1, staff: 1 } as NoteElement,
            ],
            directions: [],
          }],
        }],
      };
      const key = detectKey(sd);
      expect(key.fifths).toBe(0); // C major
    });

    it('should return C major for empty score (no notes)', () => {
      const sd: ScoreData = {
        parts: [{
          id: 'P1', name: 'Piano', staves: 1,
          measures: [{ number: 1, elements: [], directions: [] }],
        }],
      };
      const key = detectKey(sd);
      expect(key.fifths).toBe(0);
    });
  });

  describe('getTargetKey', () => {
    it('should calculate target key from source + semitones', () => {
      const result = getTargetKey({ fifths: 0, mode: 'major' }, 2);
      expect(result.fifths).toBe(2); // D major
      expect(result.mode).toBe('major');
    });

    it('should handle negative semitones', () => {
      const result = getTargetKey({ fifths: 0, mode: 'major' }, -1);
      // C major -1 semitone = B major (5 sharps), enharmonic to Cb major (-7 flats)
      // transposeKeySignature normalizes to [-7, 7], preferring sharps
      expect(result.fifths).toBe(5);
      expect(result.fifths).toBeGreaterThanOrEqual(-7);
      expect(result.fifths).toBeLessThanOrEqual(7);
    });

    it('should preserve mode', () => {
      const result = getTargetKey({ fifths: 0, mode: 'minor' }, 5);
      expect(result.mode).toBe('minor');
    });

    it('round-trip: getTargetKey(source, N) then getTargetKey(result, -N) = source', () => {
      for (let semi = -11; semi <= 11; semi++) {
        if (semi === 0) continue;
        const source: KeySignature = { fifths: 0, mode: 'major' };
        const target = getTargetKey(source, semi);
        const roundTrip = getTargetKey(target, -semi);
        expect(roundTrip.fifths, `semitones=${semi}`).toBe(source.fifths);
      }
    });
  });
});
