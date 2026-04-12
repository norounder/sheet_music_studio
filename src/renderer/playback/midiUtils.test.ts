import { describe, it, expect } from 'vitest';
import type { NoteElement, RestElement } from '@shared/types';
import type { Backup } from '@shared/types';
import {
  pitchToMidiNote,
  midiNoteToFrequency,
  durationToSeconds,
  divisionsToSeconds,
  scoreDataToEvents,
  getTotalDuration,
} from './midiUtils';

describe('midiUtils', () => {
  describe('pitchToMidiNote', () => {
    it('C4 = 60', () => {
      expect(pitchToMidiNote({ step: 'C', octave: 4 })).toBe(60);
    });

    it('A4 = 69', () => {
      expect(pitchToMidiNote({ step: 'A', octave: 4 })).toBe(69);
    });

    it('C5 = 72', () => {
      expect(pitchToMidiNote({ step: 'C', octave: 5 })).toBe(72);
    });

    it('C#4 = 61', () => {
      expect(pitchToMidiNote({ step: 'C', octave: 4, alter: 1 })).toBe(61);
    });

    it('Bb3 = 58', () => {
      expect(pitchToMidiNote({ step: 'B', octave: 3, alter: -1 })).toBe(58);
    });
  });

  describe('midiNoteToFrequency', () => {
    it('A4 = 440 Hz', () => {
      expect(midiNoteToFrequency(69)).toBeCloseTo(440);
    });

    it('C4 ≈ 261.63 Hz', () => {
      expect(midiNoteToFrequency(60)).toBeCloseTo(261.63, 1);
    });
  });

  describe('durationToSeconds', () => {
    it('quarter note at 120 BPM = 0.5s', () => {
      expect(durationToSeconds(
        { divisions: 1, noteType: 'quarter', dots: 0 },
        120,
      )).toBeCloseTo(0.5);
    });

    it('half note at 120 BPM = 1.0s', () => {
      expect(durationToSeconds(
        { divisions: 2, noteType: 'half', dots: 0 },
        120,
      )).toBeCloseTo(1.0);
    });

    it('whole note at 60 BPM = 4.0s', () => {
      expect(durationToSeconds(
        { divisions: 4, noteType: 'whole', dots: 0 },
        60,
      )).toBeCloseTo(4.0);
    });

    it('dotted quarter at 120 BPM = 0.75s', () => {
      expect(durationToSeconds(
        { divisions: 1, noteType: 'quarter', dots: 1 },
        120,
      )).toBeCloseTo(0.75);
    });

    it('eighth note at 120 BPM = 0.25s', () => {
      expect(durationToSeconds(
        { divisions: 1, noteType: 'eighth', dots: 0 },
        120,
      )).toBeCloseTo(0.25);
    });
  });

  describe('scoreDataToEvents', () => {
    it('should convert a simple C major scale', () => {
      const sd = {
        parts: [{
          id: 'P1', name: 'Piano', staves: 1,
          measures: [{
            number: 1,
            attributes: { divisions: 1 },
            elements: [
              { type: 'note', id: 'n1', pitch: { step: 'C', octave: 4 }, duration: { divisions: 1, noteType: 'quarter', dots: 0 }, voice: 1, staff: 1 } as NoteElement,
              { type: 'note', id: 'n2', pitch: { step: 'D', octave: 4 }, duration: { divisions: 1, noteType: 'quarter', dots: 0 }, voice: 1, staff: 1 } as NoteElement,
            ],
            directions: [],
          }],
        }],
      };

      const events = scoreDataToEvents(sd, 120);
      expect(events).toHaveLength(2);
      expect(events[0].midiNote).toBe(60); // C4
      expect(events[0].time).toBeCloseTo(0);
      expect(events[0].duration).toBeCloseTo(0.5);
      expect(events[1].midiNote).toBe(62); // D4
      expect(events[1].time).toBeCloseTo(0.5);
    });

    it('should handle rests (silence)', () => {
      const sd = {
        parts: [{
          id: 'P1', name: 'Piano', staves: 1,
          measures: [{
            number: 1,
            elements: [
              { type: 'note', id: 'n1', pitch: { step: 'C', octave: 4 }, duration: { divisions: 1, noteType: 'quarter', dots: 0 }, voice: 1, staff: 1 } as NoteElement,
              { type: 'rest', id: 'r1', duration: { divisions: 1, noteType: 'quarter', dots: 0 }, voice: 1, staff: 1 } as RestElement,
              { type: 'note', id: 'n2', pitch: { step: 'E', octave: 4 }, duration: { divisions: 1, noteType: 'quarter', dots: 0 }, voice: 1, staff: 1 } as NoteElement,
            ],
            directions: [],
          }],
        }],
      };

      const events = scoreDataToEvents(sd, 120);
      expect(events).toHaveLength(2); // rest produces no event
      expect(events[1].time).toBeCloseTo(1.0); // C(0.5s) + rest(0.5s)
    });

    it('should handle multi-voice with backup (piano left+right hand)', () => {
      // Piano: right hand C4 quarter, then backup, then left hand C3 quarter
      // Both should play at time 0
      const sd = {
        parts: [{
          id: 'P1', name: 'Piano', staves: 2,
          measures: [{
            number: 1,
            attributes: { divisions: 1, timeSignature: { beats: 4, beatType: 4 } },
            elements: [
              // Right hand (voice 1)
              { type: 'note', id: 'rh1', pitch: { step: 'C', octave: 4 }, duration: { divisions: 1, noteType: 'quarter', dots: 0 }, voice: 1, staff: 1 } as NoteElement,
              { type: 'note', id: 'rh2', pitch: { step: 'D', octave: 4 }, duration: { divisions: 1, noteType: 'quarter', dots: 0 }, voice: 1, staff: 1 } as NoteElement,
              // Backup to start of measure
              { type: 'backup', duration: { divisions: 2, noteType: 'half', dots: 0 } } as Backup,
              // Left hand (voice 2)
              { type: 'note', id: 'lh1', pitch: { step: 'C', octave: 3 }, duration: { divisions: 1, noteType: 'quarter', dots: 0 }, voice: 2, staff: 2 } as NoteElement,
              { type: 'note', id: 'lh2', pitch: { step: 'G', octave: 3 }, duration: { divisions: 1, noteType: 'quarter', dots: 0 }, voice: 2, staff: 2 } as NoteElement,
            ],
            directions: [],
          }],
        }],
      };

      const events = scoreDataToEvents(sd, 120);
      expect(events).toHaveLength(4);

      // Sort by time, then midiNote
      events.sort((a, b) => a.time - b.time || a.midiNote - b.midiNote);

      // Right hand C4 and left hand C3 should both start at time 0
      const atTime0 = events.filter(e => Math.abs(e.time) < 0.01);
      expect(atTime0).toHaveLength(2);
      expect(atTime0.map(e => e.midiNote).sort()).toEqual([48, 60]); // C3=48, C4=60

      // Second beat notes should both be at time 0.5
      const atTime05 = events.filter(e => Math.abs(e.time - 0.5) < 0.01);
      expect(atTime05).toHaveLength(2);
    });

    it('should handle chords (same time)', () => {
      const sd = {
        parts: [{
          id: 'P1', name: 'Piano', staves: 1,
          measures: [{
            number: 1,
            elements: [
              { type: 'note', id: 'n1', pitch: { step: 'C', octave: 4 }, duration: { divisions: 1, noteType: 'quarter', dots: 0 }, voice: 1, staff: 1 } as NoteElement,
              { type: 'note', id: 'n2', pitch: { step: 'E', octave: 4 }, duration: { divisions: 1, noteType: 'quarter', dots: 0 }, voice: 1, staff: 1, chord: true } as NoteElement,
            ],
            directions: [],
          }],
        }],
      };

      const events = scoreDataToEvents(sd, 120);
      expect(events).toHaveLength(2);
      expect(events[0].time).toBeCloseTo(0);
      expect(events[1].time).toBeCloseTo(0); // chord: same time
    });

    it('should apply dynamic velocity from directions', () => {
      const sd = {
        parts: [{
          id: 'P1', name: 'Piano', staves: 1,
          measures: [
            {
              number: 1,
              elements: [
                { type: 'note', id: 'n1', pitch: { step: 'C', octave: 4 }, duration: { divisions: 1, noteType: 'quarter', dots: 0 }, voice: 1, staff: 1 } as NoteElement,
                { type: 'note', id: 'n2', pitch: { step: 'D', octave: 4 }, duration: { divisions: 1, noteType: 'quarter', dots: 0 }, voice: 1, staff: 1 } as NoteElement,
              ],
              directions: [
                { type: { kind: 'dynamic' as const, value: 'pp' as const }, placement: 'below' as const },
              ],
            },
            {
              number: 2,
              elements: [
                { type: 'note', id: 'n3', pitch: { step: 'E', octave: 4 }, duration: { divisions: 1, noteType: 'quarter', dots: 0 }, voice: 1, staff: 1 } as NoteElement,
              ],
              directions: [
                { type: { kind: 'dynamic' as const, value: 'ff' as const }, placement: 'below' as const },
              ],
            },
          ],
        }],
      };

      const events = scoreDataToEvents(sd, 120);
      // pp = 35
      expect(events[0].velocity).toBe(35);
      expect(events[1].velocity).toBe(35);
      // ff = 115
      expect(events[2].velocity).toBe(115);
    });

    it('should interpolate velocity during crescendo', () => {
      const sd = {
        parts: [{
          id: 'P1', name: 'Piano', staves: 1,
          measures: [
            {
              number: 1,
              elements: [
                { type: 'note', id: 'n1', pitch: { step: 'C', octave: 4 }, duration: { divisions: 1, noteType: 'quarter', dots: 0 }, voice: 1, staff: 1 } as NoteElement,
                { type: 'note', id: 'n2', pitch: { step: 'D', octave: 4 }, duration: { divisions: 1, noteType: 'quarter', dots: 0 }, voice: 1, staff: 1 } as NoteElement,
              ],
              directions: [
                { type: { kind: 'dynamic' as const, value: 'p' as const }, placement: 'below' as const },
                { type: { kind: 'wedge' as const, value: { type: 'crescendo' as const } }, placement: 'below' as const },
              ],
            },
          ],
        }],
      };

      const events = scoreDataToEvents(sd, 120);
      // First note at start of crescendo (p=50)
      expect(events[0].velocity).toBe(50);
      // Second note should be louder (interpolated)
      expect(events[1].velocity).toBeGreaterThan(events[0].velocity);
    });
  });

  describe('getTotalDuration', () => {
    it('should return max end time', () => {
      const events = [
        { time: 0, duration: 0.5, midiNote: 60, velocity: 80, measureIndex: 0, elementIndex: 0 },
        { time: 0.5, duration: 1.0, midiNote: 62, velocity: 80, measureIndex: 0, elementIndex: 1 },
      ];
      expect(getTotalDuration(events)).toBeCloseTo(1.5);
    });

    it('should return 0 for empty events', () => {
      expect(getTotalDuration([])).toBe(0);
    });
  });
});
