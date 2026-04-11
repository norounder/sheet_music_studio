/**
 * VexFlowMapper 단위 테스트
 */

import { describe, it, expect } from 'vitest';
import {
  mapPitchToVexKey,
  mapAlterToVexAccidental,
  mapDurationToVexDuration,
  mapClefToVexClef,
  mapKeySignatureToVexKey,
  mapTimeSignatureToVexTime,
  mapArticulationToVex,
  mapOrnamentToVex,
  mapBarlineStyleToVex,
} from './VexFlowMapper';
import type { Pitch, Duration, Clef, KeySignature, TimeSignature } from '@shared/types';

describe('VexFlowMapper', () => {
  describe('mapPitchToVexKey', () => {
    it('should map C4 natural', () => {
      const pitch: Pitch = { step: 'C', octave: 4 };
      expect(mapPitchToVexKey(pitch)).toBe('c/4');
    });

    it('should map Eb5 (flat)', () => {
      const pitch: Pitch = { step: 'E', octave: 5, alter: -1 };
      expect(mapPitchToVexKey(pitch)).toBe('eb/5');
    });

    it('should map F#3 (sharp)', () => {
      const pitch: Pitch = { step: 'F', octave: 3, alter: 1 };
      expect(mapPitchToVexKey(pitch)).toBe('f#/3');
    });

    it('should map Bbb2 (double flat)', () => {
      const pitch: Pitch = { step: 'B', octave: 2, alter: -2 };
      expect(mapPitchToVexKey(pitch)).toBe('bbb/2');
    });

    it('should map A##6 (double sharp)', () => {
      const pitch: Pitch = { step: 'A', octave: 6, alter: 2 };
      expect(mapPitchToVexKey(pitch)).toBe('a##/6');
    });

    it('should handle no alter as natural', () => {
      const pitch: Pitch = { step: 'G', octave: 4, alter: 0 };
      expect(mapPitchToVexKey(pitch)).toBe('g/4');
    });
  });

  describe('mapAlterToVexAccidental', () => {
    it('should return null for no alter', () => {
      expect(mapAlterToVexAccidental(undefined)).toBeNull();
      expect(mapAlterToVexAccidental(0)).toBeNull();
    });

    it('should map flat', () => {
      expect(mapAlterToVexAccidental(-1)).toBe('b');
    });

    it('should map sharp', () => {
      expect(mapAlterToVexAccidental(1)).toBe('#');
    });

    it('should map double flat', () => {
      expect(mapAlterToVexAccidental(-2)).toBe('bb');
    });

    it('should map double sharp', () => {
      expect(mapAlterToVexAccidental(2)).toBe('##');
    });
  });

  describe('mapDurationToVexDuration', () => {
    it('should map quarter note', () => {
      const dur: Duration = { divisions: 1, noteType: 'quarter', dots: 0 };
      expect(mapDurationToVexDuration(dur)).toBe('q');
    });

    it('should map dotted half note', () => {
      const dur: Duration = { divisions: 3, noteType: 'half', dots: 1 };
      expect(mapDurationToVexDuration(dur)).toBe('hd');
    });

    it('should map double-dotted eighth note', () => {
      const dur: Duration = { divisions: 1, noteType: 'eighth', dots: 2 };
      expect(mapDurationToVexDuration(dur)).toBe('8dd');
    });

    it('should map whole note', () => {
      const dur: Duration = { divisions: 4, noteType: 'whole', dots: 0 };
      expect(mapDurationToVexDuration(dur)).toBe('w');
    });

    it('should map 16th note', () => {
      const dur: Duration = { divisions: 1, noteType: '16th', dots: 0 };
      expect(mapDurationToVexDuration(dur)).toBe('16');
    });
  });

  describe('mapClefToVexClef', () => {
    it('should map treble clef', () => {
      const clef: Clef = { sign: 'G', line: 2, staffNumber: 1 };
      expect(mapClefToVexClef(clef)).toBe('treble');
    });

    it('should map bass clef', () => {
      const clef: Clef = { sign: 'F', line: 4, staffNumber: 1 };
      expect(mapClefToVexClef(clef)).toBe('bass');
    });

    it('should map alto clef', () => {
      const clef: Clef = { sign: 'C', line: 3, staffNumber: 1 };
      expect(mapClefToVexClef(clef)).toBe('alto');
    });

    it('should map tenor clef', () => {
      const clef: Clef = { sign: 'C', line: 4, staffNumber: 1 };
      expect(mapClefToVexClef(clef)).toBe('tenor');
    });

    it('should map soprano clef', () => {
      const clef: Clef = { sign: 'C', line: 1, staffNumber: 1 };
      expect(mapClefToVexClef(clef)).toBe('soprano');
    });

    it('should map percussion clef', () => {
      const clef: Clef = { sign: 'percussion', line: 3, staffNumber: 1 };
      expect(mapClefToVexClef(clef)).toBe('percussion');
    });
  });

  describe('mapKeySignatureToVexKey', () => {
    it('should map C major (0 fifths)', () => {
      const ks: KeySignature = { fifths: 0, mode: 'major' };
      expect(mapKeySignatureToVexKey(ks)).toBe('C');
    });

    it('should map G major (1 sharp)', () => {
      const ks: KeySignature = { fifths: 1, mode: 'major' };
      expect(mapKeySignatureToVexKey(ks)).toBe('G');
    });

    it('should map Bb major (2 flats)', () => {
      const ks: KeySignature = { fifths: -2, mode: 'major' };
      expect(mapKeySignatureToVexKey(ks)).toBe('Bb');
    });

    it('should map F# minor (3 sharps)', () => {
      const ks: KeySignature = { fifths: 3, mode: 'minor' };
      expect(mapKeySignatureToVexKey(ks)).toBe('F#');
    });

    it('should map A minor (0 fifths)', () => {
      const ks: KeySignature = { fifths: 0, mode: 'minor' };
      expect(mapKeySignatureToVexKey(ks)).toBe('A');
    });
  });

  describe('mapTimeSignatureToVexTime', () => {
    it('should map 4/4', () => {
      const ts: TimeSignature = { beats: 4, beatType: 4 };
      expect(mapTimeSignatureToVexTime(ts)).toBe('4/4');
    });

    it('should map 3/4', () => {
      const ts: TimeSignature = { beats: 3, beatType: 4 };
      expect(mapTimeSignatureToVexTime(ts)).toBe('3/4');
    });

    it('should map common time', () => {
      const ts: TimeSignature = { beats: 4, beatType: 4, symbol: 'common' };
      expect(mapTimeSignatureToVexTime(ts)).toBe('C');
    });

    it('should map cut time', () => {
      const ts: TimeSignature = { beats: 2, beatType: 2, symbol: 'cut' };
      expect(mapTimeSignatureToVexTime(ts)).toBe('C|');
    });

    it('should map 6/8', () => {
      const ts: TimeSignature = { beats: 6, beatType: 8 };
      expect(mapTimeSignatureToVexTime(ts)).toBe('6/8');
    });
  });

  describe('mapArticulationToVex', () => {
    it('should map staccato', () => {
      expect(mapArticulationToVex('staccato')).toBe('a.');
    });

    it('should map accent', () => {
      expect(mapArticulationToVex('accent')).toBe('a>');
    });

    it('should map fermata', () => {
      expect(mapArticulationToVex('fermata')).toBe('a@a');
    });

    it('should map tenuto', () => {
      expect(mapArticulationToVex('tenuto')).toBe('a-');
    });

    it('should map marcato', () => {
      expect(mapArticulationToVex('marcato')).toBe('a^');
    });
  });

  describe('mapOrnamentToVex', () => {
    it('should map trill', () => {
      expect(mapOrnamentToVex('trill')).toBe('tr');
    });

    it('should map mordent', () => {
      expect(mapOrnamentToVex('mordent')).toBe('mordent');
    });

    it('should map turn', () => {
      expect(mapOrnamentToVex('turn')).toBe('turn');
    });

    it('should map inverted mordent', () => {
      expect(mapOrnamentToVex('inverted-mordent')).toBe('mordent_inverted');
    });

    it('should map shake', () => {
      expect(mapOrnamentToVex('shake')).toBe('shake');
    });
  });

  describe('mapBarlineStyleToVex', () => {
    it('should map regular barline', () => {
      expect(mapBarlineStyleToVex('regular')).toBe(0);
    });

    it('should map double barline', () => {
      expect(mapBarlineStyleToVex('light-light')).toBe(1);
    });

    it('should map final barline', () => {
      expect(mapBarlineStyleToVex('light-heavy')).toBe(2);
    });

    it('should map repeat forward', () => {
      expect(mapBarlineStyleToVex('heavy-light', { direction: 'forward' })).toBe(3);
    });

    it('should map repeat backward', () => {
      expect(mapBarlineStyleToVex('light-heavy', { direction: 'backward' })).toBe(4);
    });

    it('should map none barline', () => {
      expect(mapBarlineStyleToVex('none')).toBe(6);
    });
  });
});
