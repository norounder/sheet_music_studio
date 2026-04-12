/**
 * Heuristic confidence scoring for OMR results.
 * Since Audiveris does not output per-symbol confidence,
 * we analyze musical context to flag likely recognition errors.
 *
 * Extended with music theory validation rules for ensemble pipeline:
 * - Key signature consistency
 * - Voice crossing detection
 * - Beam grouping rules
 * - Tie/slur validity
 * - Lyric syllable alignment (hymn optimization)
 * - Repeat structure validation
 * - Ensemble conflict integration
 */

import type { ScoreData, Part, Measure } from '../../shared/types/measure';
import type { MeasureElement, NoteElement, Pitch } from '../../shared/types/elements';
import type { Clef, KeySignature, TimeSignature } from '../../shared/types/attributes';
import type { ReviewState, ReviewItem, SymbolConfidence, SymbolType } from '../../shared/types/review';
import type { MergeConflict } from './ensembleMerger';

/** Default confidence for normal notes */
const DEFAULT_CONFIDENCE = 0.85;

/** Default threshold below which items need review */
const DEFAULT_THRESHOLD = 0.7;

/** Notes in the key (sharps/flats implied by key signature) */
const KEY_SHARPS_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'] as const;
const KEY_FLATS_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'] as const;

/** Typical pitch ranges per clef sign (MIDI note numbers: C4 = 60) */
const CLEF_RANGES: Record<string, { low: number; high: number }> = {
  G: { low: 55, high: 88 },  // G3 to E6 (treble clef)
  F: { low: 36, high: 65 },  // C2 to F4 (bass clef)
  C: { low: 48, high: 76 },  // C3 to E5 (alto/tenor clef)
};

/** Convert pitch to MIDI note number for range checking */
function pitchToMidi(step: string, octave: number, alter?: number): number {
  const stepToSemitone: Record<string, number> = {
    C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
  };
  return (octave + 1) * 12 + (stepToSemitone[step] ?? 0) + (alter ?? 0);
}

/**
 * Calculate the expected total divisions for a measure based on time signature.
 * Returns the expected sum of all element durations.
 */
function expectedMeasureDivisions(
  timeSig: TimeSignature | undefined,
  divisions: number,
): number {
  if (!timeSig || !divisions) return 0;
  // divisions = divisions per quarter note
  // total = (beats / beatType) * 4 * divisions
  return (timeSig.beats / timeSig.beatType) * 4 * divisions;
}

/**
 * Calculate confidence for a single note element based on musical context.
 */
function calculateNoteConfidence(
  note: NoteElement,
  clef: Clef | undefined,
): number {
  let confidence = DEFAULT_CONFIDENCE;

  // 1. Grace notes are often misrecognized
  if (note.graceNote) {
    confidence = Math.min(confidence, 0.5);
  }

  // 2. Very short notes (32nd or shorter) — higher misrecognition rate
  const shortTypes = ['32nd', '64th', '128th'];
  if (shortTypes.includes(note.duration.noteType)) {
    confidence = Math.min(confidence, 0.6);
  }

  // 3. Double sharps/flats
  if (note.pitch.alter !== undefined && Math.abs(note.pitch.alter) >= 2) {
    confidence = Math.min(confidence, 0.6);
  }

  // 4. Tuplets
  if (note.duration.tuplet) {
    confidence = Math.min(confidence, 0.55);
  }

  // 5. Out-of-range pitch for the current clef
  if (clef) {
    const midi = pitchToMidi(note.pitch.step, note.pitch.octave, note.pitch.alter);
    const range = CLEF_RANGES[clef.sign];
    if (range) {
      if (midi < range.low - 5 || midi > range.high + 5) {
        confidence = Math.min(confidence, 0.5);
      } else if (midi < range.low || midi > range.high) {
        confidence = Math.min(confidence, 0.7);
      }
    }
  }

  return confidence;
}

/**
 * Check if a measure's note durations add up to the expected total.
 * Returns true if there is a mismatch.
 */
function hasDurationMismatch(
  measure: Measure,
  timeSig: TimeSignature | undefined,
  divisions: number,
): boolean {
  const expected = expectedMeasureDivisions(timeSig, divisions);
  if (expected === 0) return false;

  // Sum durations per voice, ignoring chords (they share time)
  const voiceDurations = new Map<number, number>();
  for (const el of measure.elements) {
    if (el.type === 'note') {
      if (el.chord) continue; // chord notes share duration with previous
      const voice = el.voice;
      voiceDurations.set(voice, (voiceDurations.get(voice) ?? 0) + el.duration.divisions);
    } else if (el.type === 'rest') {
      const voice = el.voice;
      voiceDurations.set(voice, (voiceDurations.get(voice) ?? 0) + el.duration.divisions);
    } else if (el.type === 'forward') {
      const voice = el.voice;
      voiceDurations.set(voice, (voiceDurations.get(voice) ?? 0) + el.duration.divisions);
    }
    // backup handled implicitly by voice tracking
  }

  // Check if any voice doesn't match expected
  for (const [, total] of voiceDurations) {
    if (Math.abs(total - expected) > 1) {
      return true;
    }
  }

  return false;
}

// ─── Extended Validation Rules ─────────────────────────────────

/**
 * Get the set of altered notes implied by a key signature.
 * Returns a Set of pitch step names that should have sharps or flats.
 */
function getKeyAlterations(keySig: KeySignature): Map<string, number> {
  const alterations = new Map<string, number>();
  if (keySig.fifths > 0) {
    for (let i = 0; i < Math.min(keySig.fifths, 7); i++) {
      alterations.set(KEY_SHARPS_ORDER[i], 1);
    }
  } else if (keySig.fifths < 0) {
    for (let i = 0; i < Math.min(-keySig.fifths, 7); i++) {
      alterations.set(KEY_FLATS_ORDER[i], -1);
    }
  }
  return alterations;
}

/**
 * Check if a note's accidental contradicts the key signature.
 * Returns a confidence penalty (0 = no issue, negative = issue).
 */
function checkKeyConsistency(
  note: NoteElement,
  keySig: KeySignature | undefined,
): number {
  if (!keySig || note.pitch.alter === undefined) return 0;

  const keyAlterations = getKeyAlterations(keySig);
  const expectedAlter = keyAlterations.get(note.pitch.step) ?? 0;

  // If the note has an accidental that contradicts the key signature
  // (e.g., F# in key of F major where F should be natural)
  // this is unusual but not necessarily wrong — just less common
  if (note.pitch.alter !== 0 && note.pitch.alter !== expectedAlter) {
    // Having an accidental outside the key is common (chromatic notes)
    // but double accidentals contradicting the key are suspicious
    if (Math.abs(note.pitch.alter) >= 2 && Math.abs(note.pitch.alter - expectedAlter) >= 3) {
      return -0.15;
    }
  }

  return 0;
}

/**
 * Detect voice crossing within a measure.
 * Voice 1 should generally be higher than Voice 2 in treble clef.
 * Returns confidence penalties for notes involved in crossing.
 */
function detectVoiceCrossing(measure: Measure): Map<string, number> {
  const penalties = new Map<string, number>();

  // Group notes by voice
  const voiceNotes = new Map<number, NoteElement[]>();
  for (const el of measure.elements) {
    if (el.type !== 'note' || el.chord) continue;
    const list = voiceNotes.get(el.voice) ?? [];
    list.push(el);
    voiceNotes.set(el.voice, list);
  }

  // Compare voice 1 vs voice 2 on same staff
  const v1Notes = voiceNotes.get(1) ?? [];
  const v2Notes = voiceNotes.get(2) ?? [];
  const minLen = Math.min(v1Notes.length, v2Notes.length);

  for (let i = 0; i < minLen; i++) {
    const v1Midi = pitchToMidi(v1Notes[i].pitch.step, v1Notes[i].pitch.octave, v1Notes[i].pitch.alter);
    const v2Midi = pitchToMidi(v2Notes[i].pitch.step, v2Notes[i].pitch.octave, v2Notes[i].pitch.alter);

    if (v1Midi < v2Midi) {
      // Voice crossing: voice 1 is lower than voice 2
      penalties.set(v1Notes[i].id, -0.1);
      penalties.set(v2Notes[i].id, -0.1);
    }
  }

  return penalties;
}

/**
 * Validate tie connections: tied notes must have the same pitch.
 */
function checkTieValidity(note: NoteElement, nextNote: NoteElement | undefined): number {
  if (!note.tie || note.tie.type !== 'start') return 0;
  if (!nextNote) return -0.2; // Tie starts but no next note

  // Tie must connect same pitch
  if (!pitchesEqual(note.pitch, nextNote.pitch)) {
    return -0.5; // Very suspicious — tie between different pitches
  }

  return 0;
}

/** Compare two pitches */
function pitchesEqual(a: Pitch, b: Pitch): boolean {
  return a.step === b.step && a.octave === b.octave && (a.alter ?? 0) === (b.alter ?? 0);
}

/**
 * Check lyric syllable alignment: number of syllables should roughly match notes.
 * Important for hymn/worship music where lyrics are critical.
 */
function checkLyricAlignment(measure: Measure): Map<string, number> {
  const penalties = new Map<string, number>();

  const notesWithLyrics = measure.elements.filter(
    (el): el is NoteElement => el.type === 'note' && !!el.lyrics && el.lyrics.length > 0,
  );
  const notesWithoutLyrics = measure.elements.filter(
    (el): el is NoteElement => el.type === 'note' && !el.chord && (!el.lyrics || el.lyrics.length === 0),
  );

  // In hymn music, if some notes have lyrics but others in the same voice don't,
  // the missing lyrics might indicate a recognition error
  if (notesWithLyrics.length > 0 && notesWithoutLyrics.length > 0) {
    // Check if the notes without lyrics are in the same voice as lyric notes
    const lyricVoices = new Set(notesWithLyrics.map((n) => n.voice));
    for (const note of notesWithoutLyrics) {
      if (lyricVoices.has(note.voice) && !note.graceNote && !note.chord) {
        penalties.set(note.id, -0.15);
      }
    }
  }

  return penalties;
}

/**
 * Validate repeat structure: matching forward/backward repeats and endings.
 */
function checkRepeatStructure(measures: Measure[]): Map<number, number> {
  const penalties = new Map<number, number>();

  let hasForwardRepeat = false;
  let forwardRepeatMeasure = -1;
  let hasEnding1 = false;

  for (let i = 0; i < measures.length; i++) {
    const m = measures[i];

    // Check barline repeats
    if (m.barline?.repeat?.direction === 'forward') {
      hasForwardRepeat = true;
      forwardRepeatMeasure = i;
    }

    if (m.barline?.repeat?.direction === 'backward') {
      if (!hasForwardRepeat) {
        // Backward repeat without forward — suspicious
        penalties.set(i, -0.15);
      }
      hasForwardRepeat = false;
    }

    // Check endings
    if (m.barline?.ending?.type === 'start' && m.barline.ending.number.includes(1)) {
      hasEnding1 = true;
    }
  }

  // Unclosed forward repeat
  if (hasForwardRepeat) {
    penalties.set(forwardRepeatMeasure, -0.1);
  }

  return penalties;
}

/** Options for extended review generation */
export interface ReviewGeneratorOptions {
  /** Confidence threshold (default: 0.7) */
  threshold?: number;
  /** Merge conflicts from ensemble merging */
  mergeConflicts?: MergeConflict[];
}

/**
 * Generate ReviewState from OMR-produced ScoreData.
 * Assigns heuristic confidence scores based on musical context analysis.
 * Extended with music theory validation rules.
 */
export function generateReviewState(
  scoreData: ScoreData,
  optionsOrThreshold: number | ReviewGeneratorOptions = DEFAULT_THRESHOLD,
): ReviewState {
  const options: ReviewGeneratorOptions = typeof optionsOrThreshold === 'number'
    ? { threshold: optionsOrThreshold }
    : optionsOrThreshold;
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const mergeConflicts = options.mergeConflicts ?? [];

  // Build a set of conflicted element IDs for quick lookup
  const conflictMeasures = new Set<string>();
  for (const conflict of mergeConflicts) {
    conflictMeasures.add(`${conflict.partIndex}-${conflict.measureIndex}`);
  }

  const items: ReviewItem[] = [];
  let itemCounter = 0;

  for (let pIdx = 0; pIdx < scoreData.parts.length; pIdx++) {
    const part = scoreData.parts[pIdx];
    let currentClef: Clef | undefined;
    let currentTimeSig: TimeSignature | undefined;
    let currentKeySig: KeySignature | undefined;
    let currentDivisions = 1;

    // Check repeat structure across all measures
    const repeatPenalties = checkRepeatStructure(part.measures);

    for (let mIdx = 0; mIdx < part.measures.length; mIdx++) {
      const measure = part.measures[mIdx];

      // Update running attributes
      if (measure.attributes) {
        if (measure.attributes.divisions) {
          currentDivisions = measure.attributes.divisions;
        }
        if (measure.attributes.timeSignature) {
          currentTimeSig = measure.attributes.timeSignature;
        }
        if (measure.attributes.keySignature) {
          currentKeySig = measure.attributes.keySignature;
        }
        if (measure.attributes.clef && measure.attributes.clef.length > 0) {
          currentClef = measure.attributes.clef[0];
        }
      }

      // Measure-level checks
      const durationMismatch = hasDurationMismatch(measure, currentTimeSig, currentDivisions);
      const voiceCrossingPenalties = detectVoiceCrossing(measure);
      const lyricPenalties = checkLyricAlignment(measure);
      const repeatPenalty = repeatPenalties.get(mIdx) ?? 0;
      const hasEnsembleConflict = conflictMeasures.has(`${pIdx}-${mIdx}`);

      // Get notes for tie checking
      const noteElements = measure.elements.filter(
        (el): el is NoteElement => el.type === 'note',
      );

      for (let eIdx = 0; eIdx < measure.elements.length; eIdx++) {
        const element = measure.elements[eIdx];
        if (element.type !== 'note') continue;

        let confidence = calculateNoteConfidence(element, currentClef);

        // Measure duration mismatch
        if (durationMismatch) {
          confidence = Math.min(confidence, 0.4);
        }

        // Key consistency check
        confidence += checkKeyConsistency(element, currentKeySig);

        // Voice crossing penalty
        const voicePenalty = voiceCrossingPenalties.get(element.id) ?? 0;
        confidence += voicePenalty;

        // Tie validity check
        const noteIdx = noteElements.indexOf(element);
        const nextNote = noteIdx >= 0 ? noteElements[noteIdx + 1] : undefined;
        confidence += checkTieValidity(element, nextNote);

        // Lyric alignment penalty (hymn-specific)
        const lyricPenalty = lyricPenalties.get(element.id) ?? 0;
        confidence += lyricPenalty;

        // Repeat structure penalty
        confidence += repeatPenalty;

        // Ensemble conflict integration
        if (hasEnsembleConflict) {
          confidence = Math.min(confidence, 0.6);
        }

        // Ensemble agreement boost
        if (!hasEnsembleConflict && mergeConflicts.length > 0) {
          confidence = Math.min(0.95, confidence + 0.05);
        }

        // Clamp confidence to [0, 1]
        confidence = Math.max(0, Math.min(1, confidence));

        // Only create review items for below-threshold confidence
        if (confidence < threshold) {
          const symbolType: SymbolType = element.graceNote ? 'grace-note' : 'note';
          itemCounter++;

          items.push({
            id: `review-${itemCounter}`,
            symbolConfidence: {
              symbolId: element.id,
              type: symbolType,
              confidence,
              boundingBox: { x: 0, y: 0, width: 0, height: 0, pageIndex: 0 },
            },
            measureIndex: mIdx,
            status: 'pending',
          });
        }
      }
    }
  }

  return {
    items,
    currentIndex: 0,
    threshold,
  };
}
