/**
 * MIDI conversion utilities
 * Converts ScoreData elements to MIDI note events for playback.
 */

import type { ScoreData, Pitch, PitchStep, Duration, NoteElement } from '@shared/types';

/** A scheduled note event for playback */
export interface NoteEvent {
  /** Start time in seconds from beginning */
  time: number;
  /** Duration in seconds */
  duration: number;
  /** MIDI note number (0-127) */
  midiNote: number;
  /** Velocity (0-127) */
  velocity: number;
  /** Source measure index (0-based) */
  measureIndex: number;
  /** Source element index within measure */
  elementIndex: number;
}

/** Playback position for UI synchronization */
export interface PlaybackPosition {
  /** All currently sounding notes: { measureIndex, elementIndex } */
  activeNotes: { measureIndex: number; elementIndex: number }[];
  timeSeconds: number;
}

// ─── Pitch → MIDI ───

const STEP_SEMITONES: Record<PitchStep, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

/** Convert Pitch to MIDI note number (C4 = 60) */
export function pitchToMidiNote(pitch: Pitch): number {
  return (pitch.octave + 1) * 12 + STEP_SEMITONES[pitch.step] + (pitch.alter ?? 0);
}

/** Convert MIDI note number to frequency in Hz */
export function midiNoteToFrequency(midiNote: number): number {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

// ─── Duration → Time ───

/**
 * Convert a division count to seconds given PPQ and BPM.
 * This is the fundamental time calculation:
 *   divisions / ppq = quarter-note beats
 *   seconds = beats * (60 / bpm)
 */
export function divisionsToSeconds(
  divisions: number,
  ppq: number,
  bpm: number,
): number {
  const quarterBeats = divisions / ppq;
  return (quarterBeats * 60) / bpm;
}

const NOTE_TYPE_QUARTERS: Record<string, number> = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  '16th': 0.25,
  '32nd': 0.125,
  '64th': 0.0625,
  '128th': 0.03125,
};

/** Convert Duration to time in seconds given BPM (uses noteType) */
export function durationToSeconds(duration: Duration, bpm: number): number {
  let beats = NOTE_TYPE_QUARTERS[duration.noteType] ?? 1;

  // Apply dots
  let dotValue = beats;
  for (let d = 0; d < duration.dots; d++) {
    dotValue /= 2;
    beats += dotValue;
  }

  // Apply tuplet
  if (duration.tuplet) {
    beats = (beats * duration.tuplet.normalNotes) / duration.tuplet.actualNotes;
  }

  // Beats → seconds: 1 beat (quarter note) = 60/bpm seconds
  return (beats * 60) / bpm;
}

// ─── ScoreData → NoteEvent[] ───

/**
 * Convert ScoreData to a sorted array of NoteEvents for playback.
 * Processes all parts sequentially, handling chords, rests, forward/backup.
 */
export function scoreDataToEvents(
  scoreData: ScoreData,
  bpm: number = 120,
): NoteEvent[] {
  const events: NoteEvent[] = [];

  for (const part of scoreData.parts) {
    let currentTime = 0;
    let currentBpm = bpm;
    let ppq = 1;

    for (let mIdx = 0; mIdx < part.measures.length; mIdx++) {
      const measure = part.measures[mIdx];

      if (measure.attributes?.divisions) {
        ppq = measure.attributes.divisions;
      }

      for (const dir of measure.directions) {
        if (dir.type.kind === 'tempo') {
          currentBpm = dir.type.bpm;
        }
      }

      // Group elements by voice for independent timeline processing.
      // This handles the case where fast-xml-parser reorders elements
      // (all notes first, then backups), breaking the backup-based
      // voice interleaving in MusicXML.
      const voiceGroups = new Map<number, { el: typeof measure.elements[0]; eIdx: number }[]>();

      for (let eIdx = 0; eIdx < measure.elements.length; eIdx++) {
        const el = measure.elements[eIdx];
        if (el.type === 'backup' || el.type === 'forward') continue; // Skip — handled by voice grouping
        const voice = 'voice' in el ? (el as NoteElement).voice : 0;
        if (!voiceGroups.has(voice)) voiceGroups.set(voice, []);
        voiceGroups.get(voice)!.push({ el, eIdx });
      }

      let maxMeasureTime = currentTime;

      // Process each voice independently, all starting from measure start
      for (const [, group] of voiceGroups) {
        let voiceTime = currentTime;
        let lastNoteStart = currentTime;

        for (const { el, eIdx } of group) {
          if (el.type === 'note') {
            const note = el as NoteElement;
            // Skip grace notes (duration=0) — they don't advance timeline
            if (note.graceNote || note.duration.divisions === 0) continue;
            const dur = divisionsToSeconds(note.duration.divisions, ppq, currentBpm);
            const midiNote = pitchToMidiNote(note.pitch);
            const noteTime = note.chord ? lastNoteStart : voiceTime;

            events.push({
              time: noteTime,
              duration: dur,
              midiNote,
              velocity: 80,
              measureIndex: mIdx,
              elementIndex: eIdx,
            });

            if (!note.chord) {
              lastNoteStart = voiceTime;
              voiceTime += dur;
            }
          } else if (el.type === 'rest') {
            voiceTime += divisionsToSeconds(el.duration.divisions, ppq, currentBpm);
          }

          maxMeasureTime = Math.max(maxMeasureTime, voiceTime);
        }
      }

      // Use the maximum time reached (handles multi-voice where backup resets measureTime)
      currentTime = maxMeasureTime;
    }
  }

  return events.sort((a, b) => a.time - b.time);
}

/** Get total playback duration in seconds */
export function getTotalDuration(events: NoteEvent[]): number {
  if (events.length === 0) return 0;
  let maxEnd = 0;
  for (const e of events) {
    maxEnd = Math.max(maxEnd, e.time + e.duration);
  }
  return maxEnd;
}
